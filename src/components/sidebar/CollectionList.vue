<script setup lang="ts">
/** Collapsible "My calendars" / "Task lists" section with color checkboxes. */
import type { Collection } from '@/api/collections'
import AppIcon from '@/components/ui/AppIcon.vue'
import ColorCheckbox from '@/components/ui/ColorCheckbox.vue'
import { FALLBACK_COLOR } from '@/stores/calendars'

defineProps<{
  title: string
  collections: Collection[]
  isVisible: (url: string) => boolean
  loading?: boolean
}>()
const emit = defineEmits<{ toggle: [url: string, visible: boolean] }>()
</script>

<template>
  <details open class="group mt-6">
    <summary
      class="flex cursor-pointer list-none items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase hover:bg-white/60 [&::-webkit-details-marker]:hidden"
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
      <li v-for="c in collections" :key="c.url">
        <label
          class="flex cursor-pointer items-center gap-x-3 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-white/60"
        >
          <ColorCheckbox
            :color="c.color ?? FALLBACK_COLOR"
            :model-value="isVisible(c.url)"
            @update:model-value="emit('toggle', c.url, $event)"
          />
          <span class="truncate">{{ c.displayName }}</span>
        </label>
      </li>
    </ul>
  </details>
</template>
