<script setup lang="ts">
/** Square 36px icon button on the page background (header actions). */
import AppIcon from './AppIcon.vue'

// Defaults of undefined: plain buttons get no aria-pressed at all (Vue would make them false).
withDefaults(
  defineProps<{
    icon: string
    label: string
    /** Pressed with a white background. */
    active?: boolean
    /** Pressed, shown only by the icon itself (toggles that swap icons, like the theme). */
    pressed?: boolean
  }>(),
  { active: undefined, pressed: undefined },
)
</script>

<template>
  <button
    type="button"
    :title="label"
    :aria-pressed="active ?? pressed"
    class="flex size-9 items-center justify-center rounded-sm text-gray-500 hover:bg-white/60 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-accent"
    :class="active ? 'bg-white text-gray-900' : ''"
  >
    <span class="sr-only">{{ label }}</span>
    <AppIcon :name="icon" class="size-5" />
  </button>
</template>
