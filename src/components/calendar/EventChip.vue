<script setup lang="ts">
/**
 * Event chip in the calendar grids. Variants follow the mockup:
 *  - `timed`: absolutely positioned block (title + time range), `compact` → single line
 *  - `allday`: solid bar in the all-day row / month cell
 *  - `month`: one-line chip with the start time on the right
 */
import type { EventInstance } from '@/api/ical'
import { formatTime } from '@/lib/format'

const props = defineProps<{
  instance: EventInstance
  color: string
  variant: 'timed' | 'allday' | 'month'
  compact?: boolean
  selected?: boolean
  continuesBefore?: boolean
  continuesAfter?: boolean
}>()
const emit = defineEmits<{ select: [instance: EventInstance, el: HTMLElement] }>()

function onClick(e: MouseEvent) {
  e.stopPropagation()
  emit('select', props.instance, e.currentTarget as HTMLElement)
}
</script>

<template>
  <button
    type="button"
    :title="instance.summary"
    :style="{ backgroundColor: color }"
    :data-selected="selected || undefined"
    class="block w-full min-w-0 cursor-pointer overflow-hidden text-left text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-900 data-selected:ring-2 data-selected:ring-gray-900 data-selected:ring-offset-1"
    :class="[
      variant === 'allday' ? 'truncate rounded-lg px-2 py-0.5 text-xs font-semibold' : '',
      variant === 'month'
        ? '@container flex items-center gap-x-1 rounded-lg px-1.5 py-0.5 text-xs'
        : '',
      variant === 'timed' && compact
        ? '@container flex h-full items-center gap-x-1 rounded-lg px-1.5 text-[10px] leading-none'
        : '',
      variant === 'timed' && !compact ? 'h-full rounded-lg px-2 py-1 text-xs' : '',
      continuesBefore ? 'rounded-t-none' : '',
      continuesAfter ? 'rounded-b-none' : '',
      instance.status === 'CANCELLED' ? 'line-through opacity-60' : '',
    ]"
    @click="onClick"
  >
    <template v-if="variant === 'allday'">{{ instance.summary || '(No title)' }}</template>
    <template v-else-if="variant === 'month'">
      <span class="min-w-0 truncate font-semibold">{{ instance.summary || '(No title)' }}</span>
      <span class="ml-auto hidden shrink-0 text-[11px] text-white/80 @[7rem]:inline">{{
        formatTime(instance.start)
      }}</span>
    </template>
    <template v-else-if="compact">
      <span class="min-w-0 truncate font-semibold">{{ instance.summary || '(No title)' }}</span>
      <span class="ml-auto hidden shrink-0 text-[11px] text-white/80 @[8rem]:inline">
        <time :datetime="instance.start.toISOString()">{{ formatTime(instance.start) }}</time
        >–<time :datetime="instance.end.toISOString()">{{ formatTime(instance.end) }}</time>
      </span>
    </template>
    <template v-else>
      <p class="truncate font-semibold">{{ instance.summary || '(No title)' }}</p>
      <p class="truncate text-[11px] text-white/80">
        <time :datetime="instance.start.toISOString()">{{ formatTime(instance.start) }}</time
        >–<time :datetime="instance.end.toISOString()">{{ formatTime(instance.end) }}</time>
      </p>
    </template>
  </button>
</template>
