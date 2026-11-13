<script setup lang="ts">
/**
 * "Add a task" button that turns into an inline form: title, optional due date and 24h time
 * (the same date / time pickers as the create popup).
 * Used by the task list columns (Tasks view) and the calendar's tasks panel. With `parent` it
 * is the open form for a new subtask of that task (no button; Esc / Cancel emit `close`).
 */
import { nextTick, onMounted, ref } from 'vue'

import type { Collection } from '@/api/collections'
import type { Task, TaskForm } from '@/api/ical'
import { parseDateKey } from '@/lib/dates'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import TaskDot from '@/components/ui/TaskDot.vue'
import DatePicker from '@/components/ui/DatePicker.vue'
import TimeInput from '@/components/ui/TimeInput.vue'

const props = defineProps<{ list: Collection | undefined; color: string; parent?: Task }>()
const emit = defineEmits<{ close: [] }>()
/** Whether the form is open (the parent hides its "No open tasks" hint meanwhile). */
const adding = defineModel<boolean>('adding', { default: false })

onMounted(() => {
  if (props.parent) void startAdd()
})

const tasks = useTasksStore()
const notifications = useNotificationsStore()
const ui = useUiStore()

const newTitle = ref('')
const newDate = ref('')
const newTime = ref('')
const newInput = ref<HTMLInputElement | null>(null)

/** The × clears the time first, then the date (as in the create popup). */
function clearDue() {
  if (newTime.value) newTime.value = ''
  else newDate.value = ''
}

async function startAdd() {
  adding.value = true
  await nextTick()
  newInput.value?.focus()
}

function cancelAdd() {
  adding.value = false
  newTitle.value = ''
  newDate.value = ''
  newTime.value = ''
  if (props.parent) emit('close')
}

function newDue(): { due: Date | null; dueAllDay: boolean } {
  const d = parseDateKey(newDate.value)
  if (!d) return { due: null, dueAllDay: true }
  if (newTime.value) {
    d.setHours(Number(newTime.value.slice(0, 2)), Number(newTime.value.slice(3, 5)), 0, 0)
    return { due: d, dueAllDay: false }
  }
  return { due: d, dueAllDay: true }
}

async function submitAdd() {
  const title = newTitle.value.trim()
  const list = props.list
  if (!title || !list) {
    cancelAdd()
    return
  }
  const form: TaskForm = {
    summary: title,
    description: '',
    ...newDue(),
    priority: null,
    alarm: null,
    parentUid: props.parent?.uid ?? null,
  }
  newTitle.value = ''
  newDate.value = ''
  newTime.value = ''
  try {
    await tasks.createTask(list, form)
  } catch (err) {
    notifications.reportError(err, `Could not add "${title}"`, () => tasks.createTask(list, form))
  }
}
</script>

<template>
  <form
    v-if="adding"
    class="mt-1 rounded-sm bg-gray-50 px-2 py-2"
    :class="parent ? 'ml-7' : ''"
    data-testid="inline-add"
    @submit.prevent="submitAdd"
  >
    <div class="flex items-center gap-x-3">
      <span class="grid size-4 shrink-0 place-items-center"><TaskDot :color="color" /></span>
      <input
        ref="newInput"
        v-model="newTitle"
        type="text"
        :placeholder="parent ? 'Subtask title' : 'Task title'"
        :aria-label="parent ? `New subtask of ${parent.summary}` : 'New task title'"
        class="min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        @keydown.escape.prevent="cancelAdd"
      />
    </div>
    <!-- Same date / time fields as the event and task popup. -->
    <div class="mt-2 flex flex-wrap items-center gap-1 pl-7 text-sm">
      <DatePicker
        v-model="newDate"
        label="New task due date"
        :week-start="ui.weekStart"
        placeholder="No due date"
      />
      <TimeInput v-if="newDate && newTime" v-model="newTime" label="New task due time" />
      <button
        v-if="newDate && !newTime"
        type="button"
        class="rounded-sm px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        @click="newTime = '09:00'"
      >
        Add time
      </button>
      <button
        v-if="newDate"
        type="button"
        class="flex size-7 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        @click="clearDue"
      >
        <span class="sr-only">{{ newTime ? 'Remove time' : 'Remove due date' }}</span>
        <AppIcon name="close" class="size-4" />
      </button>
    </div>
    <div class="mt-1.5 flex items-center pl-7 text-xs">
      <span class="ml-auto flex gap-x-1">
        <button type="button" class="btn btn-sm btn-ghost" @click="cancelAdd">Cancel</button>
        <button type="submit" class="btn btn-sm btn-primary">Add</button>
      </span>
    </div>
  </form>
  <button
    v-else-if="!parent"
    type="button"
    class="mt-1 flex w-full items-center gap-x-3 rounded-sm px-2 py-2 text-sm font-semibold text-accent hover:bg-accent/10"
    :disabled="!list"
    @click="startAdd"
  >
    <AppIcon name="plus" class="size-5" />
    Add a task
  </button>
</template>
