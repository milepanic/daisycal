<script setup lang="ts">
import type { CalendarView } from '@/lib/dates'

defineProps<{ view: CalendarView }>()
const emit = defineEmits<{ change: [view: CalendarView] }>()

const OPTIONS: { view: CalendarView; label: string }[] = [
  { view: 'agenda', label: 'Agenda' },
  { view: 'day', label: 'Day' },
  { view: 'work-week', label: 'Work week' },
  { view: 'week', label: 'Week' },
  { view: 'month', label: 'Month' },
]
</script>

<template>
  <div class="flex h-9 rounded-lg bg-white/60 p-0.5" role="tablist" aria-label="Calendar view">
    <button
      v-for="o in OPTIONS"
      :key="o.view"
      type="button"
      role="tab"
      :aria-selected="o.view === view"
      class="flex items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap"
      :class="o.view === view ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'"
      @click="emit('change', o.view)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
