<script setup lang="ts">
/**
 * Details popover for a task clicked in the calendar (Google Calendar style): due date, list,
 * notes, and Mark completed / Edit / Delete. It works like the event popover.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { ConflictError } from '@/api/errors'
import type { Task } from '@/api/ical'
import { formatTime } from '@/lib/format'
import { playCompleteSound } from '@/lib/sounds'
import { formatPickerDate } from '@/lib/timeInput'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { useCalendarsStore } from '@/stores/calendars'
import { useTasksStore } from '@/stores/tasks'
import { type Anchor, useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import TaskDot from '@/components/ui/TaskDot.vue'

const props = defineProps<{ task: Task; anchor?: Anchor }>()
const emit = defineEmits<{ close: [] }>()

const calendars = useCalendarsStore()
const tasks = useTasksStore()
const ui = useUiStore()

const root = ref<HTMLElement | null>(null)
useFocusTrap(root)
const confirming = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

const color = computed(() => calendars.colorFor(props.task.collectionUrl))
const listName = computed(() => calendars.get(props.task.collectionUrl)?.displayName ?? '')
const when = computed(() => {
  const { due, dueAllDay } = props.task
  if (!due) return 'No due date'
  return dueAllDay ? formatPickerDate(due) : `${formatPickerDate(due)} · ${formatTime(due)}`
})
const priorityLabel = computed(() =>
  props.task.priority ? props.task.priority[0]!.toUpperCase() + props.task.priority.slice(1) : null,
)

/** Same placement as the event popover: beside the chip, kept inside the viewport. */
const style = computed(() => {
  const a = props.anchor
  if (!a) return { top: '5rem', right: '1rem' }
  const width = 320
  const height = 240
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  let left = a.x + a.width + 8
  if (left + width > vw - 8) left = Math.max(8, a.x - width - 8)
  let top = a.y
  if (top + height > vh - 8) top = Math.max(8, vh - height - 8)
  return { top: `${top}px`, left: `${left}px` }
})

function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) emit('close')
}
onMounted(() => {
  root.value?.querySelector<HTMLElement>('button')?.focus()
  setTimeout(() => document.addEventListener('mousedown', onDocClick), 0)
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))

function describe(err: unknown, fallback: string) {
  return err instanceof ConflictError
    ? 'This task changed on another device. It has been refreshed, please try again.'
    : err instanceof Error
      ? err.message
      : fallback
}

async function toggleCompleted() {
  const done = !props.task.completed
  busy.value = true
  error.value = null
  try {
    if (done) playCompleteSound()
    await tasks.setCompleted(props.task, done)
    emit('close')
  } catch (err) {
    error.value = describe(err, 'Could not update the task')
  } finally {
    busy.value = false
  }
}

function edit() {
  ui.openCreate({
    kind: 'task',
    collectionUrl: props.task.collectionUrl,
    edit: { objectUrl: props.task.objectUrl, recurrenceId: null },
  })
}

/** Opens the popup with a copy of this task; Save creates it. */
function duplicate() {
  ui.openCreate({
    kind: 'task',
    collectionUrl: props.task.collectionUrl,
    copyOf: { objectUrl: props.task.objectUrl, recurrenceId: null },
  })
}

async function remove() {
  busy.value = true
  error.value = null
  try {
    await tasks.deleteTask(props.task)
    emit('close')
  } catch (err) {
    error.value = describe(err, 'Could not delete the task')
    confirming.value = false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    ref="root"
    role="dialog"
    aria-label="Task details"
    class="fixed z-40 w-80 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-gray-200"
    :style="style"
    data-testid="task-popover"
  >
    <div class="flex items-start gap-x-3">
      <span class="mt-1 grid size-4 shrink-0 place-items-center">
        <TaskDot :color="color" :checked="task.completed" />
      </span>
      <div class="min-w-0 flex-1">
        <h2
          class="font-display text-base font-bold"
          :class="task.completed ? 'text-gray-400 line-through' : 'text-gray-900'"
        >
          {{ task.summary || '(No title)' }}
        </h2>
        <p class="mt-0.5 text-sm text-gray-600">{{ when }}</p>
      </div>
      <button
        type="button"
        class="-mt-1.5 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
        @click="emit('close')"
      >
        <span class="sr-only">Close</span>
        <AppIcon name="close" class="size-4" />
      </button>
    </div>

    <dl class="mt-3 space-y-1.5 text-sm text-gray-700">
      <div class="flex gap-x-2">
        <dt class="w-20 shrink-0 text-gray-400">List</dt>
        <dd class="flex min-w-0 items-center gap-x-1.5">
          <span class="size-2.5 shrink-0 rounded-sm" :style="{ backgroundColor: color }"></span>
          <span class="truncate">{{ listName }}</span>
        </dd>
      </div>
      <div v-if="priorityLabel" class="flex gap-x-2">
        <dt class="w-20 shrink-0 text-gray-400">Priority</dt>
        <dd>{{ priorityLabel }}</dd>
      </div>
      <div v-if="task.description" class="flex gap-x-2">
        <dt class="w-20 shrink-0 text-gray-400">Notes</dt>
        <dd class="line-clamp-4 whitespace-pre-line">{{ task.description }}</dd>
      </div>
    </dl>

    <p v-if="error" class="mt-3 rounded-sm bg-red-50 px-2 py-1.5 text-xs text-red-700">
      {{ error }}
    </p>

    <div v-if="confirming" class="mt-4 rounded-sm bg-gray-50 p-3 text-sm">
      <p class="font-medium text-gray-900">Delete this task?</p>
      <div class="mt-2 flex gap-2">
        <button
          type="button"
          :disabled="busy"
          class="btn btn-sm btn-danger-solid"
          data-testid="delete-confirm"
          @click="remove"
        >
          Delete
        </button>
        <button type="button" class="btn btn-sm btn-ghost" @click="confirming = false">
          Cancel
        </button>
      </div>
    </div>
    <div v-else class="mt-4 flex flex-wrap gap-2">
      <button type="button" :disabled="busy" class="btn btn-primary" @click="toggleCompleted">
        {{ task.completed ? 'Mark not completed' : 'Mark completed' }}
      </button>
      <button type="button" class="btn btn-secondary" @click="edit" data-testid="edit-button">
        Edit
      </button>
      <button type="button" class="btn btn-secondary" @click="duplicate">Duplicate</button>
      <button
        type="button"
        class="btn btn-danger"
        @click="confirming = true"
        data-testid="delete-button"
      >
        Delete
      </button>
    </div>
  </div>
</template>
