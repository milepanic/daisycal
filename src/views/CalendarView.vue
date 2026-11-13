<script setup lang="ts">
/** Calendar page: toolbar, the active view (day / work week / week / month / agenda) and the tasks panel. */
import { computed, nextTick, ref, watch } from 'vue'

import type { EventInstance, Task } from '@/api/ical'
import { useCalendarRoute } from '@/composables/useCalendarRoute'
import { eachDay } from '@/lib/dates'
import { slideIn } from '@/lib/motion'
import { eventToForm, taskToForm } from '@/api/ical'
import { useCalendarsStore } from '@/stores/calendars'
import { useNotificationsStore } from '@/stores/notifications'
import { useEventsStore } from '@/stores/events'
import { useTasksStore } from '@/stores/tasks'
import { useBirthdaysStore } from '@/stores/birthdays'
import { BIRTHDAYS_COLOR, BIRTHDAYS_NAME, BIRTHDAYS_URL } from '@/lib/birthdays'
import { useWeatherStore } from '@/stores/weather'
import { type Anchor, useUiStore } from '@/stores/ui'
import AgendaView from '@/components/calendar/AgendaView.vue'
import EventPopover from '@/components/calendar/EventPopover.vue'
import TaskPopover from '@/components/calendar/TaskPopover.vue'
import MonthView from '@/components/calendar/MonthView.vue'
import TasksPanel from '@/components/calendar/TasksPanel.vue'
import TimeGrid from '@/components/calendar/TimeGrid.vue'
import CalendarToolbar from '@/components/shell/CalendarToolbar.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

const nav = useCalendarRoute()
/** The time grid, so tasks dragged out of the tasks panel can be dropped onto it. */
const grid = ref<InstanceType<typeof TimeGrid> | null>(null)
function grabFromPanel(task: Task, e: PointerEvent) {
  if (isGrid.value) grid.value?.grabExternalTask(task, e)
}
const ui = useUiStore()
const calendars = useCalendarsStore()
const events = useEventsStore()
const tasks = useTasksStore()
const notifications = useNotificationsStore()
const weather = useWeatherStore()
const birthdays = useBirthdaysStore()
// A forecast older than 3 hours is reloaded when the calendar opens.
weather.refresh()

watch(
  () => [ui.visibleRange, calendars.status] as const,
  ([range, status]) => {
    if (status === 'ready') {
      void events.ensureLoaded(range)
      void tasks.ensureLoaded()
    }
  },
  { immediate: true },
)

// Events plus the read-only birthdays from contacts.
const instances = computed(() =>
  [...events.instancesFor(ui.visibleRange), ...birthdays.instancesFor(ui.visibleRange)].sort(
    (a, b) => +a.start - +b.start || +a.end - +b.end,
  ),
)
const dueTasks = computed(() => tasks.tasksDueIn(ui.visibleRange))
const pendingTasks = computed(() => tasks.overdueTasks())
/**
 * Prev / next / Today within the same view: the view slides in from the side it comes from
 * (later dates from the right). Switching views uses the "view" transition instead.
 */
const viewport = ref<HTMLElement | null>(null)
watch(
  () => [ui.view, ui.visibleRange.start.getTime()] as const,
  async ([view, start], [prevView, prevStart]) => {
    if (view !== prevView || start === prevStart) return
    await nextTick()
    slideIn(viewport.value?.lastElementChild, start > prevStart ? 28 : -28, 0)
  },
)

const loading = computed(() => calendars.status === 'loading' || events.isLoading(ui.visibleRange))
const loadError = computed(() => events.loadError(ui.visibleRange))
function retryLoad() {
  void events.ensureLoaded(ui.visibleRange)
}
const days = computed(() => eachDay(ui.visibleRange))
const isGrid = computed(
  () =>
    ui.view === 'day' ||
    ui.view === 'week' ||
    ui.view === 'work-week' ||
    (ui.view === 'custom' && ui.customDays <= 7),
)
/** Month-style grid: the month, or a custom pick longer than a week (whole weeks shown). */
const isMonthGrid = computed(
  () => ui.view === 'month' || (ui.view === 'custom' && ui.customDays > 7),
)
const selectedKey = computed(() =>
  ui.selection ? `${ui.selection.objectUrl}|${ui.selection.recurrenceId ?? ''}` : null,
)
const selectedInstance = computed(() =>
  ui.selection && ui.selection.kind !== 'task'
    ? instances.value.find(
        (i) =>
          i.objectUrl === ui.selection!.objectUrl &&
          (i.recurrenceId?.toString() ?? null) === ui.selection!.recurrenceId,
      )
    : undefined,
)

const colorFor = (url: string) =>
  url === BIRTHDAYS_URL ? BIRTHDAYS_COLOR : calendars.colorFor(url)
const nameFor = (url: string) =>
  url === BIRTHDAYS_URL ? BIRTHDAYS_NAME : (calendars.get(url)?.displayName ?? '')

function anchorOf(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}
function selectEvent(instance: EventInstance, el: HTMLElement) {
  ui.select({
    objectUrl: instance.objectUrl,
    recurrenceId: instance.recurrenceId?.toString() ?? null,
    anchor: anchorOf(el),
  })
}
/** A task opens its details popover, like an event (Google Calendar). */
function selectTask(task: Task, el: HTMLElement) {
  ui.select({ kind: 'task', objectUrl: task.objectUrl, recurrenceId: null, anchor: anchorOf(el) })
}
const selectedTask = computed(() =>
  ui.selection?.kind === 'task' ? tasks.get(ui.selection.objectUrl) : undefined,
)
/** Drag/resize in the grid. Recurring events change only the dragged occurrence. */
async function moveEvent(instance: EventInstance, start: Date, end: Date) {
  const run = () =>
    events.updateEvent(
      instance,
      { ...eventToForm(instance), start, end },
      instance.isRecurring ? 'this' : 'all',
      { undoLabel: `Moved "${instance.summary || '(No title)'}"` },
    )
  try {
    await run()
  } catch (err) {
    notifications.reportError(err, `Could not move "${instance.summary}"`, run)
  }
}

/** A task chip's bottom edge dragged in the grid: how many minutes the task takes. */
async function setTaskDuration(task: Task, minutes: number) {
  const run = () =>
    tasks.updateTask(
      task,
      { ...taskToForm(task), duration: minutes },
      { undoLabel: `Changed the length of "${task.summary || '(No title)'}"` },
    )
  try {
    await run()
  } catch (err) {
    notifications.reportError(err, `Could not change "${task.summary}"`, run)
  }
}

/** The travel time box's top edge dragged in the grid: the new travel minutes. */
async function setTravel(instance: EventInstance, minutes: number) {
  const run = () =>
    events.updateEvent(
      instance,
      { ...eventToForm(instance), travel: minutes },
      instance.isRecurring ? 'this' : 'all',
      { undoLabel: `Changed travel time of "${instance.summary || '(No title)'}"` },
    )
  try {
    await run()
  } catch (err) {
    notifications.reportError(err, `Could not change "${instance.summary}"`, run)
  }
}

/** A task chip dragged in the grid gets the new due date and time. */
async function moveTask(task: Task, due: Date) {
  const run = () =>
    tasks.updateTask(
      task,
      { ...taskToForm(task), due, dueAllDay: false },
      { undoLabel: `Moved "${task.summary || '(No title)'}"` },
    )
  try {
    await run()
  } catch (err) {
    notifications.reportError(err, `Could not move "${task.summary}"`, run)
  }
}

/** Alt + drag: a single copy of the event (or of this occurrence) at the new time. */
async function copyEvent(instance: EventInstance, start: Date, end: Date) {
  const target = calendars.get(instance.collectionUrl)
  if (!target) return
  const run = () =>
    events.createEvent(
      target,
      { ...eventToForm(instance), start, end, repeat: null },
      { undoLabel: `Copied "${instance.summary || '(No title)'}"` },
    )
  try {
    await run()
  } catch (err) {
    notifications.reportError(err, `Could not copy "${instance.summary}"`, run)
  }
}

/** Alt + drag on a task: a copy with the new due time. */
async function copyTask(task: Task, due: Date) {
  const target = calendars.get(task.collectionUrl)
  if (!target) return
  const run = () =>
    tasks.createTask(
      target,
      { ...taskToForm(task), due, dueAllDay: false },
      { undoLabel: `Copied "${task.summary || '(No title)'}"` },
    )
  try {
    await run()
  } catch (err) {
    notifications.reportError(err, `Could not copy "${task.summary}"`, run)
  }
}

function createAt(start: Date, end: Date, allDay: boolean, anchor: Anchor) {
  ui.openCreate({ kind: 'event', start, end, allDay, anchor })
}
const draftColor = computed(() =>
  ui.createDraft?.collectionUrl
    ? calendars.colorFor(ui.createDraft.collectionUrl)
    : (calendars.calendars[0]?.color ?? '#566c86'),
)
</script>

<template>
  <CalendarToolbar />

  <div class="flex min-h-0 flex-1 gap-x-2">
    <div
      ref="viewport"
      class="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-card"
    >
      <div
        v-if="loadError"
        class="mx-2 mt-2 flex items-center gap-x-3 rounded-xl bg-red-50 px-3 py-2.5"
        role="alert"
        data-testid="load-error"
      >
        <AppIcon name="warning" class="size-5 shrink-0 text-red-600" />
        <p class="min-w-0 flex-1 text-[13px] text-red-800">
          <span class="font-semibold">Could not load this period.</span>
          {{ loadError }}
        </p>
        <button type="button" class="btn btn-sm btn-secondary" @click="retryLoad">Retry</button>
      </div>
      <!-- A thin bar while refreshing what is already on screen (the grid shows placeholder
           blocks while it is still empty). -->
      <div
        v-if="loading && instances.length > 0"
        class="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden"
        data-testid="loading-bar"
      >
        <div class="h-full w-1/3 animate-pulse bg-accent"></div>
      </div>

      <Transition name="view" mode="out-in">
        <TimeGrid
          v-if="isGrid"
          ref="grid"
          :key="ui.view"
          :days="days"
          :instances="instances"
          :tasks="dueTasks"
          :color-for="colorFor"
          :selected-key="selectedKey"
          :draft="ui.createDraft"
          :draft-color="draftColor"
          :pending-tasks="pendingTasks"
          :weather-for="weather.forDay"
          :loading="loading"
          @select-event="selectEvent"
          @select-task="selectTask"
          @create-at="createAt"
          @move-event="moveEvent"
          @move-task="moveTask"
          @set-travel="setTravel"
          @set-task-duration="setTaskDuration"
          @copy-event="copyEvent"
          @copy-task="copyTask"
        />
        <MonthView
          v-else-if="isMonthGrid"
          :range="ui.visibleRange"
          :month="ui.currentDate.getMonth()"
          :focus="ui.view === 'custom' ? ui.selectedRange : null"
          :instances="instances"
          :tasks="dueTasks"
          :pending-tasks="pendingTasks"
          :color-for="colorFor"
          :selected-key="selectedKey"
          @select-event="selectEvent"
          @select-task="selectTask"
          @create-at="createAt"
          @show-more="(d) => nav.go('day', d)"
        />
        <AgendaView
          v-else
          :range="ui.visibleRange"
          :instances="instances"
          :tasks="dueTasks"
          :color-for="colorFor"
          :name-for="nameFor"
          :selected-key="selectedKey"
          @select-event="selectEvent"
          @select-task="selectTask"
        />
      </Transition>
    </div>

    <Transition name="panel">
      <TasksPanel v-show="ui.tasksPanelOpen" @grab="grabFromPanel" />
    </Transition>
  </div>

  <Transition name="pop">
    <EventPopover
      v-if="selectedInstance"
      :instance="selectedInstance"
      :anchor="ui.selection?.anchor"
      @close="ui.select(null)"
    />
  </Transition>
  <Transition name="pop">
    <TaskPopover
      v-if="selectedTask"
      :task="selectedTask"
      :anchor="ui.selection?.anchor"
      @close="ui.select(null)"
    />
  </Transition>
</template>
