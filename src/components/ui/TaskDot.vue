<script setup lang="ts">
/**
 * Non-interactive look-alike of the round task checkbox (ColorCheckbox `round`), for places
 * where the task sits inside a button (calendar chips, agenda rows, drag previews).
 */
withDefaults(defineProps<{ color: string; checked?: boolean; size?: 'sm' | 'md' }>(), {
  checked: false,
  size: 'md',
})
</script>

<template>
  <span
    class="grid shrink-0 place-items-center rounded-full border-[1.5px]"
    :class="[
      size === 'sm' ? 'size-2.5' : 'size-3',
      checked ? 'border-(--cb-color) bg-(--cb-color)' : 'border-(--cb-color)/50 bg-(--cb-color)/5',
    ]"
    :style="{ '--cb-color': color }"
    aria-hidden="true"
    data-testid="task-dot"
  >
    <svg
      v-if="checked"
      class="text-white"
      :class="size === 'sm' ? 'size-2' : 'size-2.5'"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 14 14"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5 5.75 10.25 11 4" />
    </svg>
  </span>
</template>
