<script setup lang="ts">
/** One task row (mockup tasks.html): round checkbox in the list color, title, due badge, priority flag. */
import { computed } from 'vue'

import type { Task } from '@/api/ical'
import { formatShortDateTime } from '@/lib/format'
import { dueBadge } from '@/lib/taskBadge'
import AppIcon from '@/components/ui/AppIcon.vue'
import ColorCheckbox from '@/components/ui/ColorCheckbox.vue'

const props = defineProps<{ task: Task; color: string }>()
const emit = defineEmits<{
  toggle: [task: Task, completed: boolean]
  open: [task: Task]
  /** Primary-button press on the row (not the checkbox): the parent may start a drag. */
  grab: [task: Task, event: PointerEvent]
}>()

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 || e.pointerType === 'touch') return
  if ((e.target as HTMLElement).closest('input')) return
  emit('grab', props.task, e)
}

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
    class="group/task flex items-start gap-x-3 rounded-lg p-2 hover:bg-gray-50"
    :data-task="task.uid"
    @pointerdown="onPointerDown"
  >
    <span class="grid h-5 w-4 shrink-0 place-items-center">
      <ColorCheckbox
        :color="color"
        :model-value="task.completed"
        round
        :label="`${task.completed ? 'Mark as not completed' : 'Mark as completed'}: ${task.summary}`"
        @update:model-value="emit('toggle', task, $event)"
      />
    </span>
    <button
      type="button"
      class="min-w-0 flex-1 cursor-pointer text-left"
      :title="task.description || undefined"
      @click="emit('open', task)"
    >
      <p
        class="flex items-center gap-x-1.5 text-sm"
        :class="task.completed ? 'text-gray-400 line-through' : 'font-medium text-gray-900'"
      >
        <AppIcon
          v-if="task.priority && !task.completed"
          name="flag"
          class="size-3.5 shrink-0"
          :class="priorityClass"
          :title="`${task.priority} priority`"
        />
        <span class="truncate">{{ task.summary || '(No title)' }}</span>
      </p>
      <p v-if="task.completed && task.completedAt" class="mt-0.5 text-xs text-gray-400">
        Completed {{ formatShortDateTime(task.completedAt, false) }}
      </p>
      <p v-else-if="badge" class="mt-1.5">
        <span
          class="inline-flex items-center gap-x-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium"
          :class="badge.cls"
          >{{ badge.label }}</span
        >
      </p>
    </button>
  </li>
</template>
