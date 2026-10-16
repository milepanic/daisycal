<script setup lang="ts">
import { computed } from 'vue'

import type { EventInstance, Task } from '@/api/ical'
import { type DateRange, addDays, startOfDay } from '@/lib/dates'
import { MONTHS_SHORT, WEEKDAYS_LONG } from '@/lib/format'
import { buildMonthCells } from '@/lib/layout'
import EventChip from './EventChip.vue'
import TaskChip from './TaskChip.vue'

const props = defineProps<{
  range: DateRange
  month: number
  instances: EventInstance[]
  tasks: Task[]
  colorFor: (collectionUrl: string) => string
  selectedKey?: string | null
}>()
const emit = defineEmits<{
  selectEvent: [instance: EventInstance, el: HTMLElement]
  selectTask: [task: Task, el: HTMLElement]
  createAt: [start: Date, end: Date, allDay: boolean]
  showMore: [date: Date]
}>()

const cells = computed(() =>
  buildMonthCells(props.range, props.month, props.instances, props.tasks),
)
const headers = computed(() =>
  Array.from({ length: 7 }, (_, i) => props.range.start.getDay() + i).map((d) => d % 7),
)
const today = new Date()

function eventKey(i: EventInstance) {
  return `${i.objectUrl}|${i.recurrenceId?.toString() ?? ''}`
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-auto px-2 pb-2" data-testid="month-view">
    <div class="flex min-h-[600px] min-w-[640px] flex-1 flex-col">
      <div class="sticky top-0 z-20 grid grid-cols-7 border-b border-gray-200 bg-white">
        <div
          v-for="d in headers"
          :key="d"
          class="py-2 text-center text-sm font-medium"
          :class="
            d === today.getDay() && cells.some((c) => c.isToday) ? 'text-accent' : 'text-gray-500'
          "
        >
          {{ WEEKDAYS_LONG[d] }}
        </div>
      </div>
      <div
        class="grid flex-1 grid-cols-7 grid-rows-6 [&>*:nth-child(-n+7)]:border-t-0 [&>*:nth-child(7n+1)]:border-l-0"
      >
        <div
          v-for="cell in cells"
          :key="cell.key"
          class="flex min-h-0 cursor-pointer flex-col border-t border-l border-gray-200 p-1"
          :class="cell.inMonth ? '' : 'bg-gray-50/60'"
          :data-date="cell.key"
          @click="emit('createAt', startOfDay(cell.date), addDays(startOfDay(cell.date), 1), true)"
        >
          <div class="flex h-7 items-center justify-center gap-x-1">
            <span v-if="cell.date.getDate() === 1" class="text-xs font-medium text-gray-500">{{
              MONTHS_SHORT[cell.date.getMonth()]
            }}</span>
            <span
              class="flex size-7 items-center justify-center text-sm font-semibold"
              :class="
                cell.isToday
                  ? 'rounded-full bg-accent text-white'
                  : cell.inMonth
                    ? 'text-gray-900'
                    : 'text-gray-400'
              "
              :aria-current="cell.isToday ? 'date' : undefined"
            >
              <time :datetime="cell.key">{{ cell.date.getDate() }}</time>
            </span>
          </div>
          <div class="mt-1 min-h-0 flex-1 space-y-0.5 overflow-hidden">
            <template
              v-for="item in cell.visible"
              :key="item.event ? eventKey(item.event) : item.task!.objectUrl"
            >
              <EventChip
                v-if="item.event"
                :instance="item.event"
                :color="colorFor(item.event.collectionUrl)"
                :variant="item.allDay ? 'allday' : 'month'"
                :selected="selectedKey === eventKey(item.event)"
                @select="(i, el) => emit('selectEvent', i, el)"
              />
              <TaskChip
                v-else-if="item.task"
                :task="item.task"
                :color="colorFor(item.task.collectionUrl)"
                size="month"
                @select="(t, el) => emit('selectTask', t, el)"
              />
            </template>
            <button
              v-if="cell.hiddenCount"
              type="button"
              class="block w-full truncate px-1.5 text-left text-[11px] font-medium text-gray-500 hover:text-gray-900"
              @click.stop="emit('showMore', cell.date)"
            >
              +{{ cell.hiddenCount }} more
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
