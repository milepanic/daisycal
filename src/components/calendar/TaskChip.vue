<script setup lang="ts">
/**
 * Gray task chip with the round list-color marker; completed tasks are struck through. In the
 * time grid it is a block like an event and shows the due time after the title ("Call, 15:30").
 */
import type { Task } from '@/api/ical'
import { textOn } from '@/lib/color'
import { formatTime } from '@/lib/format'
import TaskDot from '@/components/ui/TaskDot.vue'

const props = defineProps<{
  task: Task
  color: string
  size?: 'grid' | 'month'
  selected?: boolean
  /** Append the due time to the title (time grid). */
  showTime?: boolean
}>()
const emit = defineEmits<{ select: [task: Task, el: HTMLElement] }>()

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
    class="flex w-full min-w-0 cursor-pointer items-center overflow-hidden text-left text-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-900 data-selected:ring-2 data-selected:ring-gray-900 data-selected:ring-offset-1"
    :class="
      size === 'month'
        ? 'gap-x-1.5 rounded-sm bg-gray-100 px-1.5 py-0.5 transition-[background-color,opacity] duration-150 hover:bg-gray-200'
        : [
            'h-full gap-x-1 rounded-sm pr-1.5 pl-1 transition-[filter,box-shadow,opacity] duration-300 hover:brightness-110',
            task.completed ? 'opacity-60' : '',
          ]
    "
    :style="size === 'month' ? undefined : { backgroundColor: color, '--chip-fg': textOn(color) }"
    @click="onClick"
  >
    <TaskDot :color="color" :checked="task.completed" size="sm" :on-color="size !== 'month'" />
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
