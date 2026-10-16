<script setup lang="ts">
/**
 * Day/work-week/week grid: sticky day headers with the all-day row, hour labels, one column
 * per day with positioned events, due tasks, the current-time line and click-to-create.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { EventInstance, Task } from '@/api/ical'
import { addDays, isSameDay, startOfDay, toDateKey } from '@/lib/dates'
import { WEEKDAYS_LONG, formatTime } from '@/lib/format'
import {
  DAY_PX,
  HOUR_PX,
  isAllDayRow,
  layoutDay,
  layoutSpans,
  minutesSinceMidnight,
  slotFromOffset,
} from '@/lib/layout'
import type { Anchor, CreateDraft } from '@/stores/ui'
import EventChip from './EventChip.vue'
import TaskChip from './TaskChip.vue'

const props = defineProps<{
  days: Date[]
  instances: EventInstance[]
  tasks: Task[]
  colorFor: (collectionUrl: string) => string
  selectedKey?: string | null
  /** Hour the grid scrolls to on mount (the mockup starts at 07:00). */
  scrollToHour?: number
  /** Event/task being created: previewed in the grid (mockup #draft-event / #draft-task). */
  draft?: CreateDraft | null
  draftColor?: string
}>()
const emit = defineEmits<{
  selectEvent: [instance: EventInstance, el: HTMLElement]
  selectTask: [task: Task, el: HTMLElement]
  createAt: [start: Date, end: Date, allDay: boolean, anchor: Anchor]
}>()

const root = ref<HTMLElement | null>(null)
const now = ref(new Date())
let tick: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  const hour = props.scrollToHour ?? 7
  if (root.value) root.value.scrollTop = hour * HOUR_PX - 8
  tick = setInterval(() => (now.value = new Date()), 60_000)
})
onBeforeUnmount(() => {
  if (tick) clearInterval(tick)
})

const gridCols = computed(() => `3.5rem repeat(${props.days.length}, minmax(0, 1fr))`)
const hours = Array.from({ length: 23 }, (_, i) => i + 1)

const allDayPlacements = computed(() =>
  layoutSpans(props.instances.filter(isAllDayRow), props.days, (i) => ({
    start: i.start,
    end: i.end,
  })),
)
const allDayLanes = computed(() => Math.max(1, ...allDayPlacements.value.map((p) => p.lane + 1)))

const columns = computed(() =>
  props.days.map((day) => {
    const dayStart = startOfDay(day)
    const dayEnd = addDays(dayStart, 1)
    return {
      day,
      key: toDateKey(day),
      isToday: isSameDay(day, now.value),
      placements: layoutDay(props.instances, day),
      tasks: props.tasks.filter(
        (t) => t.due && !t.dueAllDay && t.due >= dayStart && t.due < dayEnd,
      ),
    }
  }),
)

const nowTop = computed(() => minutesSinceMidnight(now.value, now.value) * (HOUR_PX / 60))

function eventKey(i: EventInstance) {
  return `${i.objectUrl}|${i.recurrenceId?.toString() ?? ''}`
}

function anchorAt(e: MouseEvent): Anchor {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: r.left, y: e.clientY, width: r.width, height: 0 }
}

function onColumnClick(day: Date, e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const start = slotFromOffset(day, e.clientY - el.getBoundingClientRect().top)
  emit('createAt', start, new Date(start.getTime() + 60 * 60_000), false, anchorAt(e))
}

function onAllDayClick(day: Date, e: MouseEvent) {
  const start = startOfDay(day)
  emit('createAt', start, addDays(start, 1), true, anchorAt(e))
}

/** Where the draft chip goes in each column (null when it is not a timed draft on that day). */
function draftPlacement(day: Date) {
  const d = props.draft
  if (!d?.start || !d.end || d.allDay || d.edit) return null
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  if (!(d.start < dayEnd && d.end > dayStart)) return null
  const top = (Math.max(d.start.getTime(), dayStart.getTime()) - dayStart.getTime()) / 60_000
  const bottom = (Math.min(d.end.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 60_000
  return { top, height: Math.max(bottom - top, d.kind === 'task' ? 22 : 16) }
}

/** Tasks due at the same time share one row (mockup: "3 tasks at the same time, inline"). */
function taskRows(tasks: Task[]): { top: number; tasks: Task[] }[] {
  const byTime = new Map<number, Task[]>()
  for (const t of tasks) {
    const key = t.due!.getTime()
    byTime.set(key, [...(byTime.get(key) ?? []), t])
  }
  return [...byTime.entries()].map(([time, list]) => ({
    top: minutesSinceMidnight(new Date(time), new Date(time)) * (HOUR_PX / 60),
    tasks: list,
  }))
}
</script>

<template>
  <div ref="root" class="min-h-0 flex-1 overflow-auto px-2 pb-2" data-testid="time-grid">
    <div :class="days.length > 1 ? 'min-w-[640px]' : 'min-w-[320px]'">
      <!-- Day headers + all-day events (sticky) -->
      <div class="sticky top-0 z-20 border-b border-gray-200 bg-white pb-0.5">
        <div class="grid" :style="{ gridTemplateColumns: gridCols }">
          <div></div>
          <div v-for="c in columns" :key="c.key" class="flex flex-col items-center py-2">
            <span
              class="text-sm font-medium"
              :class="c.isToday ? 'text-accent' : 'text-gray-500'"
              >{{ WEEKDAYS_LONG[c.day.getDay()] }}</span
            >
            <span
              class="mx-auto mt-1 flex size-8 items-center justify-center text-base font-semibold"
              :class="c.isToday ? 'rounded-full bg-accent text-white' : 'rounded-lg text-gray-900'"
              :aria-current="c.isToday ? 'date' : undefined"
            >
              {{ c.day.getDate() }}
            </span>
          </div>
        </div>
        <div class="mt-1 grid items-start" :style="{ gridTemplateColumns: gridCols }">
          <span class="pr-2 text-right text-[11px] leading-6 text-gray-400">All day</span>
          <div
            class="relative col-span-full col-start-2 grid gap-y-0.5"
            :style="{
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
              gridAutoRows: '1.5rem',
              minHeight: `${allDayLanes * 1.5}rem`,
            }"
            data-testid="allday-row"
          >
            <div
              v-for="c in columns"
              :key="c.key"
              class="cursor-pointer hover:bg-gray-50"
              :style="{
                gridColumn: `${days.findIndex((d) => isSameDay(d, c.day)) + 1}`,
                gridRow: `1 / span ${allDayLanes}`,
              }"
              @click="onAllDayClick(c.day, $event)"
            ></div>
            <div
              v-for="p in allDayPlacements"
              :key="eventKey(p.item)"
              class="min-w-0 px-0.5"
              :style="{
                gridColumn: `${p.startCol + 1} / span ${p.span}`,
                gridRow: `${p.lane + 1}`,
              }"
            >
              <EventChip
                :instance="p.item"
                :color="colorFor(p.item.collectionUrl)"
                variant="allday"
                :selected="selectedKey === eventKey(p.item)"
                :continues-before="p.continuesBefore"
                :continues-after="p.continuesAfter"
                @select="(i, el) => emit('selectEvent', i, el)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Time grid -->
      <div class="grid" :style="{ gridTemplateColumns: gridCols, height: `${DAY_PX}px` }">
        <div class="relative">
          <span
            v-for="h in hours"
            :key="h"
            class="absolute right-2 -translate-y-1/2 text-[11px] text-gray-400"
            :style="{ top: `${h * HOUR_PX}px` }"
          >
            {{ String(h).padStart(2, '0') }}:00
          </span>
        </div>
        <div
          v-for="c in columns"
          :key="c.key"
          class="relative cursor-pointer border-l border-gray-200 bg-[repeating-linear-gradient(to_bottom,var(--color-gray-200)_0_1px,transparent_1px_60px)]"
          :data-day="c.key"
          @click="onColumnClick(c.day, $event)"
        >
          <div
            v-for="p in c.placements"
            :key="eventKey(p.instance)"
            class="absolute z-10"
            :style="{
              top: `${p.top}px`,
              height: `${p.height}px`,
              left: `calc(${p.left * 100}% + 2px)`,
              width: `calc(${p.width * 100}% - 4px)`,
            }"
            :class="p.left > 0 ? 'ring-1 ring-white' : ''"
          >
            <EventChip
              :instance="p.instance"
              :color="colorFor(p.instance.collectionUrl)"
              variant="timed"
              :compact="p.compact"
              :selected="selectedKey === eventKey(p.instance)"
              :continues-before="p.continuesBefore"
              :continues-after="p.continuesAfter"
              @select="(i, el) => emit('selectEvent', i, el)"
            />
          </div>
          <div
            v-for="row in taskRows(c.tasks)"
            :key="row.top"
            class="absolute inset-x-0.5 z-10 flex h-[22px] gap-x-0.5"
            :style="{ top: `${row.top}px` }"
          >
            <TaskChip
              v-for="t in row.tasks"
              :key="t.objectUrl"
              :task="t"
              :color="colorFor(t.collectionUrl)"
              class="min-w-0 flex-1"
              @select="(task, el) => emit('selectTask', task, el)"
            />
          </div>
          <div
            v-if="draftPlacement(c.day)"
            class="pointer-events-none absolute inset-x-0.5 z-40 overflow-hidden rounded-lg text-xs ring-2 ring-white"
            :class="
              draft?.kind === 'task'
                ? 'flex items-center gap-x-1.5 bg-gray-100 px-2'
                : 'px-2 py-1 text-white'
            "
            :style="{
              top: `${draftPlacement(c.day)!.top}px`,
              height: `${draftPlacement(c.day)!.height}px`,
              backgroundColor: draft?.kind === 'task' ? undefined : draftColor,
            }"
            data-testid="draft-chip"
          >
            <template v-if="draft?.kind === 'task'">
              <span
                class="size-3 shrink-0 rounded-sm"
                :style="{ backgroundColor: (draftColor ?? '#7c3aed') + '33' }"
              ></span>
              <span class="truncate font-medium text-gray-800">{{
                draft?.title || '(No title)'
              }}</span>
            </template>
            <template v-else>
              <p class="truncate font-semibold">{{ draft?.title || '(No title)' }}</p>
              <p class="truncate text-[11px] text-white/80">
                {{ formatTime(draft!.start!) }}–{{ formatTime(draft!.end!) }}
              </p>
            </template>
          </div>
          <div
            v-if="c.isToday"
            class="pointer-events-none absolute inset-x-0 z-10 flex items-center"
            :style="{ top: `${nowTop}px` }"
            data-testid="now-line"
          >
            <span class="-ml-1 size-2 rounded-lg bg-accent"></span>
            <span class="h-0.5 flex-1 bg-accent"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
