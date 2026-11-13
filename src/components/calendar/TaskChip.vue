<script setup lang="ts">
/**
 * Gray task chip with the round list-color marker; completed tasks are struck through. In the
 * time grid it is a block like an event and shows the due time after the title ("Call, 15:30").
 *
 * The marker is the checkbox: a click on it (only there) completes / reopens the task, with the
 * sound and an Undo toast; the rest of the chip opens the details and starts drags.
 */
import type { Task } from '@/api/ical'
import { textOn } from '@/lib/color'
import { formatTime } from '@/lib/format'
import { playCompleteSound } from '@/lib/sounds'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import TaskDot from '@/components/ui/TaskDot.vue'

const props = defineProps<{
  task: Task
  color: string
  size?: 'grid' | 'month'
  selected?: boolean
  /** Append the due time to the title (time grid). */
  showTime?: boolean
  /** Longer than the default slot (has a duration): content at the top, not centered. */
  tall?: boolean
}>()
const emit = defineEmits<{ select: [task: Task, el: HTMLElement] }>()

async function toggleDone() {
  // Stores fetched on click: the chip is also rendered where no store is needed (tests, previews).
  const tasks = useTasksStore()
  const notifications = useNotificationsStore()
  const done = !props.task.completed
  if (done) playCompleteSound()
  try {
    await tasks.setCompleted(props.task, done)
  } catch (err) {
    notifications.reportError(err, `Could not update "${props.task.summary}"`, () =>
      tasks.setCompleted(props.task, done),
    )
  }
}

function onClick(e: MouseEvent) {
  e.stopPropagation()
  emit('select', props.task, e.currentTarget as HTMLElement)
}
</script>

<template>
  <!-- Month view: gray row. Time grid: a block in the list color, like an event. -->
  <button
    type="button"
    :title="task.summary"
    :data-selected="selected || undefined"
    class="flex w-full min-w-0 cursor-pointer overflow-hidden text-left text-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-900 chip-selectable"
    :class="
      size === 'month'
        ? 'items-center gap-x-1.5 rounded-sm bg-gray-100 px-1.5 py-0.5 transition-[background-color,opacity,box-shadow,transform] duration-150 hover:bg-gray-200'
        : [
            'h-full gap-x-1 rounded-sm pr-1.5 pl-1 transition-[filter,box-shadow,opacity,transform] duration-300 hover:brightness-110',
            tall ? 'items-start pt-1' : 'items-center',
            task.completed ? 'opacity-60' : '',
          ]
    "
    :style="
      size === 'month'
        ? { '--chip-color': color }
        : { backgroundColor: color, '--chip-fg': textOn(color), '--chip-color': color }
    "
    @click="onClick"
  >
    <!-- The checkbox: a bigger invisible hit area around the dot; no drag, no details. On a
         long task (content at the top) it drops 3px to sit on the title's line. -->
    <span
      role="checkbox"
      :aria-checked="task.completed"
      :aria-label="`${task.completed ? 'Mark as not completed' : 'Mark as completed'}: ${task.summary}`"
      class="shrink-0 cursor-pointer rounded-full p-1 transition-transform duration-150 hover:scale-125"
      :class="tall ? '-mx-1 -mt-px -mb-1' : '-m-1'"
      data-testid="chip-checkbox"
      @pointerdown.stop
      @click.stop="toggleDone"
    >
      <TaskDot :color="color" :checked="task.completed" size="sm" :on-color="size !== 'month'" />
    </span>
    <span
      class="min-w-0 truncate"
      :class="
        size === 'month'
          ? task.completed
            ? 'text-gray-400 line-through'
            : 'text-gray-800'
          : task.completed
            ? 'text-(--chip-fg) line-through'
            : 'text-(--chip-fg)'
      "
      >{{ task.summary || '(No title)'
      }}<span
        v-if="showTime && task.due"
        class="font-normal"
        :class="size === 'month' ? 'text-gray-500' : 'text-(--chip-fg)/80'"
        >, {{ formatTime(task.due) }}</span
      ></span
    >
  </button>
</template>
