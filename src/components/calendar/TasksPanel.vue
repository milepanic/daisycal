<script setup lang="ts">
/** The #tasks-panel from the mockup: list picker, add button, open tasks, collapsible completed. */
import { computed, ref } from 'vue'

import type { Task } from '@/api/ical'
import { wasJustDragged } from '@/lib/dragGuard'
import { useCalendarsStore } from '@/stores/calendars'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
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
  <aside id="tasks-panel" class="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl bg-white">
    <div class="relative flex h-16 shrink-0 items-center px-4">
      <button
        type="button"
        class="flex items-center gap-x-2 rounded-sm bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-200"
        aria-haspopup="listbox"
        :aria-expanded="pickerOpen"
        @click="pickerOpen = !pickerOpen"
      >
        <span class="size-2.5 rounded-sm" :style="{ backgroundColor: color }"></span>
        {{ list?.displayName ?? 'No task list' }}
        <AppIcon name="chevron-down" class="size-4 text-gray-500" />
      </button>
      <Transition name="dropdown">
        <ul
          v-if="pickerOpen"
          role="listbox"
          class="absolute top-14 left-4 z-30 origin-top-left min-w-40 rounded-sm bg-white p-1 shadow-lg ring-1 ring-gray-200"
        >
          <li v-for="l in calendars.visibleTaskLists" :key="l.url">
            <button
              type="button"
              role="option"
              :aria-selected="l.url === listUrl"
              class="flex w-full items-center gap-x-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-gray-100"
              :class="l.url === listUrl ? 'font-semibold text-gray-900' : 'text-gray-700'"
              @click="pickList(l.url)"
            >
              <span
                class="size-2.5 rounded-sm"
                :style="{ backgroundColor: calendars.colorFor(l.url) }"
              ></span>
              {{ l.displayName }}
            </button>
          </li>
        </ul>
      </Transition>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-4">
      <TaskInlineAdd v-model:adding="adding" :list="list" :color="color" />
      <p
        v-if="listUrl && tasks.isLoading(listUrl) && all.length === 0"
        class="px-2 py-2 text-sm text-gray-400"
      >
        Loading…
      </p>
      <p
        v-else-if="listUrl && open.length === 0 && !adding"
        class="px-2 py-2 text-sm text-gray-400"
      >
        No open tasks.
      </p>

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

      <details v-if="completed.length && ui.showCompletedTasks" class="group mt-2">
        <summary
          class="flex cursor-pointer list-none items-center gap-x-2 rounded-sm px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 [&::-webkit-details-marker]:hidden"
        >
          <AppIcon
            name="chevron-down"
            class="size-4 -rotate-90 text-gray-400 transition-transform group-open:rotate-0"
          />
          Completed ({{ completed.length }})
        </summary>
        <TransitionGroup tag="ul" name="task-list" class="details-body relative mt-1 space-y-0.5">
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
    </div>
  </aside>
</template>
