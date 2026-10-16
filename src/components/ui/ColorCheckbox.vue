<script setup lang="ts">
/** The mockup's square checkbox that fills with the collection color when checked. */
defineProps<{ color: string; modelValue: boolean; label?: string; round?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <span class="grid size-4 shrink-0 place-items-center" :style="{ '--cb-color': color }">
    <input
      type="checkbox"
      :checked="modelValue"
      :aria-label="label"
      class="peer col-start-1 row-start-1 size-4 cursor-pointer appearance-none bg-white checked:bg-(--cb-color) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--cb-color)"
      :class="round ? 'rounded-full bg-(--cb-color)/20' : 'rounded-sm'"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <svg
      class="pointer-events-none col-start-1 row-start-1 hidden size-3.5 text-white peer-checked:block"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 14 14"
      aria-hidden="true"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5 5.75 10.25 11 4" />
    </svg>
  </span>
</template>
