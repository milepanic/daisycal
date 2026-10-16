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
import { MONTHS_LONG, WEEKDAYS_LONG } from '@/lib/format'
import { useCalendarsStore } from '@/stores/calendars'
import { useEventsStore } from '@/stores/events'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'

const ui = useUiStore()
const calendars = useCalendarsStore()
const events = useEventsStore()
const tasks = useTasksStore()

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
  endTime: '11:00',
  allDay: false,
  repeat: 'none' as string,
  alarm: null as number | null,
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
const collection = computed(() => calendars.get(form.collectionUrl))
const color = computed(() =>
  form.collectionUrl ? calendars.colorFor(form.collectionUrl) : '#566c86',
)

const start = computed(() => combine(form.date, form.allDay ? '00:00' : form.startTime))
const end = computed(() => {
  if (form.allDay) {
    const d = parseDateKey(form.endDate || form.date)
    return d ? addDays(startOfDay(d), 1) : null
  }
  return combine(form.date, form.endTime)
})

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

function init() {
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
  kind.value = d.kind
  const s =
    d.start ??
    (() => {
      const n = new Date()
      n.setMinutes(n.getMinutes() < 30 ? 30 : 60, 0, 0)
      return n
    })()
  const e = d.end ?? new Date(s.getTime() + 60 * 60_000)
  form.title = d.title ?? ''
  form.allDay = d.allDay ?? false
  form.date = toDateKey(s)
  form.endDate = toDateKey(form.allDay ? addDays(e, -1) : e)
  form.startTime = form.allDay ? '10:00' : hhmm(s)
  form.endTime = form.allDay ? '11:00' : hhmm(e)
  form.dueDate = toDateKey(s)
  form.dueTime = d.allDay ? '' : hhmm(s)
  form.collectionUrl =
    d.collectionUrl ??
    (d.kind === 'task' ? taskLists.value[0]?.url : eventCalendars.value[0]?.url) ??
    ''
}

watch(kind, (k) => {
  if (isEdit.value) return
  const lists = k === 'task' ? taskLists.value : eventCalendars.value
  if (!lists.some((c) => c.url === form.collectionUrl)) form.collectionUrl = lists[0]?.url ?? ''
})

// Mirror the form into the draft so the grid previews it.
watch(
  () =>
    [
      form.title,
      form.date,
      form.startTime,
      form.endTime,
      form.allDay,
      form.collectionUrl,
      form.dueDate,
      form.dueTime,
      kind.value,
    ] as const,
  () => {
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
  const width = 416
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
    if (end.value <= start.value)
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
  if (error.value) return
  busy.value = true
  conflict.value = false
  try {
    if (kind.value === 'task') await saveTask()
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
    class="fixed z-40 w-[26rem] max-w-[calc(100vw-1rem)] rounded-2xl bg-white text-left shadow-[0_8px_32px_rgba(0,0,0,0.16)] ring-1 ring-gray-200"
    :style="style"
    data-testid="create-popup"
  >
    <div class="flex items-center justify-between px-4 pt-3">
      <fieldset v-if="!isEdit" class="flex h-9 rounded-lg bg-gray-100 p-0.5">
        <legend class="sr-only">Type</legend>
        <label
          v-for="t in ['event', 'task'] as const"
          :key="t"
          class="flex cursor-pointer items-center gap-x-1.5 rounded-lg px-3 text-sm font-medium text-gray-600 hover:text-gray-900 has-checked:bg-white has-checked:text-gray-900 has-focus-visible:outline-2 has-focus-visible:outline-accent"
        >
          <input v-model="kind" type="radio" name="create-type" :value="t" class="sr-only" />
          <AppIcon :name="t === 'event' ? 'calendar' : 'tasks'" class="size-4" />
          {{ t === 'event' ? 'Event' : 'Task' }}
        </label>
      </fieldset>
      <h2 v-else class="text-sm font-semibold text-gray-500">
        {{ kind === 'task' ? 'Edit task' : 'Edit event' }}
      </h2>
      <button
        type="button"
        title="Close"
        class="flex size-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        @click="ui.closeCreate()"
      >
        <span class="sr-only">Close</span>
        <AppIcon name="close" class="size-5" />
      </button>
    </div>

    <form class="px-4 pb-4" novalidate @submit.prevent="save">
      <div class="mt-3 pl-9">
        <label for="create-name" class="sr-only">Title</label>
        <input
          id="create-name"
          ref="titleInput"
          v-model="form.title"
          type="text"
          placeholder="Add title"
          autocomplete="off"
          class="w-full border-b-2 border-gray-200 bg-transparent py-1.5 text-xl font-semibold text-gray-900 placeholder:font-medium placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
        />
      </div>

      <!-- ===== Event fields ===== -->
      <div v-if="kind === 'event'" class="mt-4 space-y-4">
        <div class="flex items-start gap-x-4">
          <AppIcon name="clock" class="mt-1.5 size-5 shrink-0 text-gray-400" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5 text-sm">
              <input
                v-model="form.date"
                type="date"
                aria-label="Start date"
                class="rounded-lg bg-gray-100 px-2.5 py-1.5 font-medium text-gray-900 hover:bg-gray-200"
              />
              <template v-if="form.allDay">
                <span class="text-gray-400">–</span>
                <input
                  v-model="form.endDate"
                  type="date"
                  aria-label="End date"
                  class="rounded-lg bg-gray-100 px-2.5 py-1.5 font-medium text-gray-900 hover:bg-gray-200"
                />
              </template>
              <template v-else>
                <input
                  v-model="form.startTime"
                  type="time"
                  step="300"
                  aria-label="Start time"
                  class="rounded-lg bg-gray-100 px-2.5 py-1.5 font-medium text-gray-900 tabular-nums hover:bg-gray-200"
                />
                <span class="text-gray-400">–</span>
                <input
                  v-model="form.endTime"
                  type="time"
                  step="300"
                  aria-label="End time"
                  class="rounded-lg bg-gray-100 px-2.5 py-1.5 font-medium text-gray-900 tabular-nums hover:bg-gray-200"
                />
              </template>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <label class="flex cursor-pointer items-center gap-x-2 text-sm text-gray-700">
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
              <div class="relative">
                <label for="event-repeat" class="sr-only">Repeat</label>
                <select
                  id="event-repeat"
                  v-model="form.repeat"
                  class="cursor-pointer appearance-none rounded-lg py-1.5 pr-7 pl-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-2 focus:outline-accent"
                >
                  <option v-for="o in repeatOptions" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </option>
                </select>
                <AppIcon
                  name="chevron-down"
                  class="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-gray-400"
                />
              </div>
            </div>
            <div
              v-if="isEdit && editingInstance?.isRecurring"
              class="mt-2 flex flex-wrap items-center gap-x-4 text-sm text-gray-700"
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

        <div class="flex items-center gap-x-4">
          <AppIcon name="calendar" class="size-5 shrink-0 text-gray-400" />
          <div class="relative flex min-w-0 flex-1 items-center">
            <span
              class="pointer-events-none absolute left-2.5 size-2.5 rounded-sm"
              :style="{ backgroundColor: color }"
            ></span>
            <label for="event-calendar" class="sr-only">Calendar</label>
            <select
              id="event-calendar"
              v-model="form.collectionUrl"
              class="w-full cursor-pointer appearance-none rounded-lg bg-gray-100 py-2 pr-8 pl-7 text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-2 focus:outline-accent"
            >
              <option v-for="c in eventCalendars" :key="c.url" :value="c.url">
                {{ c.displayName }}
              </option>
            </select>
            <AppIcon
              name="chevron-down"
              class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-gray-500"
            />
          </div>
        </div>

        <div class="flex items-center gap-x-4">
          <AppIcon name="pin" class="size-5 shrink-0 text-gray-400" />
          <label for="event-location" class="sr-only">Location</label>
          <input
            id="event-location"
            v-model="form.location"
            type="text"
            placeholder="Add location"
            autocomplete="off"
            class="w-full rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 hover:bg-gray-200 focus:outline-2 focus:outline-accent"
          />
        </div>

        <div class="flex items-start gap-x-4">
          <AppIcon name="bell" class="mt-2 size-5 shrink-0 text-gray-400" />
          <div class="min-w-0 flex-1">
            <div v-if="form.alarm != null" class="flex items-center gap-x-1.5">
              <div class="relative">
                <label for="event-reminder" class="sr-only">Notification</label>
                <select
                  id="event-reminder"
                  v-model.number="form.alarm"
                  class="cursor-pointer appearance-none rounded-lg bg-gray-100 py-2 pr-8 pl-3 text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-2 focus:outline-accent"
                >
                  <option v-for="o in alarmOptions" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </option>
                  <option v-if="customAlarm != null" :value="customAlarm">
                    {{ customAlarm }} minutes before
                  </option>
                </select>
                <AppIcon
                  name="chevron-down"
                  class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-gray-500"
                />
              </div>
              <button
                type="button"
                class="flex size-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                @click="form.alarm = null"
              >
                <span class="sr-only">Remove notification</span>
                <AppIcon name="close" class="size-4" />
              </button>
            </div>
            <button
              v-else
              type="button"
              class="inline-flex items-center gap-x-1 rounded-lg px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              @click="form.alarm = 30"
            >
              <AppIcon name="plus" class="size-4" />
              Add notification
            </button>
          </div>
        </div>

        <div class="flex items-start gap-x-4">
          <AppIcon name="lines" class="mt-2 size-5 shrink-0 text-gray-400" />
          <label for="event-description" class="sr-only">Description</label>
          <textarea
            id="event-description"
            v-model="form.description"
            rows="2"
            placeholder="Add description"
            class="w-full resize-none rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 hover:bg-gray-200 focus:outline-2 focus:outline-accent"
          ></textarea>
        </div>
      </div>

      <!-- ===== Task fields ===== -->
      <div v-else class="mt-4 space-y-4">
        <div class="flex items-start gap-x-4">
          <AppIcon name="clock" class="mt-1.5 size-5 shrink-0 text-gray-400" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5 text-sm">
              <input
                v-model="form.dueDate"
                type="date"
                aria-label="Due date"
                class="rounded-lg bg-gray-100 px-2.5 py-1.5 font-medium text-gray-900 hover:bg-gray-200"
              />
              <input
                v-model="form.dueTime"
                type="time"
                step="300"
                aria-label="Due time"
                class="rounded-lg bg-gray-100 px-2.5 py-1.5 font-medium text-gray-900 tabular-nums hover:bg-gray-200"
              />
              <button
                v-if="form.dueTime"
                type="button"
                class="flex size-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                @click="form.dueTime = ''"
              >
                <span class="sr-only">Remove time</span>
                <AppIcon name="close" class="size-4" />
              </button>
              <button
                v-if="form.dueDate"
                type="button"
                class="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                @click="((form.dueDate = ''), (form.dueTime = ''))"
              >
                No due date
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-x-4">
          <AppIcon name="tasks" class="size-5 shrink-0 text-gray-400" />
          <div class="relative flex min-w-0 flex-1 items-center">
            <span
              class="pointer-events-none absolute left-2.5 size-2.5 rounded-sm"
              :style="{ backgroundColor: color }"
            ></span>
            <label for="task-list" class="sr-only">Task list</label>
            <select
              id="task-list"
              v-model="form.collectionUrl"
              class="w-full cursor-pointer appearance-none rounded-lg bg-gray-100 py-2 pr-8 pl-7 text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-2 focus:outline-accent"
            >
              <option v-for="c in taskLists" :key="c.url" :value="c.url">
                {{ c.displayName }}
              </option>
            </select>
            <AppIcon
              name="chevron-down"
              class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-gray-500"
            />
          </div>
        </div>

        <div class="flex items-center gap-x-4">
          <AppIcon name="flag" class="size-5 shrink-0 text-gray-400" />
          <div class="relative">
            <label for="task-priority" class="sr-only">Priority</label>
            <select
              id="task-priority"
              v-model="form.priority"
              class="cursor-pointer appearance-none rounded-lg bg-gray-100 py-2 pr-8 pl-3 text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-2 focus:outline-accent"
            >
              <option :value="null">No priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <AppIcon
              name="chevron-down"
              class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-gray-500"
            />
          </div>
        </div>

        <div class="flex items-start gap-x-4">
          <AppIcon name="lines" class="mt-2 size-5 shrink-0 text-gray-400" />
          <label for="task-description" class="sr-only">Description</label>
          <textarea
            id="task-description"
            v-model="form.description"
            rows="2"
            placeholder="Add description"
            class="w-full resize-none rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 hover:bg-gray-200 focus:outline-2 focus:outline-accent"
          ></textarea>
        </div>
      </div>

      <p v-if="error" role="alert" class="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {{ error }}
      </p>
      <div
        v-if="conflict"
        role="alert"
        class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
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
        class="mt-4 rounded-lg bg-gray-50 p-3 text-sm"
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
            class="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
            @click="remove('this')"
          >
            Only this occurrence
          </button>
          <button
            type="button"
            :disabled="busy"
            class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
            @click="remove('all')"
          >
            {{ editingInstance?.isRecurring ? 'All occurrences' : 'Delete' }}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
            @click="confirmingDelete = false"
          >
            Cancel
          </button>
        </div>
      </div>

      <div class="mt-5 flex items-center gap-x-2">
        <button
          v-if="isEdit && !confirmingDelete"
          type="button"
          class="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          @click="confirmingDelete = true"
        >
          Delete
        </button>
        <button
          type="button"
          class="ml-auto cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          @click="ui.closeCreate()"
        >
          Cancel
        </button>
        <button
          type="submit"
          :disabled="busy"
          class="inline-flex h-9 items-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:opacity-60"
        >
          {{ busy ? 'Saving…' : conflict ? 'Save again' : 'Save' }}
        </button>
      </div>
    </form>
  </section>
</template>
