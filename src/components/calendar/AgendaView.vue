<script setup lang="ts">
import { computed } from 'vue'

import type { EventInstance, Task } from '@/api/ical'
import type { DateRange } from '@/lib/dates'
import { MONTHS_LONG, WEEKDAYS_LONG, spanTitle } from '@/lib/format'
import { buildAgendaDays } from '@/lib/layout'

const props = defineProps<{
  range: DateRange
  instances: EventInstance[]
  tasks: Task[]
  colorFor: (collectionUrl: string) => string
  nameFor: (collectionUrl: string) => string
  selectedKey?: string | null
}>()
const emit = defineEmits<{
  selectEvent: [instance: EventInstance, el: HTMLElement]
  selectTask: [task: Task, el: HTMLElement]
}>()

const days = computed(() => buildAgendaDays(props.range, props.instances, props.tasks))
const count = computed(() => days.value.reduce((n, d) => n + d.entries.length, 0))

function eventKey(i: EventInstance) {
  return `${i.objectUrl}|${i.recurrenceId?.toString() ?? ''}`
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto px-2 pb-2" data-testid="agenda-view">
    <div class="min-w-[480px]">
      <div
        class="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-2 py-2"
      >
        <h2 class="text-sm font-medium text-gray-500">{{ spanTitle(range) }}</h2>
        <span class="text-xs text-gray-400">{{ count }} {{ count === 1 ? 'item' : 'items' }}</span>
      </div>
      <p v-if="days.length === 0" class="px-2 py-6 text-sm text-gray-400">
        Nothing scheduled in this period.
      </p>
      <ul v-else class="mt-1">
        <li
          v-for="day in days"
          :key="day.key"
          class="flex gap-x-4 border-t border-gray-200 py-3 first:border-t-0"
        >
          <div class="flex w-28 shrink-0 items-start gap-x-2 pl-2">
            <span
              class="flex size-8 shrink-0 items-center justify-center text-base font-semibold"
              :class="
                day.isToday ? 'rounded-full bg-accent text-white' : 'rounded-lg text-gray-900'
              "
              :aria-current="day.isToday ? 'date' : undefined"
            >
              <time :datetime="day.key">{{ day.date.getDate() }}</time>
            </span>
            <div class="pt-1.5 leading-tight">
              <p class="text-sm font-medium" :class="day.isToday ? 'text-accent' : 'text-gray-500'">
                {{ WEEKDAYS_LONG[day.date.getDay()] }}
              </p>
              <p class="text-[11px] text-gray-400">{{ MONTHS_LONG[day.date.getMonth()] }}</p>
            </div>
          </div>
          <ul class="min-w-0 flex-1 space-y-0.5">
            <li
              v-for="entry in day.entries"
              :key="entry.event ? eventKey(entry.event) : entry.task!.objectUrl"
            >
              <button
                v-if="entry.event"
                type="button"
                class="flex w-full items-center gap-x-3 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
                :class="selectedKey === eventKey(entry.event) ? 'bg-gray-100' : ''"
                @click="emit('selectEvent', entry.event, $event.currentTarget as HTMLElement)"
              >
                <span class="w-24 shrink-0 text-xs text-gray-500 tabular-nums">{{
                  entry.timeLabel
                }}</span>
                <span
                  class="size-2.5 shrink-0 rounded-full"
                  :style="{ backgroundColor: colorFor(entry.event.collectionUrl) }"
                ></span>
                <span class="truncate text-sm font-medium text-gray-900">{{
                  entry.event.summary || '(No title)'
                }}</span>
                <span class="ml-auto hidden shrink-0 pl-3 text-xs text-gray-400 md:inline">{{
                  nameFor(entry.event.collectionUrl)
                }}</span>
              </button>
              <button
                v-else-if="entry.task"
                type="button"
                class="flex w-full items-center gap-x-3 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
                @click="emit('selectTask', entry.task, $event.currentTarget as HTMLElement)"
              >
                <span class="w-24 shrink-0 text-xs text-gray-500 tabular-nums">{{
                  entry.timeLabel
                }}</span>
                <span
                  class="flex size-2.5 shrink-0 items-center justify-center rounded-sm"
                  :style="
                    entry.task.completed
                      ? { backgroundColor: colorFor(entry.task.collectionUrl), color: 'white' }
                      : { backgroundColor: colorFor(entry.task.collectionUrl) + '33' }
                  "
                >
                  <svg
                    v-if="entry.task.completed"
                    class="size-2.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    viewBox="0 0 14 14"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M3 7.5 5.75 10.25 11 4"
                    />
                  </svg>
                </span>
                <span
                  class="truncate text-sm"
                  :class="
                    entry.task.completed
                      ? 'text-gray-400 line-through'
                      : 'font-medium text-gray-900'
                  "
                  >{{ entry.task.summary }}</span
                >
                <span class="ml-auto hidden shrink-0 pl-3 text-xs text-gray-400 md:inline">{{
                  nameFor(entry.task.collectionUrl)
                }}</span>
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
</template>
