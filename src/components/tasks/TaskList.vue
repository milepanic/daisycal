<script setup lang="ts">
/**
 * One task list column (mockup tasks.html section): header, inline "Add a task", open tasks,
 * collapsible "Completed (N)". Writes go through the tasks store.
 */
import { computed, nextTick, ref } from 'vue'

import type { Collection } from '@/api/collections'
import type { Task } from '@/api/ical'
import { useCalendarsStore } from '@/stores/calendars'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import TaskRow from './TaskRow.vue'

const props = defineProps<{ list: Collection }>()

const calendars = useCalendarsStore()
const tasks = useTasksStore()
const ui = useUiStore()
const notifications = useNotificationsStore()

const color = computed(() => calendars.colorFor(props.list.url))
const all = computed(() => tasks.tasksFor(props.list.url, { includeCompleted: true }))
const open = computed(() => all.value.filter((t) => !t.completed))
const completed = computed(() => all.value.filter((t) => t.completed))
const loading = computed(() => tasks.isLoading(props.list.url) && all.value.length === 0)
const listError = computed(() => tasks.listError(props.list.url))

const adding = ref(false)
const newTitle = ref('')
const newInput = ref<HTMLInputElement | null>(null)

async function startAdd() {
  adding.value = true
  await nextTick()
  newInput.value?.focus()
}

function cancelAdd() {
  adding.value = false
  newTitle.value = ''
}

async function submitAdd() {
  const title = newTitle.value.trim()
  if (!title) {
    cancelAdd()
    return
  }
  newTitle.value = ''
  try {
    await tasks.createTask(props.list, {
      summary: title,
      description: '',
      due: null,
      dueAllDay: true,
      priority: null,
      alarm: null,
    })
  } catch (err) {
    notifications.reportError(err, `Could not add "${title}"`, () =>
      tasks.createTask(props.list, {
        summary: title,
        description: '',
        due: null,
        dueAllDay: true,
        priority: null,
        alarm: null,
      }),
    )
  }
}

async function toggle(task: Task, done: boolean) {
  try {
    await tasks.setCompleted(task, done)
  } catch (err) {
    notifications.reportError(err, `Could not update "${task.summary}"`, () =>
      tasks.setCompleted(task, done),
    )
  }
}

function openTask(task: Task) {
  ui.openCreate({
    kind: 'task',
    collectionUrl: task.collectionUrl,
    edit: { objectUrl: task.objectUrl, recurrenceId: null },
  })
}

function openDetailed() {
  ui.openCreate({ kind: 'task', collectionUrl: props.list.url })
}
</script>

<template>
  <section
    class="flex max-h-full w-80 shrink-0 flex-col rounded-2xl bg-white p-2"
    :data-list="list.url"
  >
    <div class="flex items-center gap-x-2 px-2 pt-1 pb-1">
      <span class="size-2.5 shrink-0 rounded-sm" :style="{ backgroundColor: color }"></span>
      <h2 class="truncate text-lg font-normal text-gray-900">{{ list.displayName }}</h2>
      <span v-if="open.length" class="text-xs text-gray-400">{{ open.length }}</span>
      <button
        type="button"
        class="ml-auto rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        title="New task with details"
        @click="openDetailed"
      >
        <span class="sr-only">New task with details</span>
        <AppIcon name="dots" class="size-5" />
      </button>
    </div>

    <form
      v-if="adding"
      class="mt-1 flex items-center gap-x-3 rounded-lg bg-gray-50 px-2 py-1.5"
      @submit.prevent="submitAdd"
    >
      <span class="size-4 shrink-0 rounded-full" :style="{ backgroundColor: color + '33' }"></span>
      <input
        ref="newInput"
        v-model="newTitle"
        type="text"
        placeholder="Task title"
        aria-label="New task title"
        class="min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        @keydown.escape.prevent="cancelAdd"
        @blur="submitAdd"
      />
    </form>
    <button
      v-else
      type="button"
      class="mt-1 flex w-full items-center gap-x-3 rounded-lg px-2 py-2 text-sm font-semibold text-accent hover:bg-accent/10"
      @click="startAdd"
    >
      <AppIcon name="plus" class="size-5" />
      Add a task
    </button>

    <p
      v-if="listError"
      class="mx-2 mt-1 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700"
      role="alert"
    >
      {{ listError }}
    </p>

    <div class="mt-1 min-h-0 overflow-y-auto">
      <p v-if="loading" class="px-2 py-2 text-sm text-gray-400">Loading…</p>
      <p v-else-if="open.length === 0 && !adding" class="px-2 py-2 text-sm text-gray-400">
        No open tasks.
      </p>
      <ul class="space-y-0.5">
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
  </section>
</template>
