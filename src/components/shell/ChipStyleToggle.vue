<script setup lang="ts">
/**
 * Switches how events and tasks look in the grids: solid calendar color, or a muted tint with
 * a colored border and text. The icon shows the current style (like the theme toggle).
 */
import { computed } from 'vue'

import { useUiStore } from '@/stores/ui'
import IconButton from '@/components/ui/IconButton.vue'

const ui = useUiStore()
const label = computed(() =>
  ui.chipStyle === 'tinted'
    ? 'Event style: Tinted (switch to Solid)'
    : 'Event style: Solid (switch to Tinted)',
)
</script>

<template>
  <IconButton
    :icon="ui.chipStyle === 'tinted' ? 'chips-tinted' : 'chips-solid'"
    :label="label"
    :pressed="ui.chipStyle === 'tinted'"
    data-testid="chip-style-toggle"
    @click="ui.chipStyle = ui.chipStyle === 'tinted' ? 'solid' : 'tinted'"
  />
</template>
