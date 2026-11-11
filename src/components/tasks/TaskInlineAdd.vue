<script setup lang="ts">
/**
 * "Add a task" button that turns into an inline form: title, optional due date and 24h time.
 * Used by the task list columns (Tasks view) and the calendar's tasks panel.
 */
import { computed, nextTick, ref } from 'vue'

import type { Collection } from '@/api/collections'
import type { TaskForm } from '@/api/ical'
import { parseDateKey, toDateKey } from '@/lib/dates'
import { dateShortcuts, formatPickerDate } from '@/lib/timeInput'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import TaskDot from '@/components/ui/TaskDot.vue'
import DatePicker from '@/components/ui/DatePicker.vue'
import TimeInput from '@/components/ui/TimeInput.vue'

const props = defineProps<{ list: Collection | undefined; color: string }>()
/** Whether the form is open (the parent hides its "No open tasks" hint meanwhile). */
const adding = defineModel<boolean>('adding', { default: false })

const tasks = useTasksStore()
const notifications = useNotificationsStore()
const ui = useUiStore()

const newTitle = ref('')
const newDate = ref('')
const newTime = ref('')
const newInput = ref<HTMLInputElement | null>(null)

const shortcuts = computed(() => dateShortcuts(new Date(), ui.weekStart))
/** A picked date that is none of the chips is shown on the calendar button. */
const otherDate = computed(() => {
  const d = parseDateKey(newDate.value)
  return d && !shortcuts.value.some((q) => toDateKey(q.date) === newDate.value)
    ? formatPickerDate(d, { short: true })
    : ''
})

function toggleShortcut(key: string) {
  newDate.value = newDate.value === key ? '' : key
  if (!newDate.value) newTime.value = ''
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
    class="mt-1 rounded-sm bg-gray-50 px-2 py-1.5"
    data-testid="inline-add"
    @submit.prevent="submitAdd"
  >
    <div class="flex items-center gap-x-3">
      <span class="grid size-4 shrink-0 place-items-center"><TaskDot :color="color" /></span>
      <input
        ref="newInput"
        v-model="newTitle"
        type="text"
        placeholder="Task title"
        aria-label="New task title"
        class="min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        @keydown.escape.prevent="cancelAdd"
      />
    </div>
    <div class="mt-1.5 flex flex-wrap items-center gap-1 pl-7 text-xs" data-testid="due-shortcuts">
      <button
        v-for="q in shortcuts"
        :key="q.key"
        type="button"
        class="rounded-sm px-1.5 py-0.5 font-medium ring-1"
        :class="
          newDate === toDateKey(q.date)
            ? 'bg-gray-900 text-white ring-gray-900'
            : 'bg-white text-gray-600 ring-gray-200 hover:text-gray-900'
        "
        :aria-pressed="newDate === toDateKey(q.date)"
        @click="toggleShortcut(toDateKey(q.date))"
      >
        {{ q.label }}
      </button>
      <DatePicker
        v-model="newDate"
        label="New task due date"
        :week-start="ui.weekStart"
        ghost
        :text="otherDate"
        title="Pick a date"
      >
        <template #icon><AppIcon name="calendar" class="size-4" /></template>
      </DatePicker>
      <button
        v-if="otherDate"
        type="button"
        class="rounded-sm p-0.5 text-gray-400 hover:bg-white hover:text-gray-700"
        @click="toggleShortcut(newDate)"
      >
        <span class="sr-only">Remove due date</span>
        <AppIcon name="close" class="size-3.5" />
      </button>
    </div>
    <div class="mt-1.5 flex flex-wrap items-center gap-1.5 pl-7 text-xs">
      <TimeInput v-if="newDate && newTime" v-model="newTime" label="New task due time" size="sm" />
      <button
        v-if="newDate && !newTime"
        type="button"
        class="rounded-sm px-2 py-1 font-medium text-gray-500 hover:bg-white hover:text-gray-900"
        @click="newTime = '09:00'"
      >
        Add time
      </button>
      <button
        v-if="newTime"
        type="button"
        class="rounded-sm px-2 py-1 font-medium text-gray-500 hover:bg-white hover:text-gray-900"
        @click="newTime = ''"
      >
        No time
      </button>
      <span class="ml-auto flex gap-x-1">
        <button
          type="button"
          class="rounded-sm px-2 py-1 font-medium text-gray-500 hover:bg-white hover:text-gray-900"
          @click="cancelAdd"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-sm bg-gray-900 px-2.5 py-1 font-semibold text-white hover:bg-gray-700"
        >
          Add
        </button>
      </span>
    </div>
  </form>
  <button
    v-else
    type="button"
    class="mt-1 flex w-full items-center gap-x-3 rounded-sm px-2 py-2 text-sm font-semibold text-accent hover:bg-accent/10"
    :disabled="!list"
    @click="startAdd"
  >
    <AppIcon name="plus" class="size-5" />
    Add a task
  </button>
</template>
