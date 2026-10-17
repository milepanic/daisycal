<script setup lang="ts">
/** Tasks page (mockup tasks.html): one column per visible task list. */
import { watch } from 'vue'

import { useCalendarsStore } from '@/stores/calendars'
import { useTasksStore } from '@/stores/tasks'
import TasksToolbar from '@/components/shell/TasksToolbar.vue'
import TaskList from '@/components/tasks/TaskList.vue'

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
      <TaskList v-for="list in calendars.visibleTaskLists" :key="list.url" :list="list" />
      <p
        v-if="calendars.status === 'ready' && calendars.visibleTaskLists.length === 0"
        class="p-4 text-sm text-gray-400"
      >
        {{
          calendars.taskLists.length === 0
            ? 'No task lists on the server.'
            : 'No task lists are visible. Enable one in the sidebar.'
        }}
      </p>
    </div>
  </main>
</template>
