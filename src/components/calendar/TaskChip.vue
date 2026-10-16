<script setup lang="ts">
/** Gray task chip with the list color square; completed tasks are struck through (mockup). */
import type { Task } from '@/api/ical'

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
    class="flex w-full min-w-0 cursor-pointer items-center overflow-hidden rounded-lg bg-gray-100 text-left text-xs hover:bg-gray-200"
    :class="size === 'month' ? 'gap-x-1.5 px-1.5 py-0.5' : 'h-full gap-x-1.5 px-2'"
    @click="onClick"
  >
    <span
      class="flex shrink-0 items-center justify-center rounded-sm"
      :class="size === 'month' ? 'size-2.5' : 'size-3'"
      :style="
        task.completed
          ? { backgroundColor: color, color: 'white' }
          : { backgroundColor: color + '33' }
      "
    >
      <svg
        v-if="task.completed"
        class="size-2"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        viewBox="0 0 14 14"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5 5.75 10.25 11 4" />
      </svg>
    </span>
    <span
      class="truncate font-medium"
      :class="task.completed ? 'text-gray-400 line-through' : 'text-gray-800'"
      >{{ task.summary }}</span
    >
  </button>
</template>
