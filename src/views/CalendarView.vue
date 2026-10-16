<script setup lang="ts">
/**
 * Calendar page: toolbar, the active view card and the tasks panel.
 * The per-view grids are added in CHECKLIST.md §7; until then the card lists loaded instances.
 */
import { computed, watch } from 'vue'

import { useCalendarRoute } from '@/composables/useCalendarRoute'
import { formatShortDateTime, formatTime } from '@/lib/format'
import { useCalendarsStore } from '@/stores/calendars'
import { useEventsStore } from '@/stores/events'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import CalendarToolbar from '@/components/shell/CalendarToolbar.vue'

useCalendarRoute()
const ui = useUiStore()
const calendars = useCalendarsStore()
const events = useEventsStore()
const tasks = useTasksStore()

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
const loading = computed(() => events.isLoading(ui.visibleRange))
const loadError = computed(() => events.loadError(ui.visibleRange))
const dueTasks = computed(() => tasks.tasksDueIn(ui.visibleRange))
</script>

<template>
  <CalendarToolbar />

  <div class="flex min-h-0 flex-1 gap-x-2">
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white">
      <main class="min-h-0 flex-1 overflow-auto px-4 py-3">
        <p v-if="loadError" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {{ loadError }}
        </p>
        <p v-else-if="loading && instances.length === 0" class="text-sm text-gray-400">
          Loading events…
        </p>
        <p v-else-if="instances.length === 0" class="text-sm text-gray-400">
          No events in this period.
        </p>
        <ul v-else class="space-y-1" data-testid="instances">
          <li
            v-for="i in instances"
            :key="`${i.objectUrl}|${i.recurrenceId?.toString() ?? ''}`"
            class="flex items-center gap-x-3 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50"
          >
            <span
              class="size-2.5 shrink-0 rounded-sm"
              :style="{ backgroundColor: calendars.colorFor(i.collectionUrl) }"
            ></span>
            <span class="w-40 shrink-0 text-gray-500">
              {{ i.allDay ? formatShortDateTime(i.start, false) : formatShortDateTime(i.start) }}
              <template v-if="!i.allDay"> – {{ formatTime(i.end) }}</template>
            </span>
            <span class="truncate font-medium text-gray-900">{{ i.summary }}</span>
          </li>
        </ul>
      </main>
    </div>

    <aside
      v-show="ui.tasksPanelOpen"
      id="tasks-panel"
      class="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl bg-white"
    >
      <div class="flex h-16 shrink-0 items-center px-4">
        <span class="text-sm font-semibold text-gray-900">Tasks due</span>
      </div>
      <div class="flex-1 overflow-y-auto px-2 pb-4">
        <p v-if="dueTasks.length === 0" class="px-2 text-sm text-gray-400">
          Nothing due in this period.
        </p>
        <ul v-else class="space-y-0.5">
          <li
            v-for="t in dueTasks"
            :key="t.objectUrl"
            class="flex items-start gap-x-3 rounded-lg p-2 hover:bg-gray-50"
          >
            <span
              class="mt-1 size-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: calendars.colorFor(t.collectionUrl) }"
            ></span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-gray-900">{{ t.summary }}</p>
              <p v-if="t.due" class="mt-1 text-[11px] text-gray-500">
                {{ formatShortDateTime(t.due, !t.dueAllDay) }}
              </p>
            </div>
          </li>
        </ul>
      </div>
    </aside>
  </div>
</template>
