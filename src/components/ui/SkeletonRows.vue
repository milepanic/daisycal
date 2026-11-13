<script setup lang="ts">
/** Placeholder task rows (round checkbox and two lines) while a list loads. */
withDefaults(defineProps<{ rows?: number }>(), { rows: 3 })
</script>

<template>
  <ul class="space-y-1 px-2 py-1" aria-hidden="true" data-testid="skeleton-rows">
    <li v-for="i in rows" :key="i" class="flex items-start gap-x-3 py-1.5">
      <span class="skeleton mt-0.5 size-4 shrink-0 rounded-full"></span>
      <span class="min-w-0 flex-1 space-y-1.5">
        <span
          class="skeleton block h-3 rounded-full"
          :style="{ width: `${[72, 54, 64][(i - 1) % 3]}%` }"
        ></span>
        <span class="skeleton block h-2.5 w-24 rounded-full"></span>
      </span>
    </li>
  </ul>
  <span class="sr-only" role="status">Loading…</span>
</template>
