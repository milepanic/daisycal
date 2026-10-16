<script setup lang="ts">
/** Square 36px icon button on the page background (header actions). */
import AppIcon from './AppIcon.vue'

defineProps<{ icon: string; label: string; active?: boolean }>()
</script>

<template>
  <button
    type="button"
    :title="label"
    :aria-pressed="active === undefined ? undefined : active"
    class="flex size-9 items-center justify-center rounded-lg text-gray-500 hover:bg-white/60 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-accent"
    :class="active ? 'bg-white text-gray-900' : ''"
  >
    <span class="sr-only">{{ label }}</span>
    <AppIcon :name="icon" class="size-5" />
  </button>
</template>
