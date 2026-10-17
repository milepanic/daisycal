<script setup lang="ts">
/** The #tasks-panel from the mockup: list picker, add button, open tasks, collapsible completed. */
import { computed, ref, watch } from 'vue'

import type { Task } from '@/api/ical'
import { useCalendarsStore } from '@/stores/calendars'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import TaskRow from '@/components/tasks/TaskRow.vue'

const calendars = useCalendarsStore()
const tasks = useTasksStore()
const ui = useUiStore()
const notifications = useNotificationsStore()

const listUrl = ref<string | null>(null)
watch(
  () => calendars.visibleTaskLists,
  (lists) => {
    if (!listUrl.value || !lists.some((l) => l.url === listUrl.value))
      listUrl.value = lists[0]?.url ?? null
  },
  { immediate: true },
)
const list = computed(() => (listUrl.value ? calendars.get(listUrl.value) : undefined))
const color = computed(() => (listUrl.value ? calendars.colorFor(listUrl.value) : '#7c3aed'))
const all = computed(() =>
  listUrl.value ? tasks.tasksFor(listUrl.value, { includeCompleted: true }) : [],
)
const open = computed(() => all.value.filter((t) => !t.completed))
const completed = computed(() => all.value.filter((t) => t.completed))
const pickerOpen = ref(false)

function openTask(task: Task) {
  ui.openCreate({
    kind: 'task',
    collectionUrl: task.collectionUrl,
    edit: { objectUrl: task.objectUrl, recurrenceId: null },
  })
}

async function toggle(t: Task, done: boolean) {
  try {
    await tasks.setCompleted(t, done)
  } catch (err) {
    notifications.reportError(err, `Could not update "${t.summary}"`, () =>
      tasks.setCompleted(t, done),
    )
  }
}
</script>

<template>
  <aside id="tasks-panel" class="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl bg-white">
    <div class="relative flex h-16 shrink-0 items-center px-4">
      <button
        type="button"
        class="flex items-center gap-x-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-200"
        aria-haspopup="listbox"
        :aria-expanded="pickerOpen"
        @click="pickerOpen = !pickerOpen"
      >
        <span class="size-2.5 rounded-sm" :style="{ backgroundColor: color }"></span>
        {{ list?.displayName ?? 'No task list' }}
        <AppIcon name="chevron-down" class="size-4 text-gray-500" />
      </button>
      <ul
        v-if="pickerOpen"
        role="listbox"
        class="absolute top-14 left-4 z-30 min-w-40 rounded-lg bg-white p-1 shadow-lg ring-1 ring-gray-200"
      >
        <li v-for="l in calendars.visibleTaskLists" :key="l.url">
          <button
            type="button"
            role="option"
            :aria-selected="l.url === listUrl"
            class="flex w-full items-center gap-x-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-100"
            :class="l.url === listUrl ? 'font-semibold text-gray-900' : 'text-gray-700'"
            @click="((listUrl = l.url), (pickerOpen = false))"
          >
            <span
              class="size-2.5 rounded-sm"
              :style="{ backgroundColor: calendars.colorFor(l.url) }"
            ></span>
            {{ l.displayName }}
          </button>
        </li>
      </ul>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-4">
      <button
        type="button"
        class="flex w-full items-center gap-x-3 rounded-lg px-2 py-2 text-sm font-semibold text-accent hover:bg-accent/10"
        :disabled="!listUrl"
        @click="ui.openCreate({ kind: 'task', collectionUrl: listUrl ?? undefined })"
      >
        <AppIcon name="plus" class="size-5" />
        Add a task
      </button>
      <p
        v-if="listUrl && tasks.isLoading(listUrl) && all.length === 0"
        class="px-2 py-2 text-sm text-gray-400"
      >
        Loading…
      </p>
      <p v-else-if="listUrl && open.length === 0" class="px-2 py-2 text-sm text-gray-400">
        No open tasks.
      </p>

      <ul class="mt-1 space-y-0.5">
        <TaskRow
          v-for="t in open"
          :key="t.objectUrl"
          :task="t"
          :color="color"
          @toggle="toggle"
          @open="openTask"
        />
      </ul>

      <details v-if="completed.length && ui.showCompletedTasks" class="group mt-2">
        <summary
          class="flex cursor-pointer list-none items-center gap-x-2 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 [&::-webkit-details-marker]:hidden"
        >
          <AppIcon
            name="chevron-down"
            class="size-4 -rotate-90 text-gray-400 transition-transform group-open:rotate-0"
          />
          Completed ({{ completed.length }})
        </summary>
        <ul class="mt-1 space-y-0.5">
          <TaskRow
            v-for="t in completed"
            :key="t.objectUrl"
            :task="t"
            :color="color"
            @toggle="toggle"
            @open="openTask"
          />
        </ul>
      </details>
    </div>
  </aside>
</template>
