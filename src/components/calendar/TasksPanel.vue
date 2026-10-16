<script setup lang="ts">
/** The #tasks-panel from the mockup: list picker, add button, open tasks, collapsible completed. */
import { computed, ref, watch } from 'vue'

import type { Task } from '@/api/ical'
import { isSameDay, startOfDay } from '@/lib/dates'
import { formatShortDateTime, formatTime } from '@/lib/format'
import { useCalendarsStore } from '@/stores/calendars'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import ColorCheckbox from '@/components/ui/ColorCheckbox.vue'

const calendars = useCalendarsStore()
const tasks = useTasksStore()
const ui = useUiStore()

const listUrl = ref<string | null>(null)
watch(
  () => calendars.visibleTaskLists,
  (lists) => {
    if (!listUrl.value || !lists.some((l) => l.url === listUrl.value))
      listUrl.value = lists[0]?.url ?? null
  },
  { immediate: true },
)
const list = computed(() => (listUrl.value ? calendars.get(listUrl.value) : undefined))
const color = computed(() => (listUrl.value ? calendars.colorFor(listUrl.value) : '#7c3aed'))
const all = computed(() =>
  listUrl.value ? tasks.tasksFor(listUrl.value, { includeCompleted: true }) : [],
)
const open = computed(() => all.value.filter((t) => !t.completed))
const completed = computed(() => all.value.filter((t) => t.completed))
const pickerOpen = ref(false)
const error = ref<string | null>(null)

function dueBadge(t: Task): { label: string; cls: string } | null {
  if (!t.due) return null
  const today = startOfDay(new Date())
  const label = isSameDay(t.due, today)
    ? t.dueAllDay
      ? 'Today'
      : `Today, ${formatTime(t.due)}`
    : formatShortDateTime(t.due, !t.dueAllDay)
  if (t.due < (t.dueAllDay ? today : new Date())) return { label, cls: 'bg-red-50 text-red-600' }
  if (isSameDay(t.due, today)) return { label, cls: 'bg-accent/10 text-accent' }
  return { label, cls: 'bg-gray-100 text-gray-600' }
}

async function toggle(t: Task, done: boolean) {
  error.value = null
  try {
    await tasks.setCompleted(t, done)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not update the task'
  }
}
</script>

<template>
  <aside id="tasks-panel" class="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl bg-white">
    <div class="relative flex h-16 shrink-0 items-center px-4">
      <button
        type="button"
        class="flex items-center gap-x-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-200"
        aria-haspopup="listbox"
        :aria-expanded="pickerOpen"
        @click="pickerOpen = !pickerOpen"
      >
        <span class="size-2.5 rounded-sm" :style="{ backgroundColor: color }"></span>
        {{ list?.displayName ?? 'No task list' }}
        <AppIcon name="chevron-down" class="size-4 text-gray-500" />
      </button>
      <ul
        v-if="pickerOpen"
        role="listbox"
        class="absolute top-14 left-4 z-30 min-w-40 rounded-lg bg-white p-1 shadow-lg ring-1 ring-gray-200"
      >
        <li v-for="l in calendars.visibleTaskLists" :key="l.url">
          <button
            type="button"
            role="option"
            :aria-selected="l.url === listUrl"
            class="flex w-full items-center gap-x-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-100"
            :class="l.url === listUrl ? 'font-semibold text-gray-900' : 'text-gray-700'"
            @click="((listUrl = l.url), (pickerOpen = false))"
          >
            <span
              class="size-2.5 rounded-sm"
              :style="{ backgroundColor: calendars.colorFor(l.url) }"
            ></span>
            {{ l.displayName }}
          </button>
        </li>
      </ul>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-4">
      <button
        type="button"
        class="flex w-full items-center gap-x-3 rounded-lg px-2 py-2 text-sm font-semibold text-accent hover:bg-accent/10"
        :disabled="!listUrl"
        @click="ui.openCreate({ kind: 'task', collectionUrl: listUrl ?? undefined })"
      >
        <AppIcon name="plus" class="size-5" />
        Add a task
      </button>

      <p v-if="error" class="mx-2 mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
        {{ error }}
      </p>
      <p
        v-if="listUrl && tasks.isLoading(listUrl) && all.length === 0"
        class="px-2 py-2 text-sm text-gray-400"
      >
        Loading…
      </p>
      <p v-else-if="listUrl && open.length === 0" class="px-2 py-2 text-sm text-gray-400">
        No open tasks.
      </p>

      <ul class="mt-1 space-y-0.5">
        <li
          v-for="t in open"
          :key="t.objectUrl"
          class="group/task flex items-start gap-x-3 rounded-lg p-2 hover:bg-gray-50"
        >
          <span class="grid h-5 w-4 shrink-0 place-items-center">
            <ColorCheckbox
              :color="color"
              :model-value="false"
              round
              :label="`Mark as completed: ${t.summary}`"
              @update:model-value="toggle(t, $event)"
            />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-gray-900">{{ t.summary }}</p>
            <p v-if="dueBadge(t)" class="mt-1.5">
              <span
                class="inline-flex items-center gap-x-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium"
                :class="dueBadge(t)!.cls"
                >{{ dueBadge(t)!.label }}</span
              >
            </p>
          </div>
        </li>
      </ul>

      <details v-if="completed.length" class="group mt-2">
        <summary
          class="flex cursor-pointer list-none items-center gap-x-2 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 [&::-webkit-details-marker]:hidden"
        >
          <AppIcon
            name="chevron-down"
            class="size-4 -rotate-90 text-gray-400 transition-transform group-open:rotate-0"
          />
          Completed ({{ completed.length }})
        </summary>
        <ul class="mt-1 space-y-0.5">
          <li
            v-for="t in completed"
            :key="t.objectUrl"
            class="group/task flex items-start gap-x-3 rounded-lg p-2 hover:bg-gray-50"
          >
            <span class="grid h-5 w-4 shrink-0 place-items-center">
              <ColorCheckbox
                :color="color"
                :model-value="true"
                round
                :label="`Mark as not completed: ${t.summary}`"
                @update:model-value="toggle(t, $event)"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-400 line-through">{{ t.summary }}</p>
              <p v-if="t.completedAt" class="mt-0.5 text-xs text-gray-400">
                Completed {{ formatShortDateTime(t.completedAt, false) }}
              </p>
            </div>
          </li>
        </ul>
      </details>
    </div>
  </aside>
</template>
