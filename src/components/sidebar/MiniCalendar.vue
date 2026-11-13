<script setup lang="ts">
/**
 * Month grid in the sidebar: navigates months, highlights today, and shades the days the
 * calendar grid shows (`range`: a band over the week / day) or else the selected date.
 *
 * Dragging across days picks them (`selectRange`): the band follows the pointer and the
 * calendar shows exactly those days on release.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import {
  type DateRange,
  MAX_CUSTOM_DAYS,
  type WeekStart,
  addDays,
  addMonths,
  daysIn,
  snapCustomRange,
  isSameDay,
  startOfMonth,
  startOfWeek,
  toDateKey,
} from '@/lib/dates'
import { WEEKDAYS_LETTER, monthTitle } from '@/lib/format'
import { slideIn } from '@/lib/motion'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = withDefaults(
  defineProps<{
    selected: Date
    weekStart?: WeekStart
    /** Days shown in the calendar grid (day / week views); shaded as one band. */
    range?: DateRange | null
  }>(),
  { weekStart: 1, range: null },
)
const emit = defineEmits<{ select: [date: Date]; selectRange: [start: Date, days: number] }>()

const month = ref(startOfMonth(props.selected))
watch(
  () => props.selected,
  (d) => {
    month.value = startOfMonth(d)
  },
)

/** The days slide in from the side of the month they come from. */
const dayGrid = ref<HTMLElement | null>(null)
watch(month, async (next, prev) => {
  if (next.getTime() === prev.getTime()) return
  await nextTick()
  slideIn(dayGrid.value, next > prev ? 16 : -16, 0, 200)
})

const today = new Date()
const weekdayLetters = computed(() =>
  Array.from({ length: 7 }, (_, i) => WEEKDAYS_LETTER[(props.weekStart + i) % 7]!),
)
const days = computed(() => {
  const start = startOfWeek(month.value, props.weekStart)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
})

// ---- drag to pick days --------------------------------------------------------------------
const dragFrom = ref<Date | null>(null)
const dragTo = ref<Date | null>(null)

/** The days under the drag, first to last (at most MAX_CUSTOM_DAYS). */
const dragRange = computed<DateRange | null>(() => {
  if (!dragFrom.value || !dragTo.value || isSameDay(dragFrom.value, dragTo.value)) return null
  const [a, b] =
    dragFrom.value < dragTo.value ? [dragFrom.value, dragTo.value] : [dragTo.value, dragFrom.value]
  const days = Math.min(daysIn({ start: a, end: addDays(b, 1) }), MAX_CUSTOM_DAYS)
  // Shown snapped, as the calendar will show it (whole weeks beyond seven days).
  return snapCustomRange(a, days, props.weekStart)
})

function onDayPointerDown(d: Date, e: PointerEvent) {
  if (e.button !== 0 || e.pointerType === 'touch') return
  dragFrom.value = d
  dragTo.value = d
  document.addEventListener('pointerup', onPointerUp)
}
function onDayPointerEnter(d: Date) {
  if (dragFrom.value) dragTo.value = d
}
function onPointerUp() {
  document.removeEventListener('pointerup', onPointerUp)
  const r = dragRange.value
  dragFrom.value = null
  dragTo.value = null
  // A press without moving to another day stays a click (select).
  if (r) emit('selectRange', r.start, daysIn(r))
}
onBeforeUnmount(() => document.removeEventListener('pointerup', onPointerUp))

function inRange(d: Date) {
  const r = dragRange.value ?? props.range
  return r ? d >= r.start && d < r.end : isSameDay(d, props.selected)
}

/** The band cell behind a day: shaded in range, rounded where a row or the range ends. */
function cellClass(d: Date, i: number) {
  if (!inRange(d)) return ''
  const first = i % 7 === 0 || !inRange(addDays(d, -1))
  const last = i % 7 === 6 || !inRange(addDays(d, 1))
  return ['bg-gray-200', first ? 'rounded-l-full' : '', last ? 'rounded-r-full' : '']
}

function classFor(d: Date) {
  if (isSameDay(d, today)) return 'rounded-full bg-accent text-on-color'
  const base = d.getMonth() === month.value.getMonth() ? 'text-gray-700' : 'text-gray-400'
  if (inRange(d)) return 'rounded-full text-gray-900'
  return `rounded-full hover:bg-white/60 ${base}`
}
</script>

<template>
  <div class="px-1">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="font-display text-sm font-bold text-gray-900">{{ monthTitle(month) }}</h2>
      <div class="flex items-center gap-x-1">
        <button
          type="button"
          class="rounded-sm p-1 text-gray-500 hover:bg-white/60 hover:text-gray-700"
          @click="month = addMonths(month, -1)"
        >
          <span class="sr-only">Previous month</span>
          <AppIcon name="chevron-left" class="size-5" />
        </button>
        <button
          type="button"
          class="rounded-sm p-1 text-gray-500 hover:bg-white/60 hover:text-gray-700"
          @click="month = addMonths(month, 1)"
        >
          <span class="sr-only">Next month</span>
          <AppIcon name="chevron-right" class="size-5" />
        </button>
      </div>
    </div>
    <div class="grid grid-cols-7 text-center text-[11px] font-medium text-gray-500">
      <div v-for="(letter, i) in weekdayLetters" :key="i">{{ letter }}</div>
    </div>
    <div
      ref="dayGrid"
      class="mt-2 grid grid-cols-7 gap-y-0.5 text-center font-numeric text-xs font-light select-none"
      data-testid="mini-days"
    >
      <div
        v-for="(d, i) in days"
        :key="toDateKey(d)"
        class="flex"
        :class="cellClass(d, i)"
        @pointerenter="onDayPointerEnter(d)"
      >
        <button
          type="button"
          class="mx-auto flex size-7 items-center justify-center"
          :class="classFor(d)"
          :aria-current="isSameDay(d, today) ? 'date' : undefined"
          :aria-pressed="isSameDay(d, selected)"
          @pointerdown="onDayPointerDown(d, $event)"
          @click="emit('select', d)"
        >
          <time :datetime="toDateKey(d)">{{ d.getDate() }}</time>
        </button>
      </div>
    </div>
  </div>
</template>
