<script setup lang="ts">
/** Tasks page: one column per visible list. Interaction is added in CHECKLIST.md §9. */
import { watch } from 'vue'

import { formatShortDateTime } from '@/lib/format'
import { useCalendarsStore } from '@/stores/calendars'
import { useTasksStore } from '@/stores/tasks'
import TasksToolbar from '@/components/shell/TasksToolbar.vue'

const calendars = useCalendarsStore()
const tasks = useTasksStore()

watch(
  () => calendars.status,
  (status) => {
    if (status === 'ready') void tasks.ensureLoaded()
  },
  { immediate: true },
)
</script>

<template>
  <TasksToolbar />
  <main class="min-h-0 flex-1 overflow-x-auto px-2 pb-2">
    <div class="flex h-full items-start gap-x-3">
      <section
        v-for="list in calendars.visibleTaskLists"
        :key="list.url"
        class="flex max-h-full w-80 shrink-0 flex-col rounded-2xl bg-white p-2"
      >
        <div class="flex items-center gap-x-2 px-2 pt-1 pb-1">
          <span
            class="size-2.5 rounded-sm"
            :style="{ backgroundColor: calendars.colorFor(list.url) }"
          ></span>
          <h2 class="text-lg font-normal text-gray-900">{{ list.displayName }}</h2>
        </div>
        <div class="mt-1 min-h-0 overflow-y-auto">
          <p v-if="tasks.isLoading(list.url)" class="px-2 py-2 text-sm text-gray-400">Loading…</p>
          <ul v-else class="space-y-0.5">
            <li
              v-for="t in tasks.tasksFor(list.url)"
              :key="t.objectUrl"
              class="flex items-start gap-x-3 rounded-lg p-2 hover:bg-gray-50"
              :class="t.completed ? 'text-gray-400 line-through' : 'text-gray-900'"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ t.summary }}</span>
                <span v-if="t.due" class="mt-1 block text-[11px] text-gray-500">{{
                  formatShortDateTime(t.due, !t.dueAllDay)
                }}</span>
              </span>
            </li>
          </ul>
        </div>
      </section>
      <p
        v-if="calendars.status === 'ready' && calendars.visibleTaskLists.length === 0"
        class="p-4 text-sm text-gray-400"
      >
        No task lists are visible. Enable one in the sidebar.
      </p>
    </div>
  </main>
</template>
