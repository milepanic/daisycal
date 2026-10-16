<script setup lang="ts">
/** Month grid in the sidebar: navigates months, highlights today and the selected date. */
import { computed, ref, watch } from 'vue'

import {
  type WeekStart,
  addDays,
  addMonths,
  isSameDay,
  startOfMonth,
  startOfWeek,
  toDateKey,
} from '@/lib/dates'
import { WEEKDAYS_LETTER, monthTitle } from '@/lib/format'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = withDefaults(defineProps<{ selected: Date; weekStart?: WeekStart }>(), {
  weekStart: 1,
})
const emit = defineEmits<{ select: [date: Date] }>()

const month = ref(startOfMonth(props.selected))
watch(
  () => props.selected,
  (d) => {
    month.value = startOfMonth(d)
  },
)

const today = new Date()
const weekdayLetters = computed(() =>
  Array.from({ length: 7 }, (_, i) => WEEKDAYS_LETTER[(props.weekStart + i) % 7]!),
)
const days = computed(() => {
  const start = startOfWeek(month.value, props.weekStart)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
})

function classFor(d: Date) {
  if (isSameDay(d, today)) return 'rounded-full bg-accent text-white'
  const base = d.getMonth() === month.value.getMonth() ? 'text-gray-700' : 'text-gray-400'
  if (isSameDay(d, props.selected))
    return `rounded-lg bg-white text-gray-900 ring-1 ring-gray-300 ${base}`
  return `rounded-lg hover:bg-white/60 ${base}`
}
</script>

<template>
  <div class="px-1">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-gray-900">{{ monthTitle(month) }}</h2>
      <div class="flex items-center gap-x-1">
        <button
          type="button"
          class="rounded-lg p-1 text-gray-500 hover:bg-white/60 hover:text-gray-700"
          @click="month = addMonths(month, -1)"
        >
          <span class="sr-only">Previous month</span>
          <AppIcon name="chevron-left" class="size-5" />
        </button>
        <button
          type="button"
          class="rounded-lg p-1 text-gray-500 hover:bg-white/60 hover:text-gray-700"
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
    <div class="mt-2 grid grid-cols-7 gap-y-0.5 text-center text-xs font-semibold">
      <button
        v-for="d in days"
        :key="toDateKey(d)"
        type="button"
        class="mx-auto flex size-7 items-center justify-center"
        :class="classFor(d)"
        :aria-current="isSameDay(d, today) ? 'date' : undefined"
        :aria-pressed="isSameDay(d, selected)"
        @click="emit('select', d)"
      >
        <time :datetime="toDateKey(d)">{{ d.getDate() }}</time>
      </button>
    </div>
  </div>
</template>
