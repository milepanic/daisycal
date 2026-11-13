<script setup lang="ts">
import { computed, ref } from 'vue'

import type { EventInstance, Task } from '@/api/ical'
import { type DateRange, addDays, startOfDay } from '@/lib/dates'
import { MONTHS_SHORT, WEEKDAYS_LONG } from '@/lib/format'
import { buildMonthCells } from '@/lib/layout'
import type { Anchor } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import EventChip from './EventChip.vue'
import PendingTasksPopover from './PendingTasksPopover.vue'
import TaskChip from './TaskChip.vue'

const props = defineProps<{
  range: DateRange
  month: number
  instances: EventInstance[]
  tasks: Task[]
  colorFor: (collectionUrl: string) => string
  selectedKey?: string | null
  /** Overdue open tasks, shown as "N pending tasks" in today's cell. */
  pendingTasks?: Task[]
  /** Custom pick: these days are the "current" ones (instead of `month`), the rest shaded. */
  focus?: DateRange | null
}>()
const emit = defineEmits<{
  selectEvent: [instance: EventInstance, el: HTMLElement]
  selectTask: [task: Task, el: HTMLElement]
  createAt: [start: Date, end: Date, allDay: boolean, anchor: Anchor]
  showMore: [date: Date]
}>()

const MAX_ROWS = 3
const pendingCount = computed(() => props.pendingTasks?.length ?? 0)
const cells = computed(() =>
  buildMonthCells(props.range, props.month, props.instances, props.tasks, MAX_ROWS).map((cell) => {
    const f = props.focus
    const c = f ? { ...cell, inMonth: cell.date >= f.start && cell.date < f.end } : cell
    // "N pending tasks" takes one of today's rows.
    if (!c.isToday || pendingCount.value === 0) return c
    const rows = MAX_ROWS - 1
    const hiddenCount = c.items.length > rows ? c.items.length - (rows - 1) : 0
    return { ...c, visible: hiddenCount ? c.items.slice(0, rows - 1) : c.items, hiddenCount }
  }),
)

const pendingAnchor = ref<Anchor | null>(null)
function togglePending(e: MouseEvent) {
  if (pendingAnchor.value) {
    pendingAnchor.value = null
    return
  }
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  pendingAnchor.value = { x: r.left, y: r.top, width: r.width, height: r.height }
}
const headers = computed(() =>
  Array.from({ length: 7 }, (_, i) => props.range.start.getDay() + i).map((d) => d % 7),
)
const today = new Date()

function eventKey(i: EventInstance) {
  return `${i.objectUrl}|${i.recurrenceId?.toString() ?? ''}`
}

function onCellClick(date: Date, e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  emit('createAt', startOfDay(date), addDays(startOfDay(date), 1), true, {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
  })
}
</script>

<template>
  <div
    class="scroll-subtle flex min-h-0 flex-1 flex-col overflow-auto px-2 pb-2"
    data-testid="month-view"
  >
    <div class="flex min-h-[600px] min-w-[640px] flex-1 flex-col">
      <div class="sticky top-0 z-20 grid grid-cols-7 border-b border-gray-200 bg-white">
        <div
          v-for="d in headers"
          :key="d"
          class="py-2 text-center font-display text-[15px] font-normal"
          :class="
            d === today.getDay() && cells.some((c) => c.isToday) ? 'text-accent' : 'text-gray-800'
          "
        >
          {{ WEEKDAYS_LONG[d] }}
        </div>
      </div>
      <div
        class="grid flex-1 grid-cols-7 [&>*:nth-child(-n+7)]:border-t-0 [&>*:nth-child(7n+1)]:border-l-0"
        :style="{ gridTemplateRows: `repeat(${cells.length / 7}, minmax(0, 1fr))` }"
      >
        <div
          v-for="cell in cells"
          :key="cell.key"
          class="flex min-h-0 cursor-pointer flex-col border-t border-l border-gray-200 p-1"
          :class="cell.inMonth ? '' : 'bg-gray-50/60'"
          :data-date="cell.key"
          @click="onCellClick(cell.date, $event)"
        >
          <div class="flex h-7 items-center justify-center gap-x-1">
            <span v-if="cell.date.getDate() === 1" class="text-xs font-medium text-gray-500">{{
              MONTHS_SHORT[cell.date.getMonth()]
            }}</span>
            <span
              class="flex size-7 items-center justify-center font-numeric text-sm font-medium"
              :class="
                cell.isToday
                  ? 'rounded-full bg-accent text-on-color'
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
            <button
              v-if="cell.isToday && pendingCount"
              type="button"
              class="flex w-full items-center gap-x-1.5 truncate rounded-sm px-1.5 py-0.5 text-left text-xs text-gray-700 hover:bg-gray-100"
              :class="pendingAnchor ? 'bg-gray-100' : ''"
              :aria-expanded="pendingAnchor ? 'true' : 'false'"
              aria-haspopup="dialog"
              data-testid="pending-tasks"
              @click.stop="togglePending"
            >
              <AppIcon name="tasks" class="size-3.5 shrink-0 text-red-500" />
              <span class="truncate"
                >{{ pendingCount }} pending {{ pendingCount === 1 ? 'task' : 'tasks' }}</span
              >
            </button>
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

    <Transition name="pop">
      <PendingTasksPopover
        v-if="pendingAnchor && pendingTasks?.length"
        :tasks="pendingTasks"
        :anchor="pendingAnchor"
        :color-for="colorFor"
        @close="pendingAnchor = null"
      />
    </Transition>
  </div>
</template>
