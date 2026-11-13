<script setup lang="ts">
/**
 * Create / edit popup (mockup new-event.html). One card for both events and tasks, with the
 * Event/Task switcher when creating. Writes go through the stores; the live title and times
 * are mirrored into the ui draft so the grid previews the chip.
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'

import { ConflictError } from '@/api/errors'
import {
  type EditScope,
  type EventForm,
  type EventInstance,
  type RepeatRule,
  type Task,
  type TaskForm,
  browserTimeZone,
  describeRepeat,
  eventToForm,
  expandEvent,
  taskToForm,
} from '@/api/ical'
import { addDays, parseDateKey, startOfDay, toDateKey } from '@/lib/dates'
import { DEFAULT_NEW_EVENT_MIN } from '@/lib/layout'
import { MONTHS_LONG, WEEKDAYS_LONG } from '@/lib/format'
import { formatPickerDate, toMinutes } from '@/lib/timeInput'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { useCalendarsStore } from '@/stores/calendars'
import { useEventsStore } from '@/stores/events'
import { useHistoryStore } from '@/stores/history'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import DatePicker from '@/components/ui/DatePicker.vue'
import TimeInput from '@/components/ui/TimeInput.vue'
import ColorSelect from '@/components/ui/ColorSelect.vue'

const ui = useUiStore()
const calendars = useCalendarsStore()
const events = useEventsStore()
const tasks = useTasksStore()
const history = useHistoryStore()

const draft = computed(() => ui.createDraft)
const isEdit = computed(() => Boolean(draft.value?.edit))
const kind = ref<'event' | 'task'>(draft.value?.kind ?? 'event')

// ---- form state -----------------------------------------------------------------------------
const form = reactive({
  title: '',
  collectionUrl: '',
  date: '',
  endDate: '',
  startTime: '10:00',
  endTime: '10:30',
  allDay: false,
  repeat: 'none' as string,
  alarm: null as number | null,
  /** Apple travel time before the start, in minutes (events only). */
  travel: null as number | null,
  location: '',
  description: '',
  // task
  dueDate: '',
  dueTime: '' as string,
  priority: null as Task['priority'],
})
const customRepeat = ref<RepeatRule | null>(null)
const scope = ref<EditScope>('all')
const editingInstance = shallowRef<EventInstance | null>(null)
const editingTask = shallowRef<Task | null>(null)
const error = ref<string | null>(null)
const conflict = ref(false)
const busy = ref(false)
const confirmingDelete = ref(false)
const titleInput = ref<HTMLInputElement | null>(null)
const root = ref<HTMLElement | null>(null)
useFocusTrap(root)

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
function combine(date: string, time: string): Date | null {
  const d = parseDateKey(date)
  if (!d) return null
  const [h, m] = time.split(':').map(Number)
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d
}

const eventCalendars = computed(() => calendars.calendars)
const taskLists = computed(() => calendars.taskLists)
/** Options for the calendar / task list pickers (color square + name). */
const calendarOptions = computed(() =>
  eventCalendars.value.map((c) => ({
    value: c.url,
    label: c.displayName,
    color: calendars.colorFor(c.url),
  })),
)
const listOptions = computed(() =>
  taskLists.value.map((c) => ({
    value: c.url,
    label: c.displayName,
    color: calendars.colorFor(c.url),
  })),
)
const collection = computed(() => calendars.get(form.collectionUrl))

const start = computed(() => combine(form.date, form.allDay ? '00:00' : form.startTime))
const end = computed(() => {
  if (form.allDay) {
    const d = parseDateKey(form.endDate || form.date)
    return d ? addDays(startOfDay(d), 1) : null
  }
  return combine(form.endDate || form.date, form.endTime)
})

/** Whole days between the start and end date (0 = same day). */
const spanDays = computed(() => {
  const a = parseDateKey(form.date)
  const b = parseDateKey(form.endDate || form.date)
  return a && b ? Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000) : 0
})
/**
 * A timed event shows its end date only when it ends on another day; one ending at midnight
 * right after reads as "23:00 – 00:00" without it.
 */
const endsOtherDay = computed(
  () => spanDays.value > 1 || (spanDays.value === 1 && form.endTime !== '00:00'),
)

/**
 * Picking an end time: within the first 24 hours the end follows the duration (picking 01:00
 * for a 22:00 start ends the event the next day). Longer events keep their end date.
 */
function setEndTime(t: string) {
  const s = start.value
  if (!s || spanDays.value > 1) {
    form.endTime = t
    return
  }
  const duration = (toMinutes(t) - toMinutes(form.startTime) + 1440) % 1440
  const e = new Date(s.getTime() + duration * 60_000)
  form.endDate = toDateKey(e)
  form.endTime = hhmm(e)
}

/**
 * As in Google Calendar the date and time start as one line of text ("Thursday, November 12 ·
 * 18:00 – 18:30"); clicking it shows the fields.
 */
const whenOpen = ref(false)
const longDate = (key: string) => {
  const d = parseDateKey(key)
  return d ? formatPickerDate(d) : ''
}
const whenText = computed(() => {
  if (kind.value === 'task') {
    if (!form.dueDate) return 'No due date'
    return form.dueTime ? `${longDate(form.dueDate)} · ${form.dueTime}` : longDate(form.dueDate)
  }
  if (form.allDay) {
    return !form.endDate || form.endDate === form.date
      ? longDate(form.date)
      : `${longDate(form.date)} – ${longDate(form.endDate)}`
  }
  return endsOtherDay.value
    ? `${longDate(form.date)}, ${form.startTime} – ${longDate(form.endDate)}, ${form.endTime}`
    : `${longDate(form.date)} · ${form.startTime} – ${form.endTime}`
})
const repeatLabel = computed(
  () => repeatOptions.value.find((o) => o.value === form.repeat)?.label ?? 'Does not repeat',
)

/** The single "x" next to the due date: removes the time first, then the date. */
function clearDue() {
  if (form.dueTime) form.dueTime = ''
  else form.dueDate = ''
}

const repeatOptions = computed(() => {
  const d = start.value ?? new Date()
  const opts: { value: string; label: string }[] = [
    { value: 'none', label: 'Does not repeat' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: `Weekly on ${WEEKDAYS_LONG[d.getDay()]}` },
    { value: 'monthly', label: `Monthly on day ${d.getDate()}` },
    { value: 'yearly', label: `Annually on ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}` },
    { value: 'weekdays', label: 'Every weekday (Monday to Friday)' },
  ]
  if (customRepeat.value) opts.push({ value: 'custom', label: describeRepeat(customRepeat.value) })
  return opts
})
/** The iPhone's travel time choices. */
const travelOptions = [
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
]
const customTravel = computed(() =>
  form.travel != null && !travelOptions.some((o) => o.value === form.travel) ? form.travel : null,
)

const alarmOptions = [
  { value: 0, label: 'At time of event' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
]
const customAlarm = computed(() =>
  form.alarm != null && !alarmOptions.some((o) => o.value === form.alarm) ? form.alarm : null,
)
/**
 * Travel time picker: the iPhone's presets, or "Custom…" with a minutes field (also shown for
 * an odd value an event came with, e.g. 25 minutes).
 */
const travelCustom = ref(false)
function removeTravel() {
  form.travel = null
  travelCustom.value = false
}
const travelInput = ref<HTMLInputElement | null>(null)
const travelModel = computed<string | number>({
  get: () => (travelCustom.value || customTravel.value != null ? 'custom' : (form.travel ?? '')),
  set: (v) => {
    if (v === 'custom') {
      travelCustom.value = true
      void nextTick(() => travelInput.value?.select())
    } else {
      travelCustom.value = false
      form.travel = Number(v)
    }
  },
})
const travelPicker = computed(() => [
  ...travelOptions.map((o) => ({ value: o.value, label: `${o.label} travel time` })),
  { value: 'custom', label: travelModel.value === 'custom' ? 'Custom travel time' : 'Custom…' },
])

/** Priority picker: colored like the flags on task rows. */
const priorityOptions = [
  { value: 'none', label: 'No priority' },
  { value: 'high', label: 'High priority', color: '#ef4444' },
  { value: 'medium', label: 'Medium priority', color: '#f59e0b' },
  { value: 'low', label: 'Low priority', color: '#0ea5e9' },
]
const priorityModel = computed<string | number>({
  get: () => form.priority ?? 'none',
  set: (v) => {
    form.priority = v === 'none' ? null : (v as NonNullable<Task['priority']>)
  },
})

const alarmPicker = computed(() => [
  ...alarmOptions,
  ...(customAlarm.value != null
    ? [{ value: customAlarm.value, label: `${customAlarm.value} minutes before` }]
    : []),
])

function repeatFromSelect(): RepeatRule | null {
  const base = {
    kind: 'simple' as const,
    interval: 1,
    byDay: [] as never[],
    until: null,
    count: null,
  }
  switch (form.repeat) {
    case 'daily':
      return { ...base, freq: 'daily' }
    case 'weekly':
      return { ...base, freq: 'weekly' }
    case 'monthly':
      return { ...base, freq: 'monthly' }
    case 'yearly':
      return { ...base, freq: 'yearly' }
    case 'weekdays':
      return {
        kind: 'simple',
        freq: 'weekly',
        interval: 1,
        byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
        until: null,
        count: null,
      }
    case 'custom':
      return customRepeat.value
    default:
      return null
  }
}

function repeatToSelect(rule: RepeatRule | null): string {
  if (!rule) return 'none'
  if (rule.kind === 'custom') return 'custom'
  if (rule.interval !== 1 || rule.until || rule.count) return 'custom'
  if (
    rule.freq === 'weekly' &&
    rule.byDay.length === 5 &&
    !rule.byDay.includes('SA') &&
    !rule.byDay.includes('SU')
  )
    return 'weekdays'
  if (rule.freq === 'weekly' && rule.byDay.length > 0) return 'custom'
  return rule.freq
}

// ---- initialise from the draft ---------------------------------------------------------------
function findEventInstance(objectUrl: string, recurrenceId: string | null): EventInstance | null {
  const match = (i: EventInstance) =>
    i.objectUrl === objectUrl && (i.recurrenceId?.toString() ?? null) === recurrenceId
  const visible = events.instancesFor(ui.visibleRange, { includeHidden: true }).find(match)
  if (visible) return visible
  const doc = events.getDocument(objectUrl)
  if (!doc) return null
  const anchor = ui.currentDate
  return expandEvent(doc, addDays(anchor, -400), addDays(anchor, 400)).find(match) ?? null
}

function loadEvent(instance: EventInstance) {
  const f = eventToForm(instance)
  form.title = f.summary
  form.collectionUrl = instance.collectionUrl
  form.date = toDateKey(f.start)
  form.endDate = toDateKey(f.allDay ? addDays(f.end, -1) : f.end)
  form.startTime = hhmm(f.start)
  form.endTime = hhmm(f.end)
  form.allDay = f.allDay
  customRepeat.value = f.repeat && repeatToSelect(f.repeat) === 'custom' ? f.repeat : null
  form.repeat = repeatToSelect(f.repeat)
  form.alarm = f.alarm
  form.travel = f.travel ?? null
  form.location = f.location
  form.description = f.description
  scope.value = instance.isException ? 'this' : 'all'
}

function loadTask(task: Task) {
  const f = taskToForm(task)
  form.title = f.summary
  form.collectionUrl = task.collectionUrl
  form.dueDate = f.due ? toDateKey(f.due) : ''
  form.dueTime = f.due && !f.dueAllDay ? hhmm(f.due) : ''
  form.priority = f.priority
  form.alarm = f.alarm
  form.description = f.description
}

/** Set while the form is filled from the draft, so the "keep the length" watcher stays out. */
let filling = false

function init() {
  filling = true
  try {
    fill()
  } finally {
    filling = false
  }
}

function fill() {
  const d = draft.value
  if (!d) return
  error.value = null
  conflict.value = false
  if (d.edit) {
    if (d.kind === 'task') {
      const task = tasks.get(d.edit.objectUrl)
      if (!task) {
        error.value = 'This task is no longer available.'
        return
      }
      editingTask.value = task
      kind.value = 'task'
      loadTask(task)
    } else {
      const instance = findEventInstance(d.edit.objectUrl, d.edit.recurrenceId)
      if (!instance) {
        error.value = 'This event is no longer available.'
        return
      }
      editingInstance.value = instance
      kind.value = 'event'
      loadEvent(instance)
    }
    return
  }
  if (d.copyOf) {
    // Duplicate: every field from the original, saved as a new object.
    if (d.kind === 'task') {
      const task = tasks.get(d.copyOf.objectUrl)
      if (task) {
        kind.value = 'task'
        loadTask(task)
        return
      }
    } else {
      const instance = findEventInstance(d.copyOf.objectUrl, d.copyOf.recurrenceId)
      if (instance) {
        kind.value = 'event'
        loadEvent(instance)
        return
      }
    }
  }
  kind.value = d.kind
  const s =
    d.start ??
    (() => {
      const n = new Date()
      n.setMinutes(n.getMinutes() < 30 ? 30 : 60, 0, 0)
      return n
    })()
  const e = d.end ?? new Date(s.getTime() + DEFAULT_NEW_EVENT_MIN * 60_000)
  form.title = d.title ?? ''
  form.allDay = d.allDay ?? false
  form.date = toDateKey(s)
  form.endDate = toDateKey(form.allDay ? addDays(e, -1) : e)
  form.startTime = form.allDay ? '10:00' : hhmm(s)
  form.endTime = form.allDay ? '10:30' : hhmm(e)
  form.dueDate = toDateKey(s)
  form.dueTime = d.allDay ? '' : hhmm(s)
  form.collectionUrl = d.collectionUrl ?? defaultCollection(d.kind)
}

// Moving the start (date or time) keeps the event length, also across days.
watch(
  () => [form.date, form.startTime] as const,
  ([date, time], [prevDate, prevTime]) => {
    if (filling || kind.value !== 'event' || !prevDate || !date) return
    if (form.allDay) {
      const a = parseDateKey(prevDate)
      const b = parseDateKey(date)
      const e = parseDateKey(form.endDate)
      if (a && b && e)
        form.endDate = toDateKey(addDays(e, Math.round((b.getTime() - a.getTime()) / 86_400_000)))
      return
    }
    const prevStart = combine(prevDate, prevTime)
    const prevEnd = combine(form.endDate || prevDate, form.endTime)
    const next = combine(date, time)
    if (!prevStart || !prevEnd || !next) return
    const length = prevEnd.getTime() - prevStart.getTime()
    if (length <= 0) return
    const e = new Date(next.getTime() + length)
    form.endDate = toDateKey(e)
    form.endTime = hhmm(e)
  },
  // Sync, so each change is paired with the end it started from.
  { flush: 'sync' },
)

/** The calendar / task list from the settings, or the first one when none (or it is gone). */
function defaultCollection(k: 'event' | 'task'): string {
  const lists = k === 'task' ? taskLists.value : eventCalendars.value
  const preferred = k === 'task' ? ui.defaultTaskList : ui.defaultCalendar
  return (lists.find((c) => c.url === preferred) ?? lists[0])?.url ?? ''
}

watch(kind, (k, prev) => {
  const lists = k === 'task' ? taskLists.value : eventCalendars.value
  if (!lists.some((c) => c.url === form.collectionUrl)) form.collectionUrl = defaultCollection(k)
  if (!isEdit.value || filling || !prev) return
  // Changing an existing event into a task (or back): carry the date and time over.
  if (k === 'task') {
    form.dueDate = form.date
    form.dueTime = form.allDay ? '' : form.startTime
  } else {
    const date = form.dueDate || toDateKey(new Date())
    filling = true
    try {
      form.date = date
      form.endDate = date
      form.allDay = !form.dueTime
      form.startTime = form.dueTime || '09:00'
      const end = combine(date, form.startTime)!
      end.setMinutes(end.getMinutes() + DEFAULT_NEW_EVENT_MIN)
      form.endTime = hhmm(end)
      form.endDate = toDateKey(end)
    } finally {
      filling = false
    }
  }
})

/**
 * Why an existing item cannot change into `k` (null when it can): a repeating event has no
 * task form, and deleting a task with subtasks would take them along.
 */
function kindBlocked(k: 'event' | 'task'): string | null {
  if (k === 'task' && editingInstance.value?.isRecurring)
    return 'A repeating event cannot become a task'
  if (
    k === 'event' &&
    editingTask.value &&
    tasks
      .tasksFor(editingTask.value.collectionUrl, { includeCompleted: true })
      .some((t) => t.parentUid === editingTask.value!.uid)
  )
    return 'A task with subtasks cannot become an event'
  return null
}

// Mirror the form into the draft so the grid previews a new event or task. While editing
// nothing leaves the form before Save: the calendar keeps showing the saved version.
watch(
  () =>
    [
      form.title,
      form.date,
      form.endDate,
      form.startTime,
      form.endTime,
      form.allDay,
      form.collectionUrl,
      form.dueDate,
      form.dueTime,
      kind.value,
    ] as const,
  () => {
    if (isEdit.value) return
    if (kind.value === 'task') {
      const due = form.dueDate ? combine(form.dueDate, form.dueTime || '00:00') : null
      ui.updateDraft({
        kind: 'task',
        title: form.title,
        start: due ?? undefined,
        end: due ? new Date(due.getTime() + 22 * 60_000) : undefined,
        allDay: !form.dueTime,
        collectionUrl: form.collectionUrl,
      })
    } else {
      ui.updateDraft({
        kind: 'event',
        title: form.title,
        start: start.value ?? undefined,
        end: end.value ?? undefined,
        allDay: form.allDay,
        collectionUrl: form.collectionUrl,
      })
    }
  },
)

onMounted(async () => {
  init()
  await nextTick()
  titleInput.value?.focus()
  setTimeout(() => document.addEventListener('mousedown', onDocClick), 0)
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))

function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) ui.closeCreate()
}

// ---- positioning -----------------------------------------------------------------------------
const style = computed(() => {
  const a = draft.value?.anchor
  const width = 384 // w-[24rem]
  if (!a) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  let left = a.x + a.width + 12
  if (left + width > vw - 8) left = Math.max(8, a.x - width - 12)
  const top = Math.max(8, Math.min(a.y, vh - 560))
  return { top: `${top}px`, left: `${left}px` }
})

// ---- validation + save -----------------------------------------------------------------------
const validation = computed<string | null>(() => {
  if (!form.title.trim()) return 'Add a title'
  if (!form.collectionUrl) return kind.value === 'task' ? 'Pick a task list' : 'Pick a calendar'
  if (kind.value === 'event') {
    if (!start.value || !end.value) return 'Pick a date'
    // A timed event may be zero minutes long ("18:00 (0 mins)"), an all-day one not.
    if (form.allDay ? end.value <= start.value : end.value < start.value)
      return form.allDay ? 'End date must not be before the start' : 'End must be after the start'
  } else if (form.dueTime && !form.dueDate) return 'Pick a due date'
  return null
})

function eventForm(): EventForm {
  return {
    summary: form.title.trim(),
    description: form.description,
    location: form.location,
    start: start.value!,
    end: end.value!,
    allDay: form.allDay,
    tzid: editingInstance.value?.tzid ?? browserTimeZone(),
    repeat: repeatFromSelect(),
    alarm: form.alarm,
    // An emptied or invalid custom minutes field means no travel time.
    travel:
      form.allDay || !(Number(form.travel) > 0)
        ? null
        : Math.min(Math.round(Number(form.travel)), 1440),
  }
}

function taskForm(): TaskForm {
  const due = form.dueDate ? combine(form.dueDate, form.dueTime || '00:00') : null
  return {
    summary: form.title.trim(),
    description: form.description,
    due,
    dueAllDay: !form.dueTime,
    tzid: browserTimeZone(),
    priority: form.priority,
    alarm: form.alarm,
  }
}

async function save() {
  if (busy.value) return
  error.value = validation.value
  if (error.value) {
    if (/date|start/i.test(error.value)) whenOpen.value = true
    return
  }
  busy.value = true
  conflict.value = false
  try {
    if (kind.value === 'task' && editingInstance.value) await convertToTask()
    else if (kind.value === 'event' && editingTask.value) await convertToEvent()
    else if (kind.value === 'task') await saveTask()
    else await saveEvent()
    ui.closeCreate()
  } catch (err) {
    if (err instanceof ConflictError) {
      conflict.value = true
      // The store re-read the server copy; pick up the fresh instance for the retry.
      if (editingInstance.value)
        editingInstance.value = findEventInstance(
          editingInstance.value.objectUrl,
          editingInstance.value.recurrenceId?.toString() ?? null,
        )
      if (editingTask.value) editingTask.value = tasks.get(editingTask.value.objectUrl) ?? null
    } else error.value = err instanceof Error ? err.message : 'Could not save'
  } finally {
    busy.value = false
  }
}

async function saveEvent() {
  const target = collection.value!
  if (!editingInstance.value) {
    await events.createEvent(target, eventForm())
    return
  }
  let instance = editingInstance.value
  if (instance.collectionUrl !== target.url) {
    const moved = await events.moveEvent(instance, target)
    instance =
      findEventInstance(moved.object.url, instance.recurrenceId?.toString() ?? null) ?? instance
    editingInstance.value = instance
  }
  await events.updateEvent(instance, eventForm(), instance.isRecurring ? scope.value : 'all')
}

/**
 * An existing event saved as a task (or a task as an event): the new object is written first,
 * then the old one deleted, as one undo step.
 */
async function convertToTask() {
  const instance = editingInstance.value!
  await history.group(`convert-${instance.objectUrl}`, async () => {
    await tasks.createTask(collection.value!, taskForm())
    await events.deleteEvent(instance, 'all')
  })
  history.relabelLast(`Changed "${form.title || '(No title)'}" to a task`)
}

async function convertToEvent() {
  const task = editingTask.value!
  await history.group(`convert-${task.objectUrl}`, async () => {
    await events.createEvent(collection.value!, eventForm())
    await tasks.deleteTask(task)
  })
  history.relabelLast(`Changed "${form.title || '(No title)'}" to an event`)
}

async function saveTask() {
  const target = collection.value!
  if (!editingTask.value) {
    await tasks.createTask(target, taskForm())
    return
  }
  let task = editingTask.value
  if (task.collectionUrl !== target.url) {
    task = await tasks.moveTask(task, target)
    editingTask.value = task
  }
  await tasks.updateTask(task, taskForm())
}

async function remove(deleteScope: EditScope) {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    if (editingTask.value) await tasks.deleteTask(editingTask.value)
    else if (editingInstance.value) await events.deleteEvent(editingInstance.value, deleteScope)
    ui.select(null)
    ui.closeCreate()
  } catch (err) {
    error.value =
      err instanceof ConflictError
        ? 'Changed on another device; it has been refreshed. Try again.'
        : err instanceof Error
          ? err.message
          : 'Could not delete'
    confirmingDelete.value = false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="contents">
    <div class="fixed inset-0 z-30 cursor-default" aria-hidden="true"></div>
    <section
      ref="root"
      role="dialog"
      aria-modal="true"
      :aria-label="
        isEdit
          ? kind === 'task'
            ? 'Edit task'
            : 'Edit event'
          : kind === 'task'
            ? 'New task'
            : 'New event'
      "
      class="modal-panel fixed z-40 w-[24rem] max-w-[calc(100vw-1rem)] rounded-2xl bg-white text-left shadow-[0_8px_32px_rgba(0,0,0,0.16)] ring-1 ring-gray-200"
      :style="style"
      data-testid="create-popup"
    >
      <!-- The type pill (or the edit title) centered; the close button on the right. -->
      <div class="relative flex items-center justify-center px-3.5 pt-2.5">
        <!-- Event / Task: the header's Calendar / Tasks pill, with the names. -->
        <div
          role="radiogroup"
          aria-label="Type"
          class="flex h-8 items-stretch rounded-full ring-1 ring-gray-300"
        >
          <label
            v-for="t in ['event', 'task'] as const"
            :key="t"
            class="flex h-full items-center gap-x-1.5 rounded-full px-3 text-[13px] leading-none font-medium text-gray-500 transition-colors duration-150 has-checked:bg-pill has-checked:font-semibold has-checked:text-on-color has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
            :class="
              kindBlocked(t)
                ? 'cursor-not-allowed opacity-40'
                : 'cursor-pointer hover:text-gray-900'
            "
            :title="kindBlocked(t) ?? undefined"
          >
            <input
              v-model="kind"
              type="radio"
              name="create-type"
              :value="t"
              :disabled="Boolean(kindBlocked(t))"
              class="sr-only"
            />
            <AppIcon :name="t === 'event' ? 'nav-calendar' : 'nav-tasks'" class="size-4 shrink-0" />
            <span>{{ t === 'event' ? 'Event' : 'Task' }}</span>
          </label>
        </div>
        <button
          type="button"
          title="Close"
          class="absolute top-2.5 right-3.5 flex size-8 items-center justify-center rounded-full text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
          @click="ui.closeCreate()"
        >
          <span class="sr-only">Close</span>
          <AppIcon name="close" class="size-4" />
        </button>
      </div>

      <form class="px-3.5 pb-3.5" novalidate @submit.prevent="save">
        <div class="mt-4 pl-7">
          <label for="create-name" class="sr-only">Title</label>
          <input
            id="create-name"
            ref="titleInput"
            v-model="form.title"
            type="text"
            placeholder="Add title"
            autocomplete="off"
            class="w-full border-b-2 border-gray-200 bg-transparent py-1 text-lg font-semibold text-gray-900 placeholder:font-medium placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
          />
        </div>

        <!-- ===== Event fields ===== -->
        <div v-if="kind === 'event'" class="mt-3 space-y-3">
          <div class="flex items-start gap-x-3">
            <AppIcon name="clock" class="mt-0.5 size-4 shrink-0 text-gray-400" />
            <div class="min-w-0 flex-1">
              <button
                v-if="!whenOpen"
                type="button"
                class="-mx-2 -my-1 block w-[calc(100%+1rem)] rounded-sm px-2 py-1 text-left hover:bg-gray-100"
                data-testid="when-summary"
                @click="whenOpen = true"
              >
                <span class="block text-[13px] text-gray-900">{{ whenText }}</span>
                <span class="block text-xs text-gray-500">{{ repeatLabel }}</span>
              </button>
              <template v-else>
                <div class="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <!-- Two dates in one row use the short form ("Wed, Nov 11") so the row fits. -->
                  <DatePicker
                    v-model="form.date"
                    label="Start date"
                    :week-start="ui.weekStart"
                    :short="form.allDay || endsOtherDay"
                  />
                  <template v-if="form.allDay">
                    <span class="text-gray-400">–</span>
                    <DatePicker
                      v-model="form.endDate"
                      label="End date"
                      :week-start="ui.weekStart"
                      :min="form.date"
                      short
                    />
                  </template>
                  <template v-else>
                    <TimeInput v-model="form.startTime" label="Start time" />
                    <span class="text-gray-400">–</span>
                    <TimeInput
                      :model-value="form.endTime"
                      label="End time"
                      :from="spanDays > 1 ? '' : form.startTime"
                      @update:model-value="setEndTime"
                    />
                    <DatePicker
                      v-if="endsOtherDay"
                      v-model="form.endDate"
                      label="End date"
                      :week-start="ui.weekStart"
                      :min="form.date"
                      short
                    />
                  </template>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label class="flex cursor-pointer items-center gap-x-2 text-[13px] text-gray-700">
                    <span class="grid size-4 shrink-0 place-items-center">
                      <input
                        v-model="form.allDay"
                        type="checkbox"
                        class="peer col-start-1 row-start-1 size-4 cursor-pointer appearance-none rounded-sm bg-gray-200 checked:bg-gray-900"
                      />
                      <svg
                        class="pointer-events-none col-start-1 row-start-1 hidden size-3.5 text-white peer-checked:block"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        viewBox="0 0 14 14"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M3 7.5 5.75 10.25 11 4"
                        />
                      </svg>
                    </span>
                    All day
                  </label>
                  <ColorSelect
                    id="event-repeat"
                    v-model="form.repeat"
                    :options="repeatOptions"
                    label="Repeat"
                    inline
                    ghost
                  />
                </div>
              </template>
              <div
                v-if="isEdit && editingInstance?.isRecurring"
                class="mt-2 flex flex-wrap items-center gap-x-4 text-[13px] text-gray-700"
                data-testid="scope"
              >
                <span class="text-gray-500">Apply to</span>
                <label class="flex cursor-pointer items-center gap-x-1.5"
                  ><input v-model="scope" type="radio" value="this" class="accent-gray-900" /> This
                  event</label
                >
                <label class="flex cursor-pointer items-center gap-x-1.5"
                  ><input v-model="scope" type="radio" value="all" class="accent-gray-900" /> All
                  events</label
                >
              </div>
            </div>
          </div>

          <!-- Travel time, as on the iPhone (not for all-day events). -->
          <div v-if="!form.allDay" class="flex items-center gap-x-3">
            <AppIcon name="car" class="size-4 shrink-0 text-gray-400" />
            <div v-if="form.travel != null" class="flex items-center gap-x-1.5">
              <ColorSelect
                id="event-travel"
                v-model="travelModel"
                :options="travelPicker"
                label="Travel time"
                inline
              />
              <!-- Custom: any number of minutes. -->
              <label v-if="travelModel === 'custom'" class="flex items-center gap-x-1.5">
                <span class="sr-only">Travel time in minutes</span>
                <input
                  ref="travelInput"
                  v-model.number="form.travel"
                  type="number"
                  min="1"
                  max="1440"
                  step="5"
                  class="w-16 rounded-sm bg-gray-100 px-2 py-1.5 text-[13px] text-gray-900 tabular-nums hover:bg-gray-200 focus:outline-2 focus:outline-accent"
                  data-testid="travel-minutes"
                />
                <span class="text-[13px] text-gray-500">min</span>
              </label>
              <button
                type="button"
                class="flex size-8 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                @click="removeTravel"
              >
                <span class="sr-only">Remove travel time</span>
                <AppIcon name="close" class="size-4" />
              </button>
            </div>
            <button
              v-else
              type="button"
              class="inline-flex items-center gap-x-1 rounded-sm px-2 py-1 text-[13px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              @click="form.travel = 30"
            >
              <AppIcon name="plus" class="size-4" />
              Add travel time
            </button>
          </div>

          <div class="flex items-center gap-x-3">
            <AppIcon name="calendar" class="size-4 shrink-0 text-gray-400" />
            <ColorSelect
              id="event-calendar"
              v-model="form.collectionUrl"
              :options="calendarOptions"
              label="Calendar"
            />
          </div>

          <div class="flex items-center gap-x-3">
            <AppIcon name="pin" class="size-4 shrink-0 text-gray-400" />
            <label for="event-location" class="sr-only">Location</label>
            <input
              id="event-location"
              v-model="form.location"
              type="text"
              placeholder="Add location"
              autocomplete="off"
              class="w-full rounded-sm bg-gray-100 px-3 py-1.5 text-[13px] text-gray-900 placeholder:text-gray-500 hover:bg-gray-200 focus:outline-2 focus:outline-accent"
            />
          </div>

          <div class="flex items-start gap-x-3">
            <AppIcon name="bell" class="mt-1.5 size-4 shrink-0 text-gray-400" />
            <div class="min-w-0 flex-1">
              <div v-if="form.alarm != null" class="flex items-center gap-x-1.5">
                <ColorSelect
                  id="event-reminder"
                  v-model="form.alarm"
                  :options="alarmPicker"
                  label="Notification"
                  inline
                />
                <button
                  type="button"
                  class="flex size-8 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  @click="form.alarm = null"
                >
                  <span class="sr-only">Remove notification</span>
                  <AppIcon name="close" class="size-4" />
                </button>
              </div>
              <button
                v-else
                type="button"
                class="inline-flex items-center gap-x-1 rounded-sm px-2 py-1 text-[13px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                @click="form.alarm = 30"
              >
                <AppIcon name="plus" class="size-4" />
                Add notification
              </button>
            </div>
          </div>

          <div class="flex items-start gap-x-3">
            <AppIcon name="lines" class="mt-1.5 size-4 shrink-0 text-gray-400" />
            <label for="event-description" class="sr-only">Description</label>
            <textarea
              id="event-description"
              v-model="form.description"
              rows="2"
              placeholder="Add description"
              class="w-full resize-none rounded-sm bg-gray-100 px-3 py-1.5 text-[13px] text-gray-900 placeholder:text-gray-500 hover:bg-gray-200 focus:outline-2 focus:outline-accent"
            ></textarea>
          </div>
        </div>

        <!-- ===== Task fields ===== -->
        <div v-else class="mt-3 space-y-3">
          <div class="flex items-start gap-x-3">
            <AppIcon name="clock" class="mt-0.5 size-4 shrink-0 text-gray-400" />
            <div class="min-w-0 flex-1">
              <button
                v-if="!whenOpen"
                type="button"
                class="-mx-2 -my-1 block w-[calc(100%+1rem)] rounded-sm px-2 py-1 text-left hover:bg-gray-100"
                data-testid="when-summary"
                @click="whenOpen = true"
              >
                <span class="block text-[13px] text-gray-900">{{ whenText }}</span>
              </button>
              <template v-else>
                <div class="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <DatePicker
                    v-model="form.dueDate"
                    label="Due date"
                    :week-start="ui.weekStart"
                    placeholder="No due date"
                  />
                  <TimeInput v-if="form.dueTime" v-model="form.dueTime" label="Due time" />
                  <button
                    v-if="!form.dueTime && form.dueDate"
                    type="button"
                    class="rounded-sm px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    @click="form.dueTime = '09:00'"
                  >
                    Add time
                  </button>
                  <button
                    v-if="form.dueDate"
                    type="button"
                    class="flex size-8 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    @click="clearDue"
                  >
                    <span class="sr-only">{{
                      form.dueTime ? 'Remove time' : 'Remove due date'
                    }}</span>
                    <AppIcon name="close" class="size-4" />
                  </button>
                </div>
              </template>
            </div>
          </div>

          <div class="flex items-center gap-x-3">
            <AppIcon name="tasks" class="size-4 shrink-0 text-gray-400" />
            <ColorSelect
              id="task-list"
              v-model="form.collectionUrl"
              :options="listOptions"
              label="Task list"
            />
          </div>

          <div class="flex items-center gap-x-3">
            <AppIcon name="flag" class="size-4 shrink-0 text-gray-400" />
            <ColorSelect
              id="task-priority"
              v-model="priorityModel"
              :options="priorityOptions"
              label="Priority"
              inline
            />
          </div>

          <div class="flex items-start gap-x-3">
            <AppIcon name="lines" class="mt-1.5 size-4 shrink-0 text-gray-400" />
            <label for="task-description" class="sr-only">Description</label>
            <textarea
              id="task-description"
              v-model="form.description"
              rows="2"
              placeholder="Add description"
              class="w-full resize-none rounded-sm bg-gray-100 px-3 py-1.5 text-[13px] text-gray-900 placeholder:text-gray-500 hover:bg-gray-200 focus:outline-2 focus:outline-accent"
            ></textarea>
          </div>
        </div>

        <p
          v-if="error"
          role="alert"
          class="mt-4 rounded-sm bg-red-50 px-3 py-2 text-[13px] text-red-700"
        >
          {{ error }}
        </p>
        <div
          v-if="conflict"
          role="alert"
          class="mt-4 rounded-sm bg-amber-50 px-3 py-2 text-[13px] text-amber-800"
          data-testid="conflict"
        >
          <p class="font-medium">Changed on another device.</p>
          <p class="mt-0.5">
            The latest version has been loaded. Save again to apply your changes on top of it, or
            cancel to keep the other device's version.
          </p>
        </div>

        <div
          v-if="confirmingDelete"
          class="mt-4 rounded-sm bg-gray-50 p-3 text-[13px]"
          data-testid="confirm-delete"
        >
          <p class="font-medium text-gray-900">
            {{
              editingInstance?.isRecurring
                ? 'Delete this repeating event?'
                : kind === 'task'
                  ? 'Delete this task?'
                  : 'Delete this event?'
            }}
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-if="editingInstance?.isRecurring"
              type="button"
              :disabled="busy"
              class="btn btn-sm btn-secondary"
              @click="remove('this')"
            >
              Only this occurrence
            </button>
            <button
              type="button"
              :disabled="busy"
              class="btn btn-sm btn-danger-solid"
              @click="remove('all')"
              data-testid="delete-confirm"
            >
              {{ editingInstance?.isRecurring ? 'All occurrences' : 'Delete' }}
            </button>
            <button type="button" class="btn btn-ghost" @click="confirmingDelete = false">
              Cancel
            </button>
          </div>
        </div>

        <div class="mt-4 flex items-center gap-x-2">
          <button
            v-if="isEdit && !confirmingDelete"
            type="button"
            class="btn btn-danger"
            @click="confirmingDelete = true"
            data-testid="delete-button"
          >
            Delete
          </button>
          <button type="button" class="btn btn-ghost ml-auto" @click="ui.closeCreate()">
            Cancel
          </button>
          <button type="submit" :disabled="busy" class="btn btn-primary">
            {{ busy ? 'Saving…' : conflict ? 'Save again' : 'Save' }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
