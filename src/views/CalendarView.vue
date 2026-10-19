<script setup lang="ts">
/** Calendar page: toolbar, the active view (day / work week / week / month / agenda) and the tasks panel. */
import { computed, watch } from 'vue'

import type { EventInstance, Task } from '@/api/ical'
import { useCalendarRoute } from '@/composables/useCalendarRoute'
import { eachDay } from '@/lib/dates'
import { eventToForm, taskToForm } from '@/api/ical'
import { useCalendarsStore } from '@/stores/calendars'
import { useNotificationsStore } from '@/stores/notifications'
import { useEventsStore } from '@/stores/events'
import { useTasksStore } from '@/stores/tasks'
import { type Anchor, useUiStore } from '@/stores/ui'
import AgendaView from '@/components/calendar/AgendaView.vue'
import EventPopover from '@/components/calendar/EventPopover.vue'
import MonthView from '@/components/calendar/MonthView.vue'
import TasksPanel from '@/components/calendar/TasksPanel.vue'
import TimeGrid from '@/components/calendar/TimeGrid.vue'
import CalendarToolbar from '@/components/shell/CalendarToolbar.vue'

const nav = useCalendarRoute()
const ui = useUiStore()
const calendars = useCalendarsStore()
const events = useEventsStore()
const tasks = useTasksStore()
const notifications = useNotificationsStore()

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

const instances = computed(() => events.instancesFor(ui.visibleRange))
const dueTasks = computed(() => tasks.tasksDueIn(ui.visibleRange))
const loading = computed(() => calendars.status === 'loading' || events.isLoading(ui.visibleRange))
const loadError = computed(() => events.loadError(ui.visibleRange))
const days = computed(() => eachDay(ui.visibleRange))
const isGrid = computed(() => ui.view === 'day' || ui.view === 'week' || ui.view === 'work-week')
const selectedKey = computed(() =>
  ui.selection ? `${ui.selection.objectUrl}|${ui.selection.recurrenceId ?? ''}` : null,
)
const selectedInstance = computed(() =>
  ui.selection
    ? instances.value.find(
        (i) =>
          i.objectUrl === ui.selection!.objectUrl &&
          (i.recurrenceId?.toString() ?? null) === ui.selection!.recurrenceId,
      )
    : undefined,
)

const colorFor = (url: string) => calendars.colorFor(url)
const nameFor = (url: string) => calendars.get(url)?.displayName ?? ''

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
function selectTask(task: Task) {
  ui.openCreate({
    kind: 'task',
    collectionUrl: task.collectionUrl,
    edit: { objectUrl: task.objectUrl, recurrenceId: null },
  })
}
/** Drag/resize in the grid. Recurring events change only the dragged occurrence. */
async function moveEvent(instance: EventInstance, start: Date, end: Date) {
  const run = () =>
    events.updateEvent(
      instance,
      { ...eventToForm(instance), start, end },
      instance.isRecurring ? 'this' : 'all',
    )
  try {
    await run()
  } catch (err) {
    notifications.reportError(err, `Could not move "${instance.summary}"`, run)
  }
}

/** A task chip dragged in the grid gets the new due date and time. */
async function moveTask(task: Task, due: Date) {
  const run = () => tasks.updateTask(task, { ...taskToForm(task), due, dueAllDay: false })
  try {
    await run()
  } catch (err) {
    notifications.reportError(err, `Could not move "${task.summary}"`, run)
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
    <div class="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white">
      <p
        v-if="loadError"
        class="mx-2 mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        role="alert"
      >
        {{ loadError }}
      </p>
      <div
        v-if="loading"
        class="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden"
        data-testid="loading-bar"
      >
        <div class="h-full w-1/3 animate-pulse bg-accent"></div>
      </div>

      <Transition name="fade" mode="out-in">
        <TimeGrid
          v-if="isGrid"
          :key="ui.view"
          :days="days"
          :instances="instances"
          :tasks="dueTasks"
          :color-for="colorFor"
          :selected-key="selectedKey"
          :draft="ui.createDraft"
          :draft-color="draftColor"
          @select-event="selectEvent"
          @select-task="selectTask"
          @create-at="createAt"
          @move-event="moveEvent"
          @move-task="moveTask"
        />
        <MonthView
          v-else-if="ui.view === 'month'"
          :range="ui.visibleRange"
          :month="ui.currentDate.getMonth()"
          :instances="instances"
          :tasks="dueTasks"
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

    <TasksPanel v-show="ui.tasksPanelOpen" />
  </div>

  <Transition name="pop">
    <EventPopover
      v-if="selectedInstance"
      :instance="selectedInstance"
      :anchor="ui.selection?.anchor"
      @close="ui.select(null)"
    />
  </Transition>
</template>
