<script setup lang="ts">
/** Shows / hides the left sidebar; the icon shows the state (like the tasks panel toggle). */
import { useUiStore } from '@/stores/ui'
import IconButton from '@/components/ui/IconButton.vue'

const ui = useUiStore()
</script>

<template>
  <IconButton
    :icon="ui.sidebarOpen ? 'panel-left-open' : 'panel-left'"
    label="Menu"
    :pressed="ui.sidebarOpen"
    class="shrink-0"
    @click="ui.toggleSidebar()"
  />
</template>
