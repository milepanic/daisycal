<script setup lang="ts">
/** 24-hour time picker (HH:MM) in 15-minute steps; an off-grid value is kept as an extra option. */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ modelValue: string; stepMinutes?: number; label?: string; id?: string }>(),
  {
    stepMinutes: 15,
  },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const options = computed(() => {
  const out: string[] = []
  for (let m = 0; m < 24 * 60; m += props.stepMinutes) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  if (props.modelValue && !out.includes(props.modelValue)) out.push(props.modelValue)
  return out.sort()
})
</script>

<template>
  <select
    :id="id"
    :value="modelValue"
    :aria-label="label"
    class="cursor-pointer appearance-none rounded-lg bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-900 tabular-nums hover:bg-gray-200 focus:outline-2 focus:outline-accent"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="t in options" :key="t" :value="t">{{ t }}</option>
  </select>
</template>
