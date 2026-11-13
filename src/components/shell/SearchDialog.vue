<script setup lang="ts">
/**
 * Search (Ctrl/Cmd+K, "/" or the toolbar button): events and tasks by title, location and
 * notes. Opening it loads events six months back and ahead so more than the visible week is
 * searched. ↑/↓ move, Enter opens, Esc closes.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import type { EventInstance, Task } from '@/api/ical'
import { useCalendarRoute } from '@/composables/useCalendarRoute'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { addMonths, startOfDay } from '@/lib/dates'
import { formatTime } from '@/lib/format'
import { searchEvents, searchTasks } from '@/lib/search'
import { dueLabel } from '@/lib/taskBadge'
import { formatPickerDate } from '@/lib/timeInput'
import { useCalendarsStore } from '@/stores/calendars'
import { useEventsStore } from '@/stores/events'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import TaskDot from '@/components/ui/TaskDot.vue'

const ui = useUiStore()
const events = useEventsStore()
const tasks = useTasksStore()
const calendars = useCalendarsStore()
const nav = useCalendarRoute()

const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
useFocusTrap(root)

const query = ref('')
const active = ref(0)
/** The months searched for events. */
const range = (() => {
  const today = startOfDay(new Date())
  return { start: addMonths(today, -6), end: addMonths(today, 7) }
})()
const loading = ref(true)

onMounted(async () => {
  await nextTick()
  input.value?.focus()
  await Promise.allSettled([events.ensureLoaded(range), tasks.ensureLoaded()])
  loading.value = false
})

type Result = { kind: 'event'; instance: EventInstance } | { kind: 'task'; task: Task }
const MAX = 30

const results = computed<Result[]>(() => {
  const q = query.value.trim()
  if (!q) return []
  const evs = searchEvents(events.instancesFor(range), q).map((instance): Result => ({
    kind: 'event',
    instance,
  }))
  const tks = searchTasks(
    [...tasks.all.values()].filter((t) => calendars.isVisible(t.collectionUrl)),
    q,
  ).map((task): Result => ({ kind: 'task', task }))
  return [...evs, ...tks].slice(0, MAX)
})
watch(query, () => (active.value = 0))

function when(r: Result): string {
  if (r.kind === 'task') return r.task.due ? dueLabel(r.task.due, r.task.dueAllDay) : 'No due date'
  const i = r.instance
  return i.allDay
    ? formatPickerDate(i.start, { short: true })
    : `${formatPickerDate(i.start, { short: true })} · ${formatTime(i.start)}`
}
const collectionOf = (r: Result) =>
  r.kind === 'event' ? r.instance.collectionUrl : r.task.collectionUrl

function close() {
  ui.searchOpen = false
}

async function open(r: Result) {
  close()
  if (r.kind === 'task') {
    ui.openCreate({
      kind: 'task',
      collectionUrl: r.task.collectionUrl,
      edit: { objectUrl: r.task.objectUrl, recurrenceId: null },
    })
    return
  }
  // Jump to the event's day in the calendar and show its details.
  await nav.go(ui.view, r.instance.start)
  ui.select({
    objectUrl: r.instance.objectUrl,
    recurrenceId: r.instance.recurrenceId?.toString() ?? null,
  })
}

function onKeydown(e: KeyboardEvent) {
  const n = results.value.length
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
  } else if (e.key === 'ArrowDown' && n) {
    e.preventDefault()
    active.value = (active.value + 1) % n
    scrollActive()
  } else if (e.key === 'ArrowUp' && n) {
    e.preventDefault()
    active.value = (active.value - 1 + n) % n
    scrollActive()
  } else if (e.key === 'Enter' && n) {
    e.preventDefault()
    void open(results.value[active.value]!)
  }
}

async function scrollActive() {
  await nextTick()
  root.value?.querySelector(`[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' })
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[12vh]"
    @mousedown.self="close"
  >
    <div
      ref="root"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      class="modal-panel flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200"
      data-testid="search-dialog"
      @keydown="onKeydown"
    >
      <div class="flex items-center gap-x-3 border-b border-gray-100 px-4">
        <AppIcon name="search" class="size-5 shrink-0 text-gray-400" />
        <input
          ref="input"
          v-model="query"
          type="search"
          placeholder="Search events and tasks"
          aria-label="Search events and tasks"
          autocomplete="off"
          class="h-14 min-w-0 flex-1 bg-transparent text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        <kbd class="hidden rounded-sm bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500 sm:inline"
          >Esc</kbd
        >
      </div>
      <ul
        v-if="results.length"
        role="listbox"
        aria-label="Results"
        class="min-h-0 overflow-y-auto p-2"
      >
        <li
          v-for="(r, i) in results"
          :key="
            r.kind === 'event'
              ? `${r.instance.objectUrl}|${r.instance.recurrenceId ?? ''}`
              : r.task.objectUrl
          "
          role="option"
          :aria-selected="i === active"
          :data-index="i"
          class="flex cursor-pointer items-center gap-x-3 rounded-sm px-3 py-2"
          :class="i === active ? 'bg-gray-100' : 'hover:bg-gray-50'"
          @mousemove="active = i"
          @click="open(r)"
        >
          <span class="grid size-4 shrink-0 place-items-center">
            <TaskDot
              v-if="r.kind === 'task'"
              :color="calendars.colorFor(r.task.collectionUrl)"
              :checked="r.task.completed"
            />
            <span
              v-else
              class="size-3 rounded-sm"
              :style="{ backgroundColor: calendars.colorFor(r.instance.collectionUrl) }"
            ></span>
          </span>
          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-sm"
              :class="
                r.kind === 'task' && r.task.completed
                  ? 'text-gray-400 line-through'
                  : 'text-gray-900'
              "
              >{{
                (r.kind === 'event' ? r.instance.summary : r.task.summary) || '(No title)'
              }}</span
            >
            <span class="block truncate text-xs text-gray-500">
              {{ when(r) }} · {{ calendars.get(collectionOf(r))?.displayName ?? '' }}
              <template v-if="r.kind === 'event' && r.instance.location">
                · {{ r.instance.location }}</template
              >
            </span>
          </span>
          <AppIcon v-if="r.kind === 'task'" name="tasks" class="size-4 shrink-0 text-gray-300" />
          <AppIcon v-else name="calendar" class="size-4 shrink-0 text-gray-300" />
        </li>
      </ul>
      <p v-else-if="query.trim()" class="px-4 py-6 text-center text-sm text-gray-500">
        {{ loading ? 'Searching…' : 'Nothing found.' }}
      </p>
      <p v-else class="px-4 py-6 text-center text-sm text-gray-400">
        Titles, locations and notes, six months back and ahead.
      </p>
    </div>
  </div>
</template>
