<script setup lang="ts">
/**
 * Month grid, one row per week:
 *  - all-day and multi-day events are bars across their days, packed into lanes at the top
 *    of the week;
 *  - timed events are lines with a dot in the calendar color, the time and the title;
 *  - tasks keep their round checkbox;
 *  - what does not fit goes behind a "+N" pill that opens a card with the whole day.
 * The day number sits top left (with the month on the 1st); today's number is the red circle;
 * hovering a cell shows a "+" to add an event that day (a click anywhere on it does too).
 */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import type { EventInstance, Task } from '@/api/ical'
import { type DateRange, addDays, eachDay, isSameDay, startOfDay, toDateKey } from '@/lib/dates'
import { MONTHS_SHORT, WEEKDAYS_LONG, WEEKDAYS_SHORT, formatTime } from '@/lib/format'
import { isAllDayRow, layoutSpans } from '@/lib/layout'
import { formatPickerDate } from '@/lib/timeInput'
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

/** Lines a day cell shows below its number (bars and items together). */
const LINES = 4
/** A bar lane: chip height plus the gap between lanes. */
const LANE_PX = 22
const today = new Date()

type Single = { kind: 'event'; event: EventInstance } | { kind: 'task'; task: Task }

interface Day {
  date: Date
  key: string
  inMonth: boolean
  isToday: boolean
  /** Timed events and tasks of the day, in time order. */
  singles: Single[]
  /** Shown in the cell; the rest (with bars that did not fit) counts in `hidden`. */
  visible: Single[]
  hidden: number
}

const pendingCount = computed(() => props.pendingTasks?.length ?? 0)

const weeks = computed(() => {
  const days = eachDay(props.range)
  const spanning = props.instances.filter(isAllDayRow)
  const timed = props.instances.filter((i) => !isAllDayRow(i))
  const out = []
  for (let w = 0; w < days.length; w += 7) {
    const weekDays = days.slice(w, w + 7)
    const spans = layoutSpans(spanning, weekDays, (i) => ({ start: i.start, end: i.end }))
    const laneCount = spans.reduce((m, s) => Math.max(m, s.lane + 1), 0)
    // Keep at least one line for the day's own items.
    const shownLanes = Math.min(laneCount, LINES - 1)
    const cells: Day[] = weekDays.map((date, col) => {
      const dayStart = startOfDay(date)
      const dayEnd = addDays(dayStart, 1)
      const singles: Single[] = [
        ...timed
          .filter((i) => i.start < dayEnd && i.end > dayStart)
          .map((event) => ({ at: event.start.getTime(), s: { kind: 'event', event } as Single })),
        ...props.tasks
          .filter((t) => t.due && t.due >= dayStart && t.due < dayEnd)
          .map((task) => ({ at: task.due!.getTime(), s: { kind: 'task', task } as Single })),
      ]
        .sort((a, b) => a.at - b.at)
        .map((x) => x.s)
      const isToday = isSameDay(date, today)
      const hiddenBars = spans.filter(
        (s) => s.lane >= shownLanes && col >= s.startCol && col < s.startCol + s.span,
      ).length
      const room = LINES - shownLanes - (isToday && pendingCount.value ? 1 : 0)
      const overflow = singles.length > room || hiddenBars > 0
      const visible = overflow ? singles.slice(0, Math.max(0, room - 1)) : singles
      const f = props.focus
      return {
        date,
        key: toDateKey(date),
        inMonth: f ? date >= f.start && date < f.end : date.getMonth() === props.month,
        isToday,
        singles,
        visible,
        hidden: singles.length - visible.length + hiddenBars,
      }
    })
    out.push({
      key: cells[0]!.key,
      cells,
      bars: spans.filter((s) => s.lane < shownLanes),
      shownLanes,
    })
  }
  return out
})

const headers = computed(() =>
  Array.from({ length: 7 }, (_, i) => props.range.start.getDay() + i).map((d) => d % 7),
)
const showsToday = computed(() => weeks.value.some((w) => w.cells.some((c) => c.isToday)))

function eventKey(i: EventInstance) {
  return `${i.objectUrl}|${i.recurrenceId?.toString() ?? ''}`
}

function anchorOf(el: HTMLElement): Anchor {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

function createOn(date: Date, el: HTMLElement) {
  emit('createAt', startOfDay(date), addDays(startOfDay(date), 1), true, anchorOf(el))
}

// ---- pending tasks (today) -------------------------------------------------------------------
const pendingAnchor = ref<Anchor | null>(null)
function togglePending(e: MouseEvent) {
  pendingAnchor.value = pendingAnchor.value ? null : anchorOf(e.currentTarget as HTMLElement)
}

// ---- "+N": the whole day in a card -----------------------------------------------------------
const dayCard = shallowRef<{ day: Day; anchor: Anchor } | null>(null)
const dayCardEl = ref<HTMLElement | null>(null)
function openDay(day: Day, e: MouseEvent) {
  dayCard.value =
    dayCard.value?.day.key === day.key
      ? null
      : { day, anchor: anchorOf(e.currentTarget as HTMLElement) }
  emit('showMore', day.date)
}
/** Bars of the card's day (all of them, also those that did not fit). */
const dayCardBars = computed(() => {
  const d = dayCard.value?.day
  if (!d) return []
  const end = addDays(startOfDay(d.date), 1)
  return props.instances.filter((i) => isAllDayRow(i) && i.start < end && i.end > d.date)
})
const dayCardStyle = computed(() => {
  const a = dayCard.value?.anchor
  if (!a) return {}
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  return {
    left: `${Math.max(8, Math.min(a.x - 8, vw - 288 - 8))}px`,
    top: `${Math.max(8, Math.min(a.y - 40, vh - 360))}px`,
  }
})
function onDocMouseDown(e: MouseEvent) {
  if (dayCardEl.value && !dayCardEl.value.contains(e.target as Node)) dayCard.value = null
}
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    dayCard.value = null
  }
}
watch(dayCard, (card, prev) => {
  if (card && !prev) {
    document.addEventListener('mousedown', onDocMouseDown, true)
    document.addEventListener('keydown', onDocKeydown, true)
  } else if (!card) {
    document.removeEventListener('mousedown', onDocMouseDown, true)
    document.removeEventListener('keydown', onDocKeydown, true)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown, true)
  document.removeEventListener('keydown', onDocKeydown, true)
})

function selectEvent(i: EventInstance, el: HTMLElement) {
  dayCard.value = null
  emit('selectEvent', i, el)
}
function selectTask(t: Task, el: HTMLElement) {
  dayCard.value = null
  emit('selectTask', t, el)
}
</script>

<template>
  <div
    class="scroll-subtle flex min-h-0 flex-1 flex-col overflow-auto px-2 pb-2"
    data-testid="month-view"
  >
    <div class="flex min-h-[600px] flex-1 flex-col md:min-w-[640px]">
      <div class="sticky top-0 z-20 grid grid-cols-7 border-b border-gray-200 bg-white">
        <div
          v-for="d in headers"
          :key="d"
          class="py-2 text-center font-display text-[15px] font-normal"
          :class="d === today.getDay() && showsToday ? 'text-accent' : 'text-gray-800'"
        >
          <span class="hidden md:inline">{{ WEEKDAYS_LONG[d] }}</span>
          <span class="md:hidden">{{ WEEKDAYS_SHORT[d] }}</span>
        </div>
      </div>

      <div
        v-for="(week, wi) in weeks"
        :key="week.key"
        class="relative grid min-h-28 flex-1 grid-cols-7"
        :class="wi > 0 ? 'border-t border-gray-200' : ''"
        data-testid="month-week"
      >
        <!-- Day cells: number, the day's own items and "+N". -->
        <div
          v-for="(cell, ci) in week.cells"
          :key="cell.key"
          class="group flex min-h-0 cursor-pointer flex-col overflow-hidden p-1"
          :class="[ci > 0 ? 'border-l border-gray-200' : '', cell.inMonth ? '' : 'bg-gray-50/60']"
          :data-date="cell.key"
          @click="createOn(cell.date, $event.currentTarget as HTMLElement)"
        >
          <div class="flex h-6 shrink-0 items-center gap-x-1 pl-0.5">
            <span
              class="flex h-6 min-w-6 items-center justify-center px-1 font-numeric text-sm font-medium"
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
            <span
              v-if="cell.date.getDate() === 1"
              class="text-xs font-medium"
              :class="cell.inMonth ? 'text-gray-500' : 'text-gray-400'"
              >{{ MONTHS_SHORT[cell.date.getMonth()] }}</span
            >
            <button
              type="button"
              class="ml-auto flex size-5 items-center justify-center rounded-full text-gray-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700 focus-visible:opacity-100"
              :title="`New event on ${formatPickerDate(cell.date, { short: true })}`"
              @click.stop="createOn(cell.date, $event.currentTarget as HTMLElement)"
            >
              <span class="sr-only">New event on {{ formatPickerDate(cell.date) }}</span>
              <AppIcon name="plus" class="size-3.5" stroke-width="2" />
            </button>
          </div>

          <!-- Room for the week's bars (drawn over the row). -->
          <div
            class="shrink-0"
            :style="{ height: week.shownLanes ? `${week.shownLanes * LANE_PX + 4}px` : 0 }"
          ></div>

          <div class="min-h-0 space-y-px">
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
              v-for="s in cell.visible"
              :key="s.kind === 'event' ? eventKey(s.event) : s.task.objectUrl"
            >
              <button
                v-if="s.kind === 'event'"
                type="button"
                class="flex w-full min-w-0 items-center gap-x-1.5 rounded-sm px-1.5 py-0.5 text-left text-xs hover:bg-gray-100 data-selected:bg-gray-100 data-selected:ring-1 data-selected:ring-gray-300"
                :data-selected="selectedKey === eventKey(s.event) || undefined"
                :title="s.event.summary"
                data-testid="month-event"
                @click.stop="selectEvent(s.event, $event.currentTarget as HTMLElement)"
              >
                <span
                  class="size-2 shrink-0 rounded-full"
                  :style="{ backgroundColor: colorFor(s.event.collectionUrl) }"
                ></span>
                <span class="hidden shrink-0 text-gray-500 tabular-nums md:inline">{{
                  formatTime(s.event.start)
                }}</span>
                <span
                  class="min-w-0 truncate font-medium text-gray-800"
                  :class="s.event.status === 'CANCELLED' ? 'line-through opacity-60' : ''"
                  >{{ s.event.summary || '(No title)' }}</span
                >
              </button>
              <TaskChip
                v-else
                :task="s.task"
                :color="colorFor(s.task.collectionUrl)"
                size="month"
                @select="selectTask"
              />
            </template>
            <button
              v-if="cell.hidden"
              type="button"
              class="mt-0.5 ml-1 inline-flex h-5 items-center rounded-full bg-gray-100 px-2 text-[11px] font-semibold text-gray-600 hover:bg-gray-200 hover:text-gray-900"
              :aria-label="`${cell.hidden} more on ${formatPickerDate(cell.date)}`"
              data-testid="month-more"
              @click.stop="openDay(cell, $event)"
            >
              +{{ cell.hidden }}
            </button>
          </div>
        </div>

        <!-- All-day and multi-day events: bars across their days. -->
        <div
          v-if="week.bars.length"
          class="pointer-events-none absolute inset-x-0 top-[30px] grid grid-cols-7 gap-y-0.5"
          :style="{ gridTemplateRows: `repeat(${week.shownLanes}, 20px)` }"
        >
          <div
            v-for="b in week.bars"
            :key="eventKey(b.item) + b.startCol"
            class="pointer-events-auto min-w-0 px-1"
            :style="{ gridColumn: `${b.startCol + 1} / span ${b.span}`, gridRow: `${b.lane + 1}` }"
          >
            <EventChip
              :instance="b.item"
              :color="colorFor(b.item.collectionUrl)"
              variant="allday"
              :selected="selectedKey === eventKey(b.item)"
              :continues-before="b.continuesBefore"
              :continues-after="b.continuesAfter"
              @select="selectEvent"
            />
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

    <!-- "+N": everything on that day. -->
    <Transition name="pop">
      <div
        v-if="dayCard"
        ref="dayCardEl"
        role="dialog"
        :aria-label="formatPickerDate(dayCard.day.date)"
        class="fixed z-50 w-72 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-gray-200"
        :style="dayCardStyle"
        data-testid="month-day-card"
      >
        <div class="mb-2 flex items-center justify-between">
          <h3 class="font-display text-[15px] font-bold text-gray-900">
            {{ formatPickerDate(dayCard.day.date) }}
          </h3>
          <button
            type="button"
            class="-mt-1 -mr-1 flex size-8 items-center justify-center rounded-full text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
            @click="dayCard = null"
          >
            <span class="sr-only">Close</span>
            <AppIcon name="close" class="size-4" />
          </button>
        </div>
        <div class="max-h-80 space-y-0.5 overflow-y-auto">
          <EventChip
            v-for="b in dayCardBars"
            :key="eventKey(b)"
            :instance="b"
            :color="colorFor(b.collectionUrl)"
            variant="allday"
            :selected="selectedKey === eventKey(b)"
            @select="selectEvent"
          />
          <template
            v-for="s in dayCard.day.singles"
            :key="s.kind === 'event' ? eventKey(s.event) : s.task.objectUrl"
          >
            <button
              v-if="s.kind === 'event'"
              type="button"
              class="flex w-full min-w-0 items-center gap-x-2 rounded-sm px-1.5 py-1 text-left text-xs hover:bg-gray-100"
              @click="selectEvent(s.event, $event.currentTarget as HTMLElement)"
            >
              <span
                class="size-2 shrink-0 rounded-full"
                :style="{ backgroundColor: colorFor(s.event.collectionUrl) }"
              ></span>
              <span class="shrink-0 text-gray-500 tabular-nums"
                >{{ formatTime(s.event.start) }}–{{ formatTime(s.event.end) }}</span
              >
              <span class="min-w-0 truncate font-medium text-gray-800">{{
                s.event.summary || '(No title)'
              }}</span>
            </button>
            <TaskChip
              v-else
              :task="s.task"
              :color="colorFor(s.task.collectionUrl)"
              size="month"
              @select="selectTask"
            />
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>
