<script setup lang="ts">
/**
 * Popover behind the "N pending tasks" item (Google Calendar style): the overdue open tasks,
 * each one can be completed, opened, or (in the time grid) dragged onto the calendar.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { Task } from '@/api/ical'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { wasJustDragged } from '@/lib/dragGuard'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import { type Anchor, useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import TaskRow from '@/components/tasks/TaskRow.vue'

const props = defineProps<{
  tasks: Task[]
  anchor: Anchor
  colorFor: (collectionUrl: string) => string
  /** Rows can be dragged onto the time grid (not in the month view). */
  draggable?: boolean
}>()
const emit = defineEmits<{ close: []; grab: [task: Task, event: PointerEvent] }>()

const tasksStore = useTasksStore()
const notifications = useNotificationsStore()
const ui = useUiStore()

const root = ref<HTMLElement | null>(null)
useFocusTrap(root)

const WIDTH = 320
/** Below the anchor, kept inside the viewport. */
const style = computed(() => {
  const a = props.anchor
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const left = Math.max(8, Math.min(a.x, vw - WIDTH - 8))
  const top = Math.min(a.y + a.height + 4, vh - 160)
  return { top: `${top}px`, left: `${left}px`, maxHeight: `${Math.max(160, vh - top - 8)}px` }
})

async function toggle(task: Task, done: boolean) {
  try {
    await tasksStore.setCompleted(task, done)
  } catch (err) {
    notifications.reportError(err, `Could not update "${task.summary}"`, () =>
      tasksStore.setCompleted(task, done),
    )
  }
}

function open(task: Task) {
  if (wasJustDragged()) return
  emit('close')
  ui.openCreate({
    kind: 'task',
    collectionUrl: task.collectionUrl,
    edit: { objectUrl: task.objectUrl, recurrenceId: null },
  })
}

function onGrab(task: Task, e: PointerEvent) {
  if (props.draggable) emit('grab', task, e)
}

function onDocMouseDown(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) emit('close')
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}
onMounted(() => {
  root.value?.querySelector<HTMLElement>('button')?.focus()
  setTimeout(() => document.addEventListener('mousedown', onDocMouseDown), 0)
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown))
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      role="dialog"
      aria-label="Pending tasks"
      class="fixed z-40 flex w-80 flex-col rounded-2xl bg-white shadow-xl ring-1 ring-gray-200"
      :style="style"
      data-testid="pending-popover"
      @keydown="onKeydown"
    >
      <div class="flex items-start gap-x-3 px-4 pt-4">
        <div class="min-w-0 flex-1">
          <h2 class="font-display text-base font-bold text-gray-900">Pending tasks</h2>
          <p class="mt-0.5 text-xs text-gray-500">
            {{
              draggable
                ? 'Overdue tasks. Drag one onto the calendar to reschedule it.'
                : 'Overdue tasks.'
            }}
          </p>
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
      <ul class="mt-2 min-h-0 overflow-y-auto px-2 pb-2" :class="draggable ? 'cursor-grab' : ''">
        <TaskRow
          v-for="t in tasks"
          :key="t.objectUrl"
          :task="t"
          :color="colorFor(t.collectionUrl)"
          @toggle="toggle"
          @open="open"
          @grab="onGrab"
        />
      </ul>
    </div>
  </Teleport>
</template>
