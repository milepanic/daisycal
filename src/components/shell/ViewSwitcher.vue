<script setup lang="ts">
/**
 * Segmented Agenda / Day / Work week / Week / Month control in an outlined track. A dark gray
 * pill (white text) behind the active option slides to the newly picked one.
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
const pill = ref<{ left: number; top: number; width: number; height: number } | null>(null)
/** No slide for the first placement (and after resizes), only when the view changes. */
const animate = ref(false)

function measure() {
  const box = root.value
  const el = box?.querySelector<HTMLElement>('[aria-selected="true"]')
  if (!box || !el || !el.offsetWidth) {
    pill.value = null
    return
  }
  // Fractional positions (offsetLeft / offsetWidth round to whole pixels, which left the pill
  // off by a fraction against the track).
  const r = el.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  pill.value = {
    left: r.left - b.left - box.clientLeft,
    top: r.top - b.top - box.clientTop,
    width: r.width,
    height: r.height,
  }
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
    // The buttons too: they change width when the web font arrives while the track may not.
    observer.observe(root.value)
    for (const b of root.value.querySelectorAll('button')) observer.observe(b)
  }
  void document.fonts?.ready.then(() => {
    animate.value = false
    measure()
  })
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div
    ref="root"
    class="relative flex h-9 rounded-full ring-1 ring-gray-300"
    role="tablist"
    aria-label="Calendar view"
  >
    <span
      v-if="pill"
      class="absolute rounded-full bg-pill motion-reduce:transition-none"
      :class="animate ? 'transition-[left,width] duration-200 ease-out' : ''"
      :style="{
        left: `${pill.left}px`,
        top: `${pill.top}px`,
        width: `${pill.width}px`,
        height: `${pill.height}px`,
      }"
      aria-hidden="true"
    ></span>
    <button
      v-for="o in OPTIONS"
      :key="o.view"
      type="button"
      role="tab"
      :aria-selected="o.view === view"
      class="relative flex items-center rounded-full px-3 text-sm whitespace-nowrap transition-colors duration-150"
      :class="
        o.view === view
          ? ['font-semibold text-on-color', pill ? '' : 'bg-pill']
          : 'font-medium text-gray-600 hover:text-gray-900'
      "
      @click="emit('change', o.view)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
