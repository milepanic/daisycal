<script setup lang="ts">
/**
 * Day/work-week/week grid: sticky day headers with the all-day row, hour labels, one column
 * per day with positioned events, due tasks, the current-time line and pointer interactions:
 *  - click or drag on empty space selects a time slot and opens the create popup
 *  - drag a chip to move it (also across days), drag its bottom edge to resize
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

import type { EventInstance, Task } from '@/api/ical'
import { addDays, isSameDay, startOfDay, toDateKey } from '@/lib/dates'
import { WEEKDAYS_LONG, formatTime } from '@/lib/format'
import {
  DAY_PX,
  HOUR_PX,
  isAllDayRow,
  layoutDay,
  layoutSpans,
  minutesSinceMidnight,
  slotFromOffset,
} from '@/lib/layout'
import { markDragged, wasJustDragged } from '@/lib/dragGuard'
import type { Anchor, CreateDraft } from '@/stores/ui'
import EventChip from './EventChip.vue'
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
}>()
const emit = defineEmits<{
  selectEvent: [instance: EventInstance, el: HTMLElement]
  selectTask: [task: Task, el: HTMLElement]
  createAt: [start: Date, end: Date, allDay: boolean, anchor: Anchor]
  /** A chip was dragged or resized to a new time. */
  moveEvent: [instance: EventInstance, start: Date, end: Date]
  /** A task chip was dragged to a new due date/time. */
  moveTask: [task: Task, due: Date]
}>()

const root = ref<HTMLElement | null>(null)
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

const allDayPlacements = computed(() =>
  layoutSpans(props.instances.filter(isAllDayRow), props.days, (i) => ({
    start: i.start,
    end: i.end,
  })),
)
const allDayLanes = computed(() => Math.max(1, ...allDayPlacements.value.map((p) => p.lane + 1)))

const columns = computed(() =>
  props.days.map((day) => {
    const dayStart = startOfDay(day)
    const dayEnd = addDays(dayStart, 1)
    return {
      day,
      key: toDateKey(day),
      isToday: isSameDay(day, now.value),
      placements: layoutDay(props.instances, day),
      tasks: props.tasks.filter(
        (t) => t.due && !t.dueAllDay && t.due >= dayStart && t.due < dayEnd,
      ),
    }
  }),
)

const nowTop = computed(() => minutesSinceMidnight(now.value, now.value) * PX_PER_MIN)

function eventKey(i: EventInstance) {
  return `${i.objectUrl}|${i.recurrenceId?.toString() ?? ''}`
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

const drag = shallowRef<Drag | null>(null)

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
  if (d.kind === 'create') {
    drag.value = {
      ...d,
      curMin: minutesAt(d.column, e.clientY),
      moved: d.moved || Math.abs(e.clientY - d.startY) >= DRAG_THRESHOLD_PX,
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
        new Date(start.getTime() + 60 * 60_000),
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
  if (d.kind === 'task') {
    const due = dateAt(d.day, d.startMin)
    if (due.getTime() !== d.task.due!.getTime()) emit('moveTask', d.task, due)
    return
  }
  if (d.kind === 'move') {
    const start = dateAt(d.day, d.startMin)
    const end = new Date(start.getTime() + d.durationMin * 60_000)
    if (start.getTime() !== d.instance.start.getTime()) emit('moveEvent', d.instance, start, end)
  } else {
    const end = dateAt(d.day, d.endMin)
    if (end.getTime() !== d.instance.end.getTime())
      emit('moveEvent', d.instance, d.instance.start, end)
  }
}

function onPointerCancel() {
  untrackPointer()
  drag.value = null
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
  if (!d.moved) return null
  if (d.kind === 'task') {
    return {
      dayKey: toDateKey(d.day),
      top: d.startMin * PX_PER_MIN,
      height: 22,
      title: d.task.summary,
      from: dateAt(d.day, d.startMin),
      to: dateAt(d.day, d.startMin),
      color: props.colorFor(d.task.collectionUrl),
      task: true,
    }
  }
  const startMin = d.startMin
  const endMin = d.kind === 'move' ? Math.min(24 * 60, startMin + d.durationMin) : d.endMin
  return {
    dayKey: toDateKey(d.day),
    top: startMin * PX_PER_MIN,
    height: Math.max((endMin - startMin) * PX_PER_MIN, 16),
    title: d.instance.summary || '(No title)',
    from: dateAt(d.day, startMin),
    to: dateAt(d.day, endMin),
    color: props.colorFor(d.instance.collectionUrl),
    task: false,
  }
})
const draggingKey = computed(() => {
  const d = drag.value
  if (!d || !d.moved || d.kind === 'create') return null
  return d.kind === 'task' ? d.task.objectUrl : eventKey(d.instance)
})

/** Where the draft chip goes in each column (null when it is not a timed draft on that day). */
function draftPlacement(day: Date) {
  const d = props.draft
  if (!d?.start || !d.end || d.allDay || d.edit) return null
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  if (!(d.start < dayEnd && d.end > dayStart)) return null
  const top = (Math.max(d.start.getTime(), dayStart.getTime()) - dayStart.getTime()) / 60_000
  const bottom = (Math.min(d.end.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 60_000
  return { top, height: Math.max(bottom - top, d.kind === 'task' ? 22 : 16) }
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
    emit('createAt', start, new Date(start.getTime() + 60 * 60_000), false, {
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

/** Tasks due at the same time share one row (mockup: "3 tasks at the same time, inline"). */
function taskRows(tasks: Task[]): { top: number; tasks: Task[] }[] {
  const byTime = new Map<number, Task[]>()
  for (const t of tasks) {
    const key = t.due!.getTime()
    byTime.set(key, [...(byTime.get(key) ?? []), t])
  }
  return [...byTime.entries()].map(([time, list]) => ({
    top: minutesSinceMidnight(new Date(time), new Date(time)) * PX_PER_MIN,
    tasks: list,
  }))
}
</script>

<template>
  <div
    ref="root"
    class="min-h-0 flex-1 overflow-auto px-2 pb-2"
    :class="
      drag
        ? drag.kind === 'resize'
          ? 'cursor-ns-resize select-none'
          : drag.kind === 'move'
            ? 'cursor-grabbing select-none'
            : 'select-none'
        : ''
    "
    data-testid="time-grid"
    @keydown="onGridKeydown"
  >
    <div :class="days.length > 1 ? 'min-w-[640px]' : 'min-w-[320px]'">
      <!-- Day headers + all-day events (sticky) -->
      <div class="sticky top-0 z-20 border-b border-gray-200 bg-white pb-0.5">
        <div class="grid" :style="{ gridTemplateColumns: gridCols }">
          <div></div>
          <div v-for="c in columns" :key="c.key" class="flex flex-col items-center py-2">
            <span
              class="text-sm font-medium"
              :class="c.isToday ? 'text-accent' : 'text-gray-500'"
              >{{ WEEKDAYS_LONG[c.day.getDay()] }}</span
            >
            <span
              class="mx-auto mt-1 flex size-8 items-center justify-center text-base font-semibold"
              :class="c.isToday ? 'rounded-full bg-accent text-white' : 'rounded-lg text-gray-900'"
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
          class="relative cursor-pointer border-l border-gray-200 bg-[repeating-linear-gradient(to_bottom,var(--color-gray-200)_0_1px,transparent_1px_60px)]"
          :data-day="c.key"
          tabindex="0"
          role="gridcell"
          :aria-label="`${WEEKDAYS_LONG[c.day.getDay()]} ${c.day.getDate()}, press Enter to add an event`"
          @pointerdown="onColumnPointerDown(c.day, $event)"
        >
          <div
            v-for="p in c.placements"
            :key="eventKey(p.instance)"
            class="absolute z-10 transition-opacity duration-150"
            :class="[
              p.left > 0 ? 'ring-1 ring-white' : '',
              draggingKey === eventKey(p.instance) ? 'opacity-40' : '',
            ]"
            :style="{
              top: `${p.top}px`,
              height: `${p.height}px`,
              left: `calc(${p.left * 100}% + 2px)`,
              width: `calc(${p.width * 100}% - 4px)`,
            }"
            :data-chip="eventKey(p.instance)"
            @pointerdown="onChipPointerDown(p.instance, c.day, $event)"
          >
            <EventChip
              :instance="p.instance"
              :color="colorFor(p.instance.collectionUrl)"
              variant="timed"
              :compact="p.compact"
              :selected="selectedKey === eventKey(p.instance)"
              :continues-before="p.continuesBefore"
              :continues-after="p.continuesAfter"
              class="cursor-grab active:cursor-grabbing"
              @select="onSelectEvent"
            />
            <div
              v-if="!p.continuesAfter"
              class="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
              data-testid="resize-handle"
              @pointerdown="onResizePointerDown(p.instance, c.day, $event)"
            ></div>
          </div>
          <div
            v-for="row in taskRows(c.tasks)"
            :key="row.top"
            class="absolute inset-x-0.5 z-10 flex h-[22px] gap-x-0.5"
            :style="{ top: `${row.top}px` }"
          >
            <TaskChip
              v-for="t in row.tasks"
              :key="t.objectUrl"
              :task="t"
              :color="colorFor(t.collectionUrl)"
              class="min-w-0 flex-1 cursor-grab transition-opacity duration-150 active:cursor-grabbing"
              :class="draggingKey === t.objectUrl ? 'opacity-40' : ''"
              :data-task-chip="t.objectUrl"
              @pointerdown="onTaskPointerDown(t, c.day, $event)"
              @select="onSelectTask"
            />
          </div>
          <div
            v-if="dragPreview && dragPreview.dayKey === c.key"
            class="pointer-events-none absolute inset-x-0.5 z-40 overflow-hidden rounded-lg text-xs ring-2 ring-white"
            :class="
              dragPreview.task
                ? 'flex items-center gap-x-1.5 bg-gray-100 px-2'
                : 'px-2 py-1 text-white'
            "
            :style="{
              top: `${dragPreview.top}px`,
              height: `${dragPreview.height}px`,
              backgroundColor: dragPreview.task ? undefined : dragPreview.color,
            }"
            data-testid="drag-preview"
          >
            <template v-if="dragPreview.task">
              <span
                class="size-3 shrink-0 rounded-sm"
                :style="{ backgroundColor: dragPreview.color + '33' }"
              ></span>
              <span class="truncate font-medium text-gray-800">{{ dragPreview.title }}</span>
              <span class="ml-auto shrink-0 text-[11px] text-gray-500">{{
                formatTime(dragPreview.from)
              }}</span>
            </template>
            <template v-else>
              <p class="truncate font-semibold">{{ dragPreview.title }}</p>
              <p class="truncate text-[11px] text-white/80">
                {{ formatTime(dragPreview.from) }}–{{ formatTime(dragPreview.to) }}
              </p>
            </template>
          </div>
          <div
            v-if="draftPlacement(c.day)"
            class="pointer-events-none absolute inset-x-0.5 z-40 overflow-hidden rounded-lg text-xs ring-2 ring-white"
            :class="
              draft?.kind === 'task'
                ? 'flex items-center gap-x-1.5 bg-gray-100 px-2'
                : 'px-2 py-1 text-white'
            "
            :style="{
              top: `${draftPlacement(c.day)!.top}px`,
              height: `${draftPlacement(c.day)!.height}px`,
              backgroundColor: draft?.kind === 'task' ? undefined : draftColor,
            }"
            data-testid="draft-chip"
          >
            <template v-if="draft?.kind === 'task'">
              <span
                class="size-3 shrink-0 rounded-sm"
                :style="{ backgroundColor: (draftColor ?? '#7c3aed') + '33' }"
              ></span>
              <span class="truncate font-medium text-gray-800">{{
                draft?.title || '(No title)'
              }}</span>
            </template>
            <template v-else>
              <p class="truncate font-semibold">{{ draft?.title || '(No title)' }}</p>
              <p class="truncate text-[11px] text-white/80">
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
            <span class="-ml-1 size-2 rounded-lg bg-accent"></span>
            <span class="h-0.5 flex-1 bg-accent"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
