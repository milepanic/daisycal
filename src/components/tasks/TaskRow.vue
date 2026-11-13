<script setup lang="ts">
/** One task row (mockup tasks.html): round checkbox in the list color, title, due badge, priority flag. */
import { computed, onBeforeUnmount, ref } from 'vue'

import type { Task } from '@/api/ical'
import { formatShortDateTime } from '@/lib/format'
import { playCompleteSound } from '@/lib/sounds'
import { dueBadge } from '@/lib/taskBadge'
import AppIcon from '@/components/ui/AppIcon.vue'
import ColorCheckbox from '@/components/ui/ColorCheckbox.vue'

const props = withDefaults(
  defineProps<{
    task: Task
    color: string
    /** Subtask level: indented under its parent. */
    depth?: number
    /** Done / total of its subtasks, shown next to the title. */
    subtasks?: { done: number; total: number } | null
    /** Shows the "Add subtask" button on hover. */
    canAddSubtask?: boolean
  }>(),
  { depth: 0, subtasks: null, canAddSubtask: false },
)
const emit = defineEmits<{
  toggle: [task: Task, completed: boolean]
  open: [task: Task]
  addSubtask: [task: Task]
  /** Primary-button press on the row (not the checkbox): the parent may start a drag. */
  grab: [task: Task, event: PointerEvent]
}>()

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 || e.pointerType === 'touch') return
  if ((e.target as HTMLElement).closest('input')) return
  emit('grab', props.task, e)
}

/**
 * Completing a task plays a sound and a short "pop" before the change is reported, so the row
 * does not jump to the Completed section mid-animation. With reduced motion (or no matchMedia,
 * as in tests) the change is reported right away.
 */
const CELEBRATE_MS = 550
const celebrating = ref(false)
let celebrateTimer: ReturnType<typeof setTimeout> | undefined

function reducedMotion() {
  return (
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function finishCelebration() {
  clearTimeout(celebrateTimer)
  celebrateTimer = undefined
  celebrating.value = false
  emit('toggle', props.task, true)
}

function onCheck(done: boolean) {
  if (celebrating.value) {
    // Unticked again during the animation: the task was never saved as completed.
    if (!done) {
      clearTimeout(celebrateTimer)
      celebrateTimer = undefined
      celebrating.value = false
    }
    return
  }
  if (!done || props.task.completed) {
    emit('toggle', props.task, done)
    return
  }
  playCompleteSound()
  if (reducedMotion()) {
    emit('toggle', props.task, true)
    return
  }
  celebrating.value = true
  celebrateTimer = setTimeout(finishCelebration, CELEBRATE_MS)
}

// Leaving the view mid-animation still saves the completion.
onBeforeUnmount(() => {
  if (celebrateTimer) finishCelebration()
})

/** Six sparks around the checkbox, 60° apart. */
const SPARKS = [0, 60, 120, 180, 240, 300]

const badge = computed(() => dueBadge(props.task))
const priorityClass = computed(() =>
  props.task.priority === 'high'
    ? 'text-red-500'
    : props.task.priority === 'medium'
      ? 'text-amber-500'
      : props.task.priority === 'low'
        ? 'text-sky-500'
        : '',
)
</script>

<template>
  <li
    class="group/task flex items-start gap-x-3 rounded-sm p-2 hover:bg-gray-50"
    :style="depth ? { paddingLeft: `${0.5 + depth * 1.75}rem` } : undefined"
    :data-task="task.uid"
    :data-depth="depth || undefined"
    @pointerdown="onPointerDown"
  >
    <span
      class="relative grid h-5 w-4 shrink-0 place-items-center"
      :class="celebrating ? 'task-celebrate' : ''"
      :style="{ '--spark-color': color }"
    >
      <ColorCheckbox
        :color="color"
        :model-value="task.completed || celebrating"
        round
        :label="`${task.completed ? 'Mark as not completed' : 'Mark as completed'}: ${task.summary}`"
        @update:model-value="onCheck"
      />
      <template v-if="celebrating">
        <span class="task-ring" aria-hidden="true"></span>
        <span
          v-for="a in SPARKS"
          :key="a"
          class="task-spark"
          :style="{ '--spark-angle': `${a}deg` }"
          aria-hidden="true"
        ></span>
      </template>
    </span>
    <button
      type="button"
      class="min-w-0 flex-1 cursor-pointer text-left"
      :title="task.description || undefined"
      @click="emit('open', task)"
    >
      <p
        class="flex items-center gap-x-1.5 text-sm"
        :class="
          task.completed
            ? 'text-gray-400 line-through'
            : celebrating
              ? 'text-gray-400 line-through decoration-gray-400 transition-colors duration-300'
              : 'text-gray-900'
        "
      >
        <AppIcon
          v-if="task.priority && !task.completed"
          name="flag"
          class="size-3.5 shrink-0"
          :class="priorityClass"
          :title="`${task.priority} priority`"
        />
        <span class="truncate">{{ task.summary || '(No title)' }}</span>
        <span
          v-if="subtasks"
          class="shrink-0 text-xs text-gray-400 tabular-nums no-underline"
          :title="`${subtasks.done} of ${subtasks.total} subtasks done`"
          data-testid="subtask-progress"
          >{{ subtasks.done }}/{{ subtasks.total }}</span
        >
      </p>
      <p v-if="task.completed && task.completedAt" class="mt-0.5 text-xs text-gray-400">
        Completed {{ formatShortDateTime(task.completedAt, false) }}
      </p>
      <p v-else-if="badge" class="mt-1.5">
        <span
          class="inline-flex items-center gap-x-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1"
          :class="badge.cls"
          data-testid="due-badge"
        >
          <AppIcon name="calendar" class="size-3" />
          {{ badge.label }}
        </span>
      </p>
    </button>
    <button
      v-if="canAddSubtask && !task.completed"
      type="button"
      class="shrink-0 rounded-sm p-0.5 text-gray-400 opacity-0 group-hover/task:opacity-100 hover:bg-gray-200 hover:text-gray-700 focus-visible:opacity-100"
      title="Add subtask"
      @pointerdown.stop
      @click="emit('addSubtask', task)"
    >
      <span class="sr-only">Add subtask to {{ task.summary }}</span>
      <AppIcon name="plus" class="size-4" />
    </button>
  </li>
</template>
