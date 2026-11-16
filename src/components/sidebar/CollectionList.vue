<script setup lang="ts">
/**
 * Collapsible "Calendars" / "Tasks" section. Each row is a toggle: a dot in the collection's
 * color (task lists: a round task checkbox) that empties out, with the name graying, when the
 * collection is hidden. In the tinted event style the dot is a light tint with a colored ring,
 * like the chips (main.css). "Only" on hover shows just that one; on the only shown one, "All"
 * brings the rest back.
 */
import type { Collection } from '@/api/collections'
import AppIcon from '@/components/ui/AppIcon.vue'
import { FALLBACK_COLOR } from '@/stores/calendars'

const props = defineProps<{
  title: string
  collections: Collection[]
  isVisible: (url: string) => boolean
  loading?: boolean
  /** Task lists get the round task checkbox instead of a plain dot. */
  tasks?: boolean
}>()
const emit = defineEmits<{ toggle: [url: string, visible: boolean] }>()

function isOnly(url: string) {
  return props.collections.every((c) => props.isVisible(c.url) === (c.url === url))
}
function showOnly(url: string) {
  const all = isOnly(url)
  for (const c of props.collections) {
    const visible = all || c.url === url
    if (props.isVisible(c.url) !== visible) emit('toggle', c.url, visible)
  }
}
</script>

<template>
  <details open class="group mt-6 first:mt-0">
    <summary
      class="flex cursor-pointer list-none items-center justify-between rounded-sm px-2 py-1.5 text-sm font-semibold text-gray-500 hover:bg-white/60 [&::-webkit-details-marker]:hidden"
    >
      {{ title }}
      <AppIcon
        name="chevron-down"
        class="size-4 text-gray-400 transition-transform group-open:rotate-180"
      />
    </summary>
    <ul class="mt-1 space-y-0.5">
      <li v-if="loading && collections.length === 0" class="px-2 py-1.5 text-sm text-gray-400">
        Loading…
      </li>
      <li v-else-if="collections.length === 0" class="px-2 py-1.5 text-sm text-gray-400">None</li>
      <li
        v-for="c in collections"
        :key="c.url"
        class="group/row relative flex items-center rounded-sm hover:bg-white/60"
        :style="{ '--dot': c.color ?? FALLBACK_COLOR }"
      >
        <button
          type="button"
          role="switch"
          :aria-checked="isVisible(c.url)"
          :aria-label="`Show ${c.displayName}`"
          class="flex min-w-0 flex-1 items-center gap-x-3 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent"
          :class="isVisible(c.url) ? 'text-gray-700' : 'text-gray-400'"
          data-testid="collection-toggle"
          @click="emit('toggle', c.url, !isVisible(c.url))"
        >
          <!-- An SVG circle: a CSS border of 1.5px rounds unevenly at some display scales. -->
          <svg
            class="collection-dot size-3 shrink-0 overflow-visible transition-opacity duration-150"
            :class="isVisible(c.url) ? '' : 'opacity-60'"
            viewBox="0 0 12 12"
            :data-on="isVisible(c.url) || undefined"
            aria-hidden="true"
            data-testid="collection-dot"
          >
            <circle
              class="dot-circle"
              cx="6"
              cy="6"
              r="5.25"
              stroke-width="1.5"
              :fill="isVisible(c.url) ? 'var(--dot)' : 'none'"
              stroke="var(--dot)"
            />
            <path
              v-if="tasks && isVisible(c.url)"
              class="dot-check"
              d="M3.6 6.3 5.2 7.9 8.4 4.4"
              fill="none"
              stroke="var(--color-on-color)"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="truncate">{{ c.displayName }}</span>
        </button>
        <button
          v-if="collections.length > 1"
          type="button"
          class="mr-1 shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium text-gray-500 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 hover:bg-white hover:text-gray-900 focus-visible:opacity-100"
          :aria-label="isOnly(c.url) ? `Show all ${title.toLowerCase()}` : `Show only ${c.displayName}`"
          data-testid="collection-only"
          @click="showOnly(c.url)"
        >
          {{ isOnly(c.url) ? 'All' : 'Only' }}
        </button>
      </li>
    </ul>
  </details>
</template>
