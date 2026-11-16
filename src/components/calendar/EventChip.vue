<script setup lang="ts">
/**
 * Event chip in the calendar grids. Variants follow the mockup:
 *  - `timed`: absolutely positioned block (title + time range, then the location when there is
 *    room; repeat / reminder icons by the title when wide enough), `compact` → single line
 *  - `allday`: solid bar in the all-day row / month cell
 *  - `month`: one-line chip with the start time on the right
 * Tentative events are striped (Google Calendar).
 */
import { computed } from 'vue'

import type { EventInstance } from '@/api/ical'
import { textOn } from '@/lib/color'
import { formatTime } from '@/lib/format'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = defineProps<{
  instance: EventInstance
  color: string
  variant: 'timed' | 'allday' | 'month'
  compact?: boolean
  selected?: boolean
  continuesBefore?: boolean
  continuesAfter?: boolean
  /** Squeezed beside other chips: a smaller font. */
  small?: boolean
}>()
const emit = defineEmits<{ select: [instance: EventInstance, el: HTMLElement] }>()

/** Hover text: the title and when (the chip may be too small to show the time). */
const tooltip = computed(() => {
  const i = props.instance
  const name = i.summary || '(No title)'
  const when =
    props.variant === 'allday' || i.allDay
      ? 'All day'
      : `${formatTime(i.start)}–${formatTime(i.end)}`
  return `${name}\n${when}${i.status === 'TENTATIVE' ? ' · tentative' : ''}${i.location ? `\n${i.location}` : ''}`
})

function onClick(e: MouseEvent) {
  e.stopPropagation()
  emit('select', props.instance, e.currentTarget as HTMLElement)
}
</script>

<template>
  <button
    type="button"
    :title="tooltip"
    :style="{ backgroundColor: color, '--chip-fg': textOn(color), '--chip-color': color }"
    :data-selected="selected || undefined"
    :data-status="instance.status ?? undefined"
    class="chip-fill block w-full min-w-0 cursor-pointer overflow-hidden text-left text-(--chip-fg) chip-selectable transition-[filter,box-shadow,transform] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-900"
    :class="[
      variant === 'allday' ? 'truncate rounded-sm px-2 py-0.5 text-xs font-medium' : '',
      variant === 'month'
        ? '@container flex items-center gap-x-1 rounded-sm px-1.5 py-0.5 text-xs'
        : '',
      variant === 'timed' && compact
        ? '@container flex h-full items-center gap-x-1 rounded-md px-1.5 text-[10px] leading-none'
        : '',
      variant === 'timed' && !compact
        ? `@container flex h-full flex-col items-start justify-start rounded-md py-1 ${small ? 'px-1.5 text-[11px]' : 'px-2 text-xs'}`
        : '',
      continuesBefore ? 'rounded-t-none' : '',
      continuesAfter ? 'rounded-b-none' : '',
      instance.status === 'CANCELLED' ? 'line-through opacity-60' : '',
      instance.status === 'TENTATIVE' ? 'chip-tentative' : '',
    ]"
    @click="onClick"
  >
    <template v-if="variant === 'allday'">{{ instance.summary || '(No title)' }}</template>
    <template v-else-if="variant === 'month'">
      <span class="min-w-0 truncate font-medium">{{ instance.summary || '(No title)' }}</span>
      <span class="ml-auto hidden shrink-0 text-[11px] text-(--chip-fg)/80 @[7rem]:inline">{{
        formatTime(instance.start)
      }}</span>
    </template>
    <template v-else-if="compact">
      <span class="min-w-0 truncate font-medium">{{ instance.summary || '(No title)' }}</span>
      <span class="ml-auto hidden shrink-0 text-[11px] text-(--chip-fg)/80 @[8rem]:inline">
        <time :datetime="instance.start.toISOString()">{{ formatTime(instance.start) }}</time
        >–<time :datetime="instance.end.toISOString()">{{ formatTime(instance.end) }}</time>
      </span>
    </template>
    <template v-else>
      <p class="flex w-full min-w-0 items-center gap-x-1">
        <span class="min-w-0 truncate font-medium">{{ instance.summary || '(No title)' }}</span>
        <!-- Repeat / reminder: only when the chip is wide enough to keep the title readable. -->
        <span
          v-if="instance.isRecurring || instance.alarm != null"
          class="ml-auto hidden shrink-0 items-center gap-x-0.5 text-(--chip-fg)/75 @[7.5rem]:flex"
          data-testid="chip-icons"
        >
          <AppIcon
            v-if="instance.isRecurring"
            name="refresh"
            class="size-3"
            stroke-width="2"
            aria-label="Repeats"
          />
          <AppIcon
            v-if="instance.alarm != null"
            name="bell"
            class="size-3"
            stroke-width="2"
            aria-label="Reminder"
          />
        </span>
      </p>
      <p class="w-full truncate text-(--chip-fg)/80" :class="small ? 'text-[10px]' : 'text-[11px]'">
        <time :datetime="instance.start.toISOString()">{{ formatTime(instance.start) }}</time
        >–<time :datetime="instance.end.toISOString()">{{ formatTime(instance.end) }}</time>
      </p>
      <p
        v-if="instance.location"
        class="mt-px flex w-full min-w-0 items-center gap-x-0.5 text-(--chip-fg)/80"
        :class="small ? 'text-[10px]' : 'text-[11px]'"
        data-testid="chip-location"
      >
        <AppIcon name="pin" class="size-3 shrink-0" stroke-width="2" />
        <span class="truncate">{{ instance.location }}</span>
      </p>
    </template>
  </button>
</template>
