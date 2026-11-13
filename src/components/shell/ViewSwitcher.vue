<script setup lang="ts">
/**
 * Segmented Agenda / Day / Work week / Week / Month control. The white "pill" behind the
 * active option slides to the newly picked one.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { CalendarView } from '@/lib/dates'

const props = defineProps<{ view: CalendarView }>()
const emit = defineEmits<{ change: [view: CalendarView] }>()

const OPTIONS: { view: CalendarView; label: string }[] = [
  { view: 'agenda', label: 'Agenda' },
  { view: 'day', label: 'Day' },
  { view: 'work-week', label: 'Work week' },
  { view: 'week', label: 'Week' },
  { view: 'month', label: 'Month' },
]

const root = ref<HTMLElement | null>(null)
/** Position of the pill; null until measured (the active button is then white itself). */
const pill = ref<{ left: number; width: number } | null>(null)
/** No slide for the first placement (and after resizes), only when the view changes. */
const animate = ref(false)

function measure() {
  const el = root.value?.querySelector<HTMLElement>('[aria-selected="true"]')
  pill.value = el && el.offsetWidth ? { left: el.offsetLeft, width: el.offsetWidth } : null
}

watch(
  () => props.view,
  async () => {
    animate.value = true
    await nextTick()
    measure()
  },
)

let observer: ResizeObserver | undefined
onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'function' && root.value) {
    observer = new ResizeObserver(() => {
      animate.value = false
      measure()
    })
    observer.observe(root.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div
    ref="root"
    class="relative flex h-9 rounded-sm bg-white/60 p-0.5"
    role="tablist"
    aria-label="Calendar view"
  >
    <span
      v-if="pill"
      class="absolute inset-y-0.5 rounded-sm bg-white motion-reduce:transition-none"
      :class="animate ? 'transition-[left,width] duration-200 ease-out' : ''"
      :style="{ left: `${pill.left}px`, width: `${pill.width}px` }"
      aria-hidden="true"
    ></span>
    <button
      v-for="o in OPTIONS"
      :key="o.view"
      type="button"
      role="tab"
      :aria-selected="o.view === view"
      class="relative flex items-center rounded-sm px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150"
      :class="
        o.view === view
          ? ['text-gray-900', pill ? '' : 'bg-white']
          : 'text-gray-600 hover:text-gray-900'
      "
      @click="emit('change', o.view)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
