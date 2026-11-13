<script setup lang="ts">
/**
 * DaisyCal logo: a line-drawn daisy (eight petals around an accent-red heart) and the name in
 * the title font. The petals follow the text color, so it works in both themes.
 */
const PETALS = [0, 45, 90, 135, 180, 225, 270, 315]
</script>

<template>
  <span class="inline-flex items-center gap-x-2 text-gray-900">
    <svg viewBox="0 0 32 32" class="size-7 shrink-0" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.6">
        <ellipse
          v-for="a in PETALS"
          :key="a"
          cx="16"
          cy="7.6"
          rx="3.1"
          ry="5.6"
          :transform="`rotate(${a} 16 16)`"
        />
      </g>
      <circle cx="16" cy="16" r="4.4" class="fill-accent" />
    </svg>
    <span class="font-display text-xl font-bold tracking-tight">DaisyCal</span>
  </span>
</template>
