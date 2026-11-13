<script setup lang="ts">
/** A quiet empty state: a line icon in a soft circle, a title, a hint and an optional action. */
import AppIcon from './AppIcon.vue'

defineProps<{ icon: string; title: string; text?: string }>()
</script>

<template>
  <div class="flex flex-col items-center px-4 py-6 text-center" data-testid="empty-state">
    <span class="grid size-11 place-items-center rounded-full bg-gray-100 text-gray-400">
      <AppIcon :name="icon" class="size-5" />
    </span>
    <p class="mt-2.5 text-[13px] font-semibold text-gray-700">{{ title }}</p>
    <p v-if="text" class="mt-0.5 max-w-60 text-xs text-gray-400">{{ text }}</p>
    <div v-if="$slots.default" class="mt-3"><slot /></div>
  </div>
</template>
