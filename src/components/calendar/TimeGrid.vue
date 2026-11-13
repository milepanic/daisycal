<script setup lang="ts">
/**
 * Day/work-week/week grid: sticky day headers with the all-day row, hour labels, one column
 * per day with positioned events, due tasks, the current-time line and pointer interactions:
 *  - click or drag on empty space selects a time slot and opens the create popup
 *  - drag a chip to move it (also across days), drag its bottom edge to resize, drag the top
 *    edge of its travel time box to lengthen / shorten the travel time
 *  - "N pending tasks" under today's all-day events opens the overdue tasks, which can be
 *    dragged onto the grid to reschedule them
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

import type { EventInstance, Task } from '@/api/ical'
import { addDays, isSameDay, startOfDay, toDateKey } from '@/lib/dates'
import { WEEKDAYS_LONG, formatTime } from '@/lib/format'
import {
  DAY_PX,
  DEFAULT_NEW_EVENT_MIN,
  HOUR_PX,
  TASK_SLOT_MIN,
  type TimedPlacement,
  isAllDayRow,
  layoutDay,
  layoutSpans,
  layoutTasks,
  minutesSinceMidnight,
  slotFromOffset,
} from '@/lib/layout'
import { textOn } from '@/lib/color'
import { type DayWeather, describeWeather } from '@/lib/weather'
import { markDragged, wasJustDragged } from '@/lib/dragGuard'
import type { Anchor, CreateDraft } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import TaskDot from '@/components/ui/TaskDot.vue'
import WeatherCard from './WeatherCard.vue'
import EventChip from './EventChip.vue'
import PendingTasksPopover from './PendingTasksPopover.vue'
import TaskChip from './TaskChip.vue'

const props = defineProps<{
  days: Date[]
  instances: EventInstance[]
  tasks: Task[]
  colorFor: (collectionUrl: string) => string
  selectedKey?: string | null
  /** Hour the grid scrolls to on mount (the mockup starts at 07:00). */
  scrollToHour?: number
  /** Event/task being created: previewed in the grid (mockup #draft-event / #draft-task). */
  draft?: CreateDraft | null
  draftColor?: string
  /** Overdue open tasks, shown as "N pending tasks" on today's column. */
  pendingTasks?: Task[]
  /** Forecast for a day (by date key), shown above the day name when the weather is on. */
  weatherFor?: (dateKey: string) => DayWeather | undefined
}>()
const emit = defineEmits<{
  selectEvent: [instance: EventInstance, el: HTMLElement]
  selectTask: [task: Task, el: HTMLElement]
  createAt: [start: Date, end: Date, allDay: boolean, anchor: Anchor]
  /** A chip was dragged or resized to a new time. */
  moveEvent: [instance: EventInstance, start: Date, end: Date]
  /** A task chip was dragged to a new due date/time. */
  moveTask: [task: Task, due: Date]
  /** The bottom edge of a task chip was dragged: how many minutes the task takes. */
  setTaskDuration: [task: Task, minutes: number]
  /** The top edge of an event's travel time box was dragged: the new travel minutes. */
  setTravel: [instance: EventInstance, minutes: number]
  /** Alt + drag: a copy of the event at the new time (the original stays). */
  copyEvent: [instance: EventInstance, start: Date, end: Date]
  /** Alt + drag: a copy of the task with the new due time. */
  copyTask: [task: Task, due: Date]
}>()

const root = ref<HTMLElement | null>(null)
const header = ref<HTMLElement | null>(null)
const now = ref(new Date())
let tick: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  const hour = props.scrollToHour ?? 7
  if (root.value) root.value.scrollTop = hour * HOUR_PX - 8
  tick = setInterval(() => (now.value = new Date()), 60_000)
})
onBeforeUnmount(() => {
  if (tick) clearInterval(tick)
  untrackPointer()
})

const gridCols = computed(() => `3.5rem repeat(${props.days.length}, minmax(0, 1fr))`)
const hours = Array.from({ length: 23 }, (_, i) => i + 1)
const PX_PER_MIN = HOUR_PX / 60
/** Drag snapping. */
const SNAP = 15
/** Pointer travel before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 6
/** Space under every chip so back-to-back events and tasks do not touch (Google Calendar). */
const CHIP_GAP_PX = 2
/** A timed task is a TASK_SLOT_MIN block, laid out with the events (Google Calendar). */
const TASK_CHIP_PX = TASK_SLOT_MIN * PX_PER_MIN - CHIP_GAP_PX
/** A task over an event starts this far in, so the event stays visible on its left. */
const TASK_INSET_PX = 8

/** What a day column shows: events, and timed tasks drawn over them when they overlap. */
type GridItem = { kind: 'event'; instance: EventInstance } | { kind: 'task'; task: Task }

const allDayPlacements = computed(() =>
  layoutSpans(props.instances.filter(isAllDayRow), props.days, (i) => ({
    start: i.start,
    end: i.end,
  })),
)
const todayIndex = computed(() => props.days.findIndex((d) => isSameDay(d, now.value)))
const pendingCount = computed(() => props.pendingTasks?.length ?? 0)
/** 1-based all-day lane of "N pending tasks": below today's all-day events (null = hidden). */
const pendingLane = computed(() => {
  const ti = todayIndex.value
  if (ti < 0 || pendingCount.value === 0) return null
  const used = allDayPlacements.value
    .filter((p) => p.startCol <= ti && ti < p.startCol + p.span)
    .map((p) => p.lane + 1)
  return Math.max(0, ...used) + 1
})
const allDayLanes = computed(() =>
  Math.max(1, pendingLane.value ?? 0, ...allDayPlacements.value.map((p) => p.lane + 1)),
)

/** Where the pending popover is anchored (null = closed). */
const pendingAnchor = ref<Anchor | null>(null)
function togglePending(e: MouseEvent) {
  if (pendingAnchor.value) {
    pendingAnchor.value = null
    return
  }
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  pendingAnchor.value = { x: r.left, y: r.top, width: r.width, height: r.height }
}

const columns = computed(() =>
  props.days.map((day) => {
    const dayStart = startOfDay(day)
    const dayEnd = addDays(dayStart, 1)
    return {
      day,
      key: toDateKey(day),
      isToday: isSameDay(day, now.value),
      placements: placementsFor(day, dayStart, dayEnd),
    }
  }),
)

/** Day whose weather card was clicked open (stays until closed). */
const pinnedWeather = ref<string | null>(null)
function togglePinnedWeather(key: string) {
  pinnedWeather.value = pinnedWeather.value === key ? null : key
}
function onWeatherEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && pinnedWeather.value) {
    e.stopPropagation()
    pinnedWeather.value = null
  }
}
onMounted(() => window.addEventListener('keydown', onWeatherEscape, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onWeatherEscape, true))

/** Some shown day has a forecast: every day header then keeps a weather row. */
const weatherOn = computed(() => columns.value.some((c) => props.weatherFor?.(c.key)))

/** A grid chip: an event, or a task (laid over the events it overlaps, Google Calendar style). */
interface GridPlacement extends Omit<TimedPlacement, 'instance'> {
  item: GridItem
  overEvent: boolean
}

function placementsFor(day: Date, dayStart: Date, dayEnd: Date): GridPlacement[] {
  // While the travel time is being dragged, that event is laid out with the new length.
  const d = drag.value
  const instances =
    d?.kind === 'travel'
      ? props.instances.map((i) =>
          eventKey(i) === eventKey(d.instance) ? { ...i, travel: d.travelMin } : i,
        )
      : props.instances
  const events = layoutDay(instances, day)
  // Likewise a task whose bottom edge is being dragged.
  const dayTasks = props.tasks.filter(
    (t) => t.due && !t.dueAllDay && t.due >= dayStart && t.due < dayEnd,
  )
  const tasks = layoutTasks(
    d?.kind === 'taskResize'
      ? dayTasks.map((t) =>
          t.objectUrl === d.task.objectUrl ? { ...t, duration: d.endMin - d.startMin } : t,
        )
      : dayTasks,
    events,
    day,
  )
  return [
    ...events.map(({ instance, ...p }) => ({
      ...p,
      item: { kind: 'event', instance } as GridItem,
      overEvent: false,
    })),
    ...tasks.map(({ item, ...p }) => ({
      ...p,
      travelPx: 0,
      item: { kind: 'task', task: item } as GridItem,
    })),
  ]
}

const nowTop = computed(() => minutesSinceMidnight(now.value, now.value) * PX_PER_MIN)

function eventKey(i: EventInstance) {
  return `${i.objectUrl}|${i.recurrenceId?.toString() ?? ''}`
}
/** "30 min", "1 h", "1 h 30 min" for the travel band. */
function formatTravel(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}

/** Selection / drag key of a grid item (tasks never recur, so their key ends in "|"). */
function itemKey(it: GridItem) {
  return it.kind === 'event' ? eventKey(it.instance) : `${it.task.objectUrl}|`
}

function anchorAt(el: HTMLElement, clientY: number): Anchor {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: clientY, width: r.width, height: 0 }
}

function onAllDayClick(day: Date, e: MouseEvent) {
  const start = startOfDay(day)
  emit(
    'createAt',
    start,
    addDays(start, 1),
    true,
    anchorAt(e.currentTarget as HTMLElement, e.clientY),
  )
}

// ---- pointer interactions -------------------------------------------------------------------

type Drag =
  | {
      kind: 'create'
      column: HTMLElement
      day: Date
      anchorMin: number
      curMin: number
      moved: boolean
      startY: number
    }
  | {
      kind: 'move'
      instance: EventInstance
      column: HTMLElement
      day: Date
      grabMin: number
      durationMin: number
      startMin: number
      moved: boolean
      startX: number
      startY: number
    }
  | {
      kind: 'resize'
      instance: EventInstance
      column: HTMLElement
      day: Date
      startMin: number
      endMin: number
      moved: boolean
      startY: number
    }
  | {
      /** Bottom edge of a task chip: how long the task takes from its due time. */
      kind: 'taskResize'
      task: Task
      column: HTMLElement
      day: Date
      startMin: number
      endMin: number
      moved: boolean
      startY: number
    }
  | {
      /** Top edge of the travel time box: the travel minutes before the event start. */
      kind: 'travel'
      instance: EventInstance
      column: HTMLElement
      day: Date
      startMin: number
      travelMin: number
      moved: boolean
      startY: number
    }
  | {
      kind: 'task'
      task: Task
      column: HTMLElement
      day: Date
      grabMin: number
      startMin: number
      moved: boolean
      startX: number
      startY: number
    }
  | {
      /** A task dragged out of the pending popover; column/day are null off the grid. */
      kind: 'pending'
      task: Task
      column: HTMLElement | null
      day: Date | null
      startMin: number
      moved: boolean
      startX: number
      startY: number
      x: number
      y: number
    }

const drag = shallowRef<Drag | null>(null)
/** Alt held while moving an event or task chip: the drop makes a copy (Google Calendar). */
const copying = ref(false)

const snap = (min: number) => Math.round(min / SNAP) * SNAP
const clampMin = (min: number) => Math.max(0, Math.min(24 * 60, min))

function minutesAt(column: HTMLElement, clientY: number): number {
  return clampMin((clientY - column.getBoundingClientRect().top) / PX_PER_MIN)
}

function columnAt(clientX: number): { el: HTMLElement; day: Date } | null {
  const cols = [...(root.value?.querySelectorAll<HTMLElement>('[data-day]') ?? [])]
  for (const el of cols) {
    const r = el.getBoundingClientRect()
    if (clientX >= r.left && clientX < r.right) {
      const day = props.days.find((d) => toDateKey(d) === el.dataset.day)
      if (day) return { el, day }
    }
  }
  return null
}

function dateAt(day: Date, min: number): Date {
  const d = startOfDay(day)
  d.setMinutes(min)
  return d
}

function isPrimaryPointer(e: PointerEvent): boolean {
  return e.button === 0 && e.pointerType !== 'touch'
}

/** Follow the pointer on window for the rest of the gesture (no pointer capture: Chrome
 * would retarget the click that ends a plain press to the capturing element). */
function trackPointer() {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
}
function untrackPointer() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
}

/** Empty space: start a slot selection. */
function onColumnPointerDown(day: Date, e: PointerEvent) {
  if (!isPrimaryPointer(e) || e.target !== e.currentTarget) return
  const column = e.currentTarget as HTMLElement
  const min = minutesAt(column, e.clientY)
  drag.value = {
    kind: 'create',
    column,
    day,
    anchorMin: min,
    curMin: min,
    moved: false,
    startY: e.clientY,
  }
  trackPointer()
}

/** A chip: start moving it. The chip's own click still selects it when nothing moved. */
function onChipPointerDown(instance: EventInstance, day: Date, e: PointerEvent) {
  if (!isPrimaryPointer(e)) return
  const column = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-day]')
  if (!column) return
  const dayStart = startOfDay(day).getTime()
  const startMin = Math.max(0, (instance.start.getTime() - dayStart) / 60_000)
  const durationMin = (instance.end.getTime() - instance.start.getTime()) / 60_000
  drag.value = {
    kind: 'move',
    instance,
    column,
    day,
    grabMin: minutesAt(column, e.clientY) - startMin,
    durationMin,
    startMin,
    moved: false,
    startX: e.clientX,
    startY: e.clientY,
  }
  trackPointer()
}

/** A task chip: start moving its due time. */
function onTaskPointerDown(task: Task, day: Date, e: PointerEvent) {
  if (!isPrimaryPointer(e) || !task.due) return
  const column = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-day]')
  if (!column) return
  const startMin = Math.max(0, (task.due.getTime() - startOfDay(day).getTime()) / 60_000)
  drag.value = {
    kind: 'task',
    task,
    column,
    day,
    grabMin: minutesAt(column, e.clientY) - startMin,
    startMin,
    moved: false,
    startX: e.clientX,
    startY: e.clientY,
  }
  trackPointer()
}

/** A row of the pending popover: start dragging it towards the grid. */
function onPendingGrab(task: Task, e: PointerEvent) {
  drag.value = {
    kind: 'pending',
    task,
    column: null,
    day: null,
    startMin: 0,
    moved: false,
    startX: e.clientX,
    startY: e.clientY,
    x: e.clientX,
    y: e.clientY,
  }
  trackPointer()
}

/**
 * A task dragged in from outside the grid (the tasks panel): handled like a row of the
 * pending popover, so it gets the ghost off the grid and the preview over a day.
 */
defineExpose({ grabExternalTask: onPendingGrab })

/** Day column under the pointer, only inside the scrolled time area (not under the header). */
function timeColumnAt(clientX: number, clientY: number): { el: HTMLElement; day: Date } | null {
  const box = root.value?.getBoundingClientRect()
  const top = header.value?.getBoundingClientRect().bottom ?? box?.top ?? 0
  if (!box || clientY < top || clientY > box.bottom) return null
  return columnAt(clientX)
}

/** Bottom edge of a task chip: start changing how long the task takes. */
function onTaskResizePointerDown(task: Task, day: Date, e: PointerEvent) {
  if (!isPrimaryPointer(e) || !task.due) return
  e.stopPropagation()
  const column = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-day]')
  if (!column) return
  const startMin = (task.due.getTime() - startOfDay(day).getTime()) / 60_000
  drag.value = {
    kind: 'taskResize',
    task,
    column,
    day,
    startMin,
    endMin: Math.min(24 * 60, startMin + (task.duration ?? TASK_SLOT_MIN)),
    moved: false,
    startY: e.clientY,
  }
  trackPointer()
}

/** Travel time steps of 5 minutes, at least 5 (removing it is in the event popup). */
const TRAVEL_SNAP = 5

/** Top edge of the travel time box: start changing the travel time. */
function onTravelPointerDown(instance: EventInstance, day: Date, e: PointerEvent) {
  if (!isPrimaryPointer(e) || !instance.travel) return
  e.stopPropagation()
  const column = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-day]')
  if (!column) return
  const startMin = (instance.start.getTime() - startOfDay(day).getTime()) / 60_000
  drag.value = {
    kind: 'travel',
    instance,
    column,
    day,
    startMin,
    travelMin: instance.travel,
    moved: false,
    startY: e.clientY,
  }
  trackPointer()
}

/** Bottom edge of a chip: start resizing. */
function onResizePointerDown(instance: EventInstance, day: Date, e: PointerEvent) {
  if (!isPrimaryPointer(e)) return
  e.stopPropagation()
  const column = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-day]')
  if (!column) return
  const dayStart = startOfDay(day).getTime()
  const startMin = Math.max(0, (instance.start.getTime() - dayStart) / 60_000)
  const endMin = Math.min(24 * 60, (instance.end.getTime() - dayStart) / 60_000)
  drag.value = {
    kind: 'resize',
    instance,
    column,
    day,
    startMin,
    endMin,
    moved: false,
    startY: e.clientY,
  }
  trackPointer()
}

function onPointerMove(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  copying.value = (d.kind === 'move' || d.kind === 'task') && e.altKey
  if (d.kind === 'create') {
    drag.value = {
      ...d,
      curMin: minutesAt(d.column, e.clientY),
      moved: d.moved || Math.abs(e.clientY - d.startY) >= DRAG_THRESHOLD_PX,
    }
  } else if (d.kind === 'pending') {
    const moved =
      d.moved ||
      Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) >= DRAG_THRESHOLD_PX
    // The popover gets out of the way once the row is really being dragged.
    if (moved) pendingAnchor.value = null
    const target = moved ? timeColumnAt(e.clientX, e.clientY) : null
    drag.value = {
      ...d,
      moved,
      x: e.clientX,
      y: e.clientY,
      column: target?.el ?? null,
      day: target?.day ?? null,
      // Pointer on the middle of the task chip.
      startMin: target
        ? Math.min(
            24 * 60 - SNAP,
            clampMin(snap(minutesAt(target.el, e.clientY) - TASK_CHIP_PX / 2)),
          )
        : 0,
    }
  } else if (d.kind === 'task') {
    const target = columnAt(e.clientX) ?? { el: d.column, day: d.day }
    drag.value = {
      ...d,
      column: target.el,
      day: target.day,
      startMin: Math.min(
        24 * 60 - SNAP,
        clampMin(snap(minutesAt(target.el, e.clientY) - d.grabMin)),
      ),
      moved:
        d.moved ||
        Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) >= DRAG_THRESHOLD_PX,
    }
  } else if (d.kind === 'move') {
    const target = columnAt(e.clientX) ?? { el: d.column, day: d.day }
    let startMin = clampMin(snap(minutesAt(target.el, e.clientY) - d.grabMin))
    if (startMin + d.durationMin > 24 * 60) startMin = 24 * 60 - d.durationMin
    drag.value = {
      ...d,
      column: target.el,
      day: target.day,
      startMin,
      moved:
        d.moved ||
        Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) >= DRAG_THRESHOLD_PX,
    }
  } else if (d.kind === 'taskResize') {
    drag.value = {
      ...d,
      endMin: Math.min(24 * 60, Math.max(d.startMin + SNAP, snap(minutesAt(d.column, e.clientY)))),
      moved: d.moved || Math.abs(e.clientY - d.startY) >= DRAG_THRESHOLD_PX,
    }
  } else if (d.kind === 'travel') {
    const raw = d.startMin - minutesAt(d.column, e.clientY)
    drag.value = {
      ...d,
      travelMin: Math.min(
        Math.max(TRAVEL_SNAP, Math.round(raw / TRAVEL_SNAP) * TRAVEL_SNAP),
        Math.max(TRAVEL_SNAP, Math.floor(d.startMin / TRAVEL_SNAP) * TRAVEL_SNAP),
      ),
      moved: d.moved || Math.abs(e.clientY - d.startY) >= DRAG_THRESHOLD_PX,
    }
  } else {
    drag.value = {
      ...d,
      endMin: Math.max(d.startMin + SNAP, snap(minutesAt(d.column, e.clientY))),
      moved: d.moved || Math.abs(e.clientY - d.startY) >= DRAG_THRESHOLD_PX,
    }
  }
}

function onPointerUp(e: PointerEvent) {
  untrackPointer()
  const d = drag.value
  if (!d) return
  drag.value = null
  if (d.kind === 'create') {
    if (!d.moved) {
      const start = slotFromOffset(d.day, d.anchorMin * PX_PER_MIN)
      emit(
        'createAt',
        start,
        new Date(start.getTime() + DEFAULT_NEW_EVENT_MIN * 60_000),
        false,
        anchorAt(d.column, e.clientY),
      )
      return
    }
    const a = snap(Math.min(d.anchorMin, d.curMin))
    const b = Math.max(a + SNAP, snap(Math.max(d.anchorMin, d.curMin)))
    emit('createAt', dateAt(d.day, a), dateAt(d.day, b), false, anchorAt(d.column, e.clientY))
    return
  }
  if (!d.moved) return
  markDragged()
  if (d.kind === 'pending') {
    if (d.day) emit('moveTask', d.task, dateAt(d.day, d.startMin))
    return
  }
  if (d.kind === 'travel') {
    if (d.travelMin !== d.instance.travel) emit('setTravel', d.instance, d.travelMin)
    return
  }
  if (d.kind === 'taskResize') {
    const minutes = d.endMin - d.startMin
    if (minutes !== (d.task.duration ?? TASK_SLOT_MIN)) emit('setTaskDuration', d.task, minutes)
    return
  }
  const copy = (d.kind === 'move' || d.kind === 'task') && e.altKey
  copying.value = false
  if (d.kind === 'task') {
    const due = dateAt(d.day, d.startMin)
    if (due.getTime() !== d.task.due!.getTime()) {
      if (copy) emit('copyTask', d.task, due)
      else emit('moveTask', d.task, due)
    }
    return
  }
  if (d.kind === 'move') {
    const start = dateAt(d.day, d.startMin)
    const end = new Date(start.getTime() + d.durationMin * 60_000)
    if (start.getTime() !== d.instance.start.getTime()) {
      if (copy) emit('copyEvent', d.instance, start, end)
      else emit('moveEvent', d.instance, start, end)
    }
  } else {
    const end = dateAt(d.day, d.endMin)
    if (end.getTime() !== d.instance.end.getTime())
      emit('moveEvent', d.instance, d.instance.start, end)
  }
}

function onPointerCancel() {
  untrackPointer()
  drag.value = null
  copying.value = false
}

function onSelectEvent(instance: EventInstance, el: HTMLElement) {
  if (wasJustDragged()) return
  emit('selectEvent', instance, el)
}

function onSelectTask(task: Task, el: HTMLElement) {
  if (wasJustDragged()) return
  emit('selectTask', task, el)
}

/** Preview chip while selecting a slot, moving or resizing. */
const dragPreview = computed(() => {
  const d = drag.value
  if (!d) return null
  if (d.kind === 'create') {
    if (!d.moved) return null
    const a = snap(Math.min(d.anchorMin, d.curMin))
    const b = Math.max(a + SNAP, snap(Math.max(d.anchorMin, d.curMin)))
    return {
      dayKey: toDateKey(d.day),
      top: a * PX_PER_MIN,
      height: (b - a) * PX_PER_MIN,
      title: '(No title)',
      from: dateAt(d.day, a),
      to: dateAt(d.day, b),
      color: props.draftColor,
    }
  }
  if (!d.moved || d.kind === 'travel' || d.kind === 'taskResize') return null
  if (d.kind === 'pending') {
    if (!d.day) return null
    return {
      dayKey: toDateKey(d.day),
      top: d.startMin * PX_PER_MIN,
      height: (d.task.duration ?? TASK_SLOT_MIN) * PX_PER_MIN - CHIP_GAP_PX,
      title: d.task.summary,
      from: dateAt(d.day, d.startMin),
      to: dateAt(d.day, d.startMin),
      color: props.colorFor(d.task.collectionUrl),
      task: true,
      tall: (d.task.duration ?? TASK_SLOT_MIN) > TASK_SLOT_MIN,
    }
  }
  if (d.kind === 'task') {
    return {
      dayKey: toDateKey(d.day),
      top: d.startMin * PX_PER_MIN,
      height: (d.task.duration ?? TASK_SLOT_MIN) * PX_PER_MIN - CHIP_GAP_PX,
      title: d.task.summary,
      from: dateAt(d.day, d.startMin),
      to: dateAt(d.day, d.startMin),
      color: props.colorFor(d.task.collectionUrl),
      task: true,
      // A longer task keeps its title at the top, as on the chip.
      tall: (d.task.duration ?? TASK_SLOT_MIN) > TASK_SLOT_MIN,
    }
  }
  const startMin = d.startMin
  const endMin = d.kind === 'move' ? Math.min(24 * 60, startMin + d.durationMin) : d.endMin
  return {
    dayKey: toDateKey(d.day),
    top: startMin * PX_PER_MIN,
    height: Math.max((endMin - startMin) * PX_PER_MIN - CHIP_GAP_PX, 14),
    title: d.instance.summary || '(No title)',
    from: dateAt(d.day, startMin),
    to: dateAt(d.day, endMin),
    color: props.colorFor(d.instance.collectionUrl),
    task: false,
  }
})
const draggingKey = computed(() => {
  const d = drag.value
  // A copy leaves the original where it is, so it is not faded.
  if (
    !d ||
    !d.moved ||
    d.kind === 'create' ||
    d.kind === 'travel' ||
    d.kind === 'taskResize' ||
    copying.value
  )
    return null
  return d.kind === 'task' || d.kind === 'pending' ? d.task.objectUrl : eventKey(d.instance)
})

/** Where the draft chip goes in each column (null when it is not a timed draft on that day). */
function draftPlacement(day: Date) {
  const d = props.draft
  if (!d?.start || !d.end || d.allDay || d.edit) return null
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  if (!(d.start < dayEnd && d.end > dayStart)) return null
  // Minutes from midnight, turned into grid pixels.
  const top =
    ((Math.max(d.start.getTime(), dayStart.getTime()) - dayStart.getTime()) / 60_000) * PX_PER_MIN
  const bottom =
    ((Math.min(d.end.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 60_000) * PX_PER_MIN
  return {
    top,
    height: d.kind === 'task' ? TASK_CHIP_PX : Math.max(bottom - top - CHIP_GAP_PX, 14),
  }
}

/**
 * Keyboard navigation: with a chip focused, ←/→ jump to the nearest chip in the adjacent
 * day column, ↑/↓ move within the column. A focused column creates an event at 09:00 on
 * Enter/Space.
 */
function onGridKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) return
  const column = target.closest<HTMLElement>('[data-day]')
  if (!column) return
  if ((e.key === 'Enter' || e.key === ' ') && target === column) {
    e.preventDefault()
    const day = props.days.find((d) => toDateKey(d) === column.dataset.day)
    if (!day) return
    const start = startOfDay(day)
    start.setHours(9)
    const r = column.getBoundingClientRect()
    emit('createAt', start, new Date(start.getTime() + DEFAULT_NEW_EVENT_MIN * 60_000), false, {
      x: r.left,
      y: r.top,
      width: r.width,
      height: 0,
    })
    return
  }
  if (!target.matches('button')) return
  e.preventDefault()
  const chipsOf = (col: HTMLElement) =>
    [...col.querySelectorAll<HTMLElement>('button')].sort((a, b) => a.offsetTop - b.offsetTop)
  const chips = chipsOf(column)
  const index = chips.indexOf(target)
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    chips[index + (e.key === 'ArrowDown' ? 1 : -1)]?.focus()
    return
  }
  const cols = [...(root.value?.querySelectorAll<HTMLElement>('[data-day]') ?? [])]
  const sibling = cols[cols.indexOf(column) + (e.key === 'ArrowRight' ? 1 : -1)]
  if (!sibling) return
  const candidates = chipsOf(sibling)
  if (candidates.length === 0) {
    sibling.focus()
    return
  }
  const top = target.offsetTop
  candidates.sort((a, b) => Math.abs(a.offsetTop - top) - Math.abs(b.offsetTop - top))[0]!.focus()
}
</script>

<template>
  <div
    ref="root"
    class="scroll-subtle min-h-0 flex-1 overflow-auto px-2 pb-2"
    :class="
      drag
        ? drag.kind === 'resize' || drag.kind === 'travel' || drag.kind === 'taskResize'
          ? 'cursor-ns-resize select-none'
          : copying
            ? 'cursor-copy select-none'
            : drag.kind === 'move' || (drag.kind === 'pending' && drag.moved)
              ? 'cursor-grabbing select-none'
              : 'select-none'
        : ''
    "
    data-testid="time-grid"
    @keydown="onGridKeydown"
  >
    <div :class="days.length > 1 ? 'min-w-[640px]' : 'min-w-[320px]'">
      <!-- Day headers + all-day events (sticky) -->
      <div ref="header" class="sticky top-0 z-20 border-b border-gray-200 bg-white pb-0.5">
        <div class="grid" :style="{ gridTemplateColumns: gridCols }">
          <div></div>
          <div v-for="c in columns" :key="c.key" class="flex flex-col items-center py-2">
            <!-- Same height on every day so the names stay aligned past the forecast's end. -->
            <span v-if="weatherOn" class="flex h-4 items-center">
              <!-- Hover / focus shows the full forecast for the day; a click keeps it open. -->
              <span
                v-if="weatherFor?.(c.key)"
                class="group/weather relative"
                tabindex="0"
                role="button"
                :aria-expanded="pinnedWeather === c.key"
                @mousedown.prevent
                @click="togglePinnedWeather(c.key)"
                @keydown.enter.prevent="togglePinnedWeather(c.key)"
                @keydown.space.prevent="togglePinnedWeather(c.key)"
                :aria-label="`${describeWeather(weatherFor(c.key)!.code).label}, ${weatherFor(c.key)!.min}° to ${weatherFor(c.key)!.max}°`"
              >
                <span
                  class="appear flex cursor-pointer items-center gap-x-1 rounded-sm px-1 text-[11px] text-gray-400 tabular-nums group-hover/weather:bg-gray-100"
                  :class="pinnedWeather === c.key ? 'bg-gray-100' : ''"
                  data-testid="day-weather"
                >
                  <AppIcon
                    :name="describeWeather(weatherFor(c.key)!.code).icon"
                    class="size-3 shrink-0 text-gray-400"
                    :stroke-width="1.75"
                  />
                  <span>{{ weatherFor(c.key)!.min }}/{{ weatherFor(c.key)!.max }}</span>
                </span>
                <WeatherCard
                  :weather="weatherFor(c.key)!"
                  :pinned="pinnedWeather === c.key"
                  class="absolute top-full z-40 mt-1.5 cursor-auto transition-[opacity,visibility] duration-150"
                  :class="[
                    pinnedWeather === c.key
                      ? 'visible opacity-100'
                      : 'pointer-events-none invisible opacity-0 group-focus-visible/weather:visible group-focus-visible/weather:opacity-100 group-hover/weather:visible group-hover/weather:opacity-100 group-hover/weather:delay-200',
                    columns.length === 1
                      ? 'left-1/2 -translate-x-1/2'
                      : c === columns[0]
                        ? 'left-0'
                        : c === columns[columns.length - 1]
                          ? 'right-0'
                          : 'left-1/2 -translate-x-1/2',
                  ]"
                  @click.stop
                  @close="pinnedWeather = null"
                />
              </span>
            </span>
            <span
              class="font-display text-[15px] font-normal"
              :class="c.isToday ? 'text-accent' : 'text-gray-800'"
              >{{ WEEKDAYS_LONG[c.day.getDay()] }}</span
            >
            <span
              class="mx-auto mt-1 flex size-8 items-center justify-center font-numeric text-lg font-medium"
              :class="
                c.isToday ? 'rounded-full bg-accent text-on-color' : 'rounded-sm text-gray-900'
              "
              :aria-current="c.isToday ? 'date' : undefined"
            >
              {{ c.day.getDate() }}
            </span>
          </div>
        </div>
        <div class="mt-1 grid items-start" :style="{ gridTemplateColumns: gridCols }">
          <span class="pr-2 text-right text-[11px] leading-6 text-gray-400">All day</span>
          <div
            class="relative col-span-full col-start-2 grid gap-y-0.5"
            :style="{
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
              gridAutoRows: '1.5rem',
              minHeight: `${allDayLanes * 1.5}rem`,
            }"
            data-testid="allday-row"
          >
            <div
              v-for="c in columns"
              :key="c.key"
              class="cursor-pointer hover:bg-gray-50"
              :style="{
                gridColumn: `${days.findIndex((d) => isSameDay(d, c.day)) + 1}`,
                gridRow: `1 / span ${allDayLanes}`,
              }"
              @click="onAllDayClick(c.day, $event)"
            ></div>
            <div
              v-for="p in allDayPlacements"
              :key="eventKey(p.item)"
              class="min-w-0 px-0.5"
              :style="{
                gridColumn: `${p.startCol + 1} / span ${p.span}`,
                gridRow: `${p.lane + 1}`,
              }"
            >
              <EventChip
                :instance="p.item"
                :color="colorFor(p.item.collectionUrl)"
                variant="allday"
                :selected="selectedKey === eventKey(p.item)"
                :continues-before="p.continuesBefore"
                :continues-after="p.continuesAfter"
                @select="onSelectEvent"
              />
            </div>
            <div
              v-if="pendingLane"
              class="min-w-0 px-0.5"
              :style="{ gridColumn: `${todayIndex + 1}`, gridRow: `${pendingLane}` }"
            >
              <button
                type="button"
                class="flex h-full w-full items-center gap-x-1.5 truncate rounded-sm px-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                :class="pendingAnchor ? 'bg-gray-100' : ''"
                :aria-expanded="pendingAnchor ? 'true' : 'false'"
                aria-haspopup="dialog"
                data-testid="pending-tasks"
                @click.stop="togglePending"
              >
                <AppIcon name="tasks" class="size-3.5 shrink-0 text-red-500" />
                <span class="truncate"
                  >{{ pendingCount }} pending {{ pendingCount === 1 ? 'task' : 'tasks' }}</span
                >
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Time grid -->
      <div class="grid" :style="{ gridTemplateColumns: gridCols, height: `${DAY_PX}px` }">
        <div class="relative">
          <span
            v-for="h in hours"
            :key="h"
            class="absolute right-2 -translate-y-1/2 text-[11px] text-gray-400"
            :style="{ top: `${h * HOUR_PX}px` }"
          >
            {{ String(h).padStart(2, '0') }}:00
          </span>
        </div>
        <div
          v-for="c in columns"
          :key="c.key"
          class="relative cursor-pointer border-l border-gray-200 bg-[repeating-linear-gradient(to_bottom,var(--color-gray-200)_0_1px,transparent_1px_48px)]"
          :data-day="c.key"
          tabindex="0"
          role="gridcell"
          :aria-label="`${WEEKDAYS_LONG[c.day.getDay()]} ${c.day.getDate()}, press Enter to add an event`"
          @pointerdown="onColumnPointerDown(c.day, $event)"
        >
          <div
            v-for="p in c.placements"
            :key="itemKey(p.item)"
            class="absolute transition-opacity duration-150"
            :class="[
              selectedKey === itemKey(p.item)
                ? 'z-30'
                : p.overEvent
                  ? 'z-20 rounded-sm ring-1 ring-white'
                  : 'z-10',
              p.left > 0 && !p.overEvent ? 'ring-1 ring-white' : '',
              draggingKey === (p.item.kind === 'event' ? itemKey(p.item) : p.item.task.objectUrl)
                ? 'opacity-40'
                : '',
            ]"
            :style="{
              top: `${p.top}px`,
              height: `${p.continuesAfter ? p.height : p.height - CHIP_GAP_PX}px`,
              left: `calc(${p.left * 100}% + ${2 + (p.overEvent ? TASK_INSET_PX : 0)}px)`,
              width: `calc(${p.width * 100}% - ${4 + (p.overEvent ? TASK_INSET_PX : 0)}px)`,
            }"
            :data-chip="p.item.kind === 'event' ? itemKey(p.item) : undefined"
            @pointerdown="
              p.item.kind === 'event'
                ? onChipPointerDown(p.item.instance, c.day, $event)
                : onTaskPointerDown(p.item.task, c.day, $event)
            "
          >
            <template v-if="p.item.kind === 'event'">
              <!-- Travel time (iPhone): a pale gray box with dashed sides running into the event. -->
              <div
                v-if="p.travelPx > 0"
                class="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-x-1 overflow-hidden rounded-t-sm border border-b-0 border-dashed border-gray-300 bg-gray-50 px-1.5 text-[10px] leading-tight font-medium text-gray-500"
                :style="{ height: `${p.travelPx}px` }"
                data-testid="travel-time"
              >
                <template v-if="p.travelPx >= 14">
                  <AppIcon name="car" class="mt-px size-3 shrink-0" />
                  <span class="mt-px truncate">{{ formatTravel(p.item.instance.travel!) }}</span>
                </template>
              </div>
              <div
                v-if="p.travelPx > 0"
                class="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize"
                title="Drag to change the travel time"
                data-testid="travel-handle"
                @pointerdown="onTravelPointerDown(p.item.instance, c.day, $event)"
              ></div>
              <EventChip
                :instance="p.item.instance"
                :color="colorFor(p.item.instance.collectionUrl)"
                variant="timed"
                :compact="p.compact"
                :selected="selectedKey === itemKey(p.item)"
                :continues-before="p.continuesBefore"
                :continues-after="p.continuesAfter"
                class="cursor-grab active:cursor-grabbing"
                :class="p.travelPx > 0 ? 'absolute inset-x-0 bottom-0 !h-auto rounded-t-none' : ''"
                :style="p.travelPx > 0 ? { top: `${p.travelPx}px` } : undefined"
                @select="onSelectEvent"
              />
              <div
                v-if="!p.continuesAfter"
                class="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                data-testid="resize-handle"
                @pointerdown="onResizePointerDown(p.item.instance, c.day, $event)"
              ></div>
            </template>
            <template v-else>
              <TaskChip
                :task="p.item.task"
                :color="colorFor(p.item.task.collectionUrl)"
                :selected="selectedKey === itemKey(p.item)"
                :tall="(p.item.task.duration ?? TASK_SLOT_MIN) > TASK_SLOT_MIN"
                show-time
                class="h-full cursor-grab active:cursor-grabbing"
                :data-task-chip="p.item.task.objectUrl"
                @select="onSelectTask"
              />
              <!-- Bottom edge: how long the task takes (like an event's resize). -->
              <div
                class="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                data-testid="task-resize-handle"
                @pointerdown="onTaskResizePointerDown(p.item.task, c.day, $event)"
              ></div>
            </template>
          </div>
          <div
            v-if="dragPreview && dragPreview.dayKey === c.key"
            class="chip-fill pointer-events-none absolute inset-x-0.5 z-40 overflow-hidden rounded-sm text-xs ring-2 ring-white"
            :class="
              dragPreview.task
                ? [
                    'flex gap-x-1 pr-1.5 pl-1 text-(--chip-fg)',
                    'tall' in dragPreview && dragPreview.tall ? 'items-start pt-1' : 'items-center',
                  ]
                : 'px-2 py-1 text-(--chip-fg)'
            "
            :style="{
              top: `${dragPreview.top}px`,
              height: `${dragPreview.height}px`,
              backgroundColor: dragPreview.color,
              '--chip-fg': textOn(dragPreview.color ?? '#566c86'),
              '--chip-color': dragPreview.color ?? '#566c86',
            }"
            data-testid="drag-preview"
          >
            <template v-if="dragPreview.task">
              <TaskDot
                :color="dragPreview.color ?? '#7c3aed'"
                size="sm"
                on-color
                :class="'tall' in dragPreview && dragPreview.tall ? 'mt-[3px]' : ''"
              />
              <span class="truncate font-medium">{{ dragPreview.title }}</span>
              <span class="ml-auto shrink-0 text-[11px] text-(--chip-fg)/80">{{
                formatTime(dragPreview.from)
              }}</span>
            </template>
            <template v-else>
              <p class="truncate font-medium">{{ dragPreview.title }}</p>
              <p class="truncate text-[11px] text-(--chip-fg)/80">
                {{ formatTime(dragPreview.from) }}–{{ formatTime(dragPreview.to) }}
              </p>
            </template>
          </div>
          <div
            v-if="draftPlacement(c.day)"
            class="chip-fill pointer-events-none absolute inset-x-0.5 z-40 overflow-hidden rounded-sm text-xs ring-2 ring-white"
            :class="
              draft?.kind === 'task'
                ? 'flex items-center gap-x-1 pr-1.5 pl-1 text-(--chip-fg)'
                : 'px-2 py-1 text-(--chip-fg)'
            "
            :style="{
              top: `${draftPlacement(c.day)!.top}px`,
              height: `${draftPlacement(c.day)!.height}px`,
              backgroundColor: draftColor,
              '--chip-fg': textOn(draftColor ?? '#566c86'),
              '--chip-color': draftColor ?? '#566c86',
            }"
            data-testid="draft-chip"
          >
            <template v-if="draft?.kind === 'task'">
              <TaskDot :color="draftColor ?? '#7c3aed'" size="sm" on-color />
              <span class="truncate font-medium">{{ draft?.title || '(No title)' }}</span>
            </template>
            <template v-else>
              <p class="truncate font-medium">{{ draft?.title || '(No title)' }}</p>
              <p class="truncate text-[11px] text-(--chip-fg)/80">
                {{ formatTime(draft!.start!) }}–{{ formatTime(draft!.end!) }}
              </p>
            </template>
          </div>
          <div
            v-if="c.isToday"
            class="pointer-events-none absolute inset-x-0 z-10 flex items-center"
            :style="{ top: `${nowTop}px` }"
            data-testid="now-line"
          >
            <span class="-ml-1 size-2 rounded-sm bg-accent"></span>
            <span class="h-0.5 flex-1 bg-accent"></span>
          </div>
        </div>
      </div>
      <!-- Room below midnight, so the evening can be scrolled up to the middle of the view.
           Outside the day: nothing can be created or dropped here. -->
      <div
        class="grid h-[50vh] border-t border-gray-200"
        :style="{ gridTemplateColumns: gridCols }"
        aria-hidden="true"
        data-testid="grid-overscroll"
      >
        <div class="relative">
          <span class="absolute right-2 -translate-y-1/2 text-[11px] text-gray-400">00:00</span>
        </div>
        <div v-for="c in columns" :key="c.key" class="border-l border-gray-200 bg-gray-50/70"></div>
      </div>
    </div>

    <Transition name="pop">
      <PendingTasksPopover
        v-if="pendingAnchor && pendingTasks?.length"
        :tasks="pendingTasks"
        :anchor="pendingAnchor"
        :color-for="colorFor"
        draggable
        @close="pendingAnchor = null"
        @grab="onPendingGrab"
      />
    </Transition>
    <Teleport to="body">
      <div
        v-if="drag?.kind === 'pending' && drag.moved && !drag.day"
        class="pointer-events-none fixed z-50 max-w-xs truncate rounded-sm bg-gray-900 px-3 py-1.5 text-sm font-medium text-white shadow-lg"
        :style="{ left: `${drag.x + 12}px`, top: `${drag.y + 12}px` }"
        data-testid="pending-drag-ghost"
      >
        {{ drag.task.summary }}
      </div>
    </Teleport>
  </div>
</template>
