<script setup lang="ts">
/**
 * Tasks page (mockup tasks.html): one column per visible task list. Rows can be dragged
 * into another column to move the task to that list.
 */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import type { Task } from '@/api/ical'
import { markDragged } from '@/lib/dragGuard'
import { useCalendarsStore } from '@/stores/calendars'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import TasksToolbar from '@/components/shell/TasksToolbar.vue'
import TaskList from '@/components/tasks/TaskList.vue'

const calendars = useCalendarsStore()
const tasks = useTasksStore()
const notifications = useNotificationsStore()

watch(
  () => calendars.status,
  (status) => {
    if (status === 'ready') void tasks.ensureLoaded()
  },
  { immediate: true },
)

onBeforeUnmount(() => untrack())

// ---- drag between lists ---------------------------------------------------------------------
const DRAG_THRESHOLD_PX = 6
const main = ref<HTMLElement | null>(null)
const drag = shallowRef<{
  task: Task
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
  targetUrl: string | null
} | null>(null)
const dropTargetUrl = computed(() => (drag.value?.moved ? drag.value.targetUrl : null))

function listAt(clientX: number, clientY: number): string | null {
  for (const el of main.value?.querySelectorAll<HTMLElement>('[data-list]') ?? []) {
    const r = el.getBoundingClientRect()
    if (clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom)
      return el.dataset.list ?? null
  }
  return null
}

function onGrab(task: Task, e: PointerEvent) {
  drag.value = {
    task,
    startX: e.clientX,
    startY: e.clientY,
    x: e.clientX,
    y: e.clientY,
    moved: false,
    targetUrl: null,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
}

function onPointerMove(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  drag.value = {
    ...d,
    x: e.clientX,
    y: e.clientY,
    moved:
      d.moved ||
      Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) >= DRAG_THRESHOLD_PX,
    targetUrl: listAt(e.clientX, e.clientY),
  }
}

function onPointerCancel() {
  untrack()
  drag.value = null
}

function untrack() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
}

async function onPointerUp() {
  untrack()
  const d = drag.value
  drag.value = null
  if (!d?.moved) return
  markDragged()
  const target = d.targetUrl ? calendars.get(d.targetUrl) : undefined
  if (!target || target.url === d.task.collectionUrl) return
  const run = () => tasks.moveTask(d.task, target)
  try {
    await run()
  } catch (err) {
    notifications.reportError(
      err,
      `Could not move "${d.task.summary}" to ${target.displayName}`,
      run,
    )
  }
}
</script>

<template>
  <TasksToolbar />
  <main
    ref="main"
    class="min-h-0 flex-1 overflow-x-auto px-2 pb-2"
    :class="drag?.moved ? 'cursor-grabbing select-none' : ''"
  >
    <div class="flex h-full items-start gap-x-3">
      <TaskList
        v-for="list in calendars.visibleTaskLists"
        :key="list.url"
        :list="list"
        :drop-target="dropTargetUrl === list.url && list.url !== drag?.task.collectionUrl"
        @grab="onGrab"
      />
      <p
        v-if="calendars.status === 'ready' && calendars.visibleTaskLists.length === 0"
        class="p-4 text-sm text-gray-400"
      >
        {{
          calendars.taskLists.length === 0
            ? 'No task lists on the server.'
            : 'No task lists are visible. Enable one in the sidebar.'
        }}
      </p>
    </div>
    <div
      v-if="drag?.moved"
      class="pointer-events-none fixed z-50 max-w-xs truncate rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white shadow-lg"
      :style="{ left: `${drag.x + 12}px`, top: `${drag.y + 12}px` }"
      data-testid="task-drag-ghost"
    >
      {{ drag.task.summary }}
    </div>
  </main>
</template>
