<script setup lang="ts">
/** Gray task chip with the list color square; completed tasks are struck through (mockup). */
import type { Task } from '@/api/ical'
import TaskDot from '@/components/ui/TaskDot.vue'

const props = defineProps<{ task: Task; color: string; size?: 'grid' | 'month' }>()
const emit = defineEmits<{ select: [task: Task, el: HTMLElement] }>()

function onClick(e: MouseEvent) {
  e.stopPropagation()
  emit('select', props.task, e.currentTarget as HTMLElement)
}
</script>

<template>
  <button
    type="button"
    :title="task.summary"
    class="flex w-full min-w-0 cursor-pointer items-center overflow-hidden rounded-md bg-gray-100 text-left text-xs hover:bg-gray-200"
    :class="size === 'month' ? 'gap-x-1.5 px-1.5 py-0.5' : 'h-full gap-x-1.5 px-2'"
    @click="onClick"
  >
    <TaskDot :color="color" :checked="task.completed" :size="size === 'month' ? 'sm' : 'md'" />
    <span
      class="truncate"
      :class="task.completed ? 'text-gray-400 line-through' : 'text-gray-800'"
      >{{ task.summary }}</span
    >
  </button>
</template>
