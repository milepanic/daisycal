<script setup lang="ts">
/** The #tasks-panel from the mockup: list picker, add button, open tasks, collapsible completed. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type { Task } from '@/api/ical'
import { wasJustDragged } from '@/lib/dragGuard'
import { useCalendarsStore } from '@/stores/calendars'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SkeletonRows from '@/components/ui/SkeletonRows.vue'
import TaskInlineAdd from '@/components/tasks/TaskInlineAdd.vue'
import TaskRow from '@/components/tasks/TaskRow.vue'
import { nestTasks, subtaskProgress } from '@/lib/subtasks'

const calendars = useCalendarsStore()
const tasks = useTasksStore()
const ui = useUiStore()
const notifications = useNotificationsStore()

/**
 * The picked list is remembered (ui.tasksPanelList). While it is hidden or not loaded yet the
 * panel shows the first visible list without forgetting the choice.
 */
const listUrl = computed(() => {
  const lists = calendars.visibleTaskLists
  const saved = ui.tasksPanelList
  return (saved && lists.some((l) => l.url === saved) ? saved : lists[0]?.url) ?? null
})
function pickList(url: string) {
  ui.tasksPanelList = url
  pickerOpen.value = false
}
const list = computed(() => (listUrl.value ? calendars.get(listUrl.value) : undefined))
const color = computed(() => (listUrl.value ? calendars.colorFor(listUrl.value) : '#7c3aed'))
const all = computed(() =>
  listUrl.value ? tasks.tasksFor(listUrl.value, { includeCompleted: true }) : [],
)
const open = computed(() => all.value.filter((t) => !t.completed))
const completed = computed(() => all.value.filter((t) => t.completed))
const pickerOpen = ref(false)
const picker = ref<HTMLElement | null>(null)
/** Open tasks of a list, shown next to it in the picker. */
function openCount(url: string) {
  return tasks.tasksFor(url, { includeCompleted: false }).length
}
// A click anywhere else closes the picker.
function onDocMouseDown(e: MouseEvent) {
  if (picker.value && !picker.value.contains(e.target as Node)) pickerOpen.value = false
}
watch(pickerOpen, (isOpen) => {
  if (isOpen) document.addEventListener('mousedown', onDocMouseDown)
  else document.removeEventListener('mousedown', onDocMouseDown)
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown))
const adding = ref(false)
/** Open tasks with their subtasks right under them. */
const nestedOpen = computed(() => nestTasks(open.value))
/** UID of the task getting a new subtask (its inline form is open). */
const addingUnder = ref<string | null>(null)

/** Rows can be dragged onto the time grid (the calendar view passes it on). */
const emit = defineEmits<{ grab: [task: Task, event: PointerEvent] }>()

function openTask(task: Task) {
  if (wasJustDragged()) return
  ui.openCreate({
    kind: 'task',
    collectionUrl: task.collectionUrl,
    edit: { objectUrl: task.objectUrl, recurrenceId: null },
  })
}

async function toggle(t: Task, done: boolean) {
  try {
    await tasks.setCompleted(t, done)
  } catch (err) {
    notifications.reportError(err, `Could not update "${t.summary}"`, () =>
      tasks.setCompleted(t, done),
    )
  }
}
</script>

<template>
  <aside
    id="tasks-panel"
    class="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-card"
  >
    <!-- Header: the list name is the picker (like the list headings in the Tasks view). -->
    <div
      ref="picker"
      class="relative flex shrink-0 items-center gap-x-1 px-2 pt-2.5"
      @keydown.escape="pickerOpen = false"
    >
      <button
        type="button"
        class="group flex min-w-0 items-center gap-x-2 rounded-sm px-2 py-1 text-left hover:bg-gray-50"
        aria-haspopup="listbox"
        :aria-expanded="pickerOpen"
        @click="pickerOpen = !pickerOpen"
      >
        <span class="size-2.5 shrink-0 rounded-sm" :style="{ backgroundColor: color }"></span>
        <span class="truncate font-display text-lg font-bold text-gray-900">{{
          list?.displayName ?? 'No task list'
        }}</span>
        <span v-if="open.length" class="text-xs text-gray-400 tabular-nums">{{ open.length }}</span>
        <AppIcon
          name="chevron-down"
          class="size-4 shrink-0 text-gray-400 transition-transform duration-150 group-hover:text-gray-600"
          :class="pickerOpen ? 'rotate-180' : ''"
        />
      </button>
      <Transition name="dropdown">
        <ul
          v-if="pickerOpen"
          role="listbox"
          aria-label="Task list"
          class="absolute top-full left-2 z-30 mt-1 w-56 origin-top-left rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-gray-200"
        >
          <li v-for="l in calendars.visibleTaskLists" :key="l.url">
            <button
              type="button"
              role="option"
              :aria-selected="l.url === listUrl"
              class="flex w-full items-center gap-x-2.5 rounded-sm px-2.5 py-2 text-left text-sm hover:bg-gray-100"
              :class="l.url === listUrl ? 'font-semibold text-gray-900' : 'text-gray-700'"
              @click="pickList(l.url)"
            >
              <span
                class="size-2.5 shrink-0 rounded-sm"
                :style="{ backgroundColor: calendars.colorFor(l.url) }"
              ></span>
              <span class="min-w-0 flex-1 truncate">{{ l.displayName }}</span>
              <span class="text-xs font-normal text-gray-400 tabular-nums">{{
                openCount(l.url) || ''
              }}</span>
              <AppIcon
                name="check"
                class="size-4 shrink-0 text-gray-900"
                :class="l.url === listUrl ? '' : 'invisible'"
              />
            </button>
          </li>
        </ul>
      </Transition>
      <button
        type="button"
        class="ml-auto flex size-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
        title="Close tasks panel"
        @click="ui.tasksPanelOpen = false"
      >
        <span class="sr-only">Close tasks panel</span>
        <AppIcon name="close" class="size-4" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pt-1 pb-4">
      <TaskInlineAdd v-model:adding="adding" :list="list" :color="color" />
      <SkeletonRows v-if="listUrl && tasks.isLoading(listUrl) && all.length === 0" />
      <EmptyState
        v-else-if="listUrl && open.length === 0 && !adding"
        icon="tasks"
        :title="completed.length ? 'All done' : 'Nothing here yet'"
        :text="completed.length ? 'No open tasks in this list.' : 'Add the first task above.'"
      />

      <TransitionGroup tag="ul" name="task-list" class="relative mt-1 space-y-0.5">
        <template v-for="n in nestedOpen" :key="n.task.objectUrl">
          <TaskRow
            :task="n.task"
            :color="color"
            :depth="n.depth"
            :subtasks="subtaskProgress(n.task.uid, all)"
            can-add-subtask
            @toggle="toggle"
            @open="openTask"
            @grab="(t, e) => emit('grab', t, e)"
            @add-subtask="(t) => (addingUnder = t.uid)"
          />
          <li v-if="addingUnder === n.task.uid" class="list-none">
            <TaskInlineAdd
              :list="list"
              :color="color"
              :parent="n.task"
              @close="addingUnder = null"
            />
          </li>
        </template>
      </TransitionGroup>
    </div>

    <!-- Pinned to the bottom of the panel (Google Calendar); opens upward with its own scroll. -->
    <details
      v-if="completed.length && ui.showCompletedTasks"
      class="group shrink-0 border-t border-gray-100 px-2 py-1.5"
      data-testid="panel-completed"
    >
      <summary
        class="flex cursor-pointer list-none items-center gap-x-2 rounded-sm px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 [&::-webkit-details-marker]:hidden"
      >
        <AppIcon
          name="chevron-down"
          class="size-4 -rotate-90 text-gray-400 transition-transform group-open:rotate-0"
        />
        Completed ({{ completed.length }})
      </summary>
      <TransitionGroup
        tag="ul"
        name="task-list"
        class="details-body relative mt-1 max-h-[40vh] space-y-0.5 overflow-y-auto"
      >
        <TaskRow
          v-for="t in completed"
          :key="t.objectUrl"
          :task="t"
          :color="color"
          @toggle="toggle"
          @open="openTask"
          @grab="(t, e) => emit('grab', t, e)"
        />
      </TransitionGroup>
    </details>
  </aside>
</template>
