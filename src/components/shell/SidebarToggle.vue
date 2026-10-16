<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import IconButton from '@/components/ui/IconButton.vue'

const ui = useUiStore()
</script>

<template>
  <IconButton icon="menu" label="Menu" class="shrink-0" @click="ui.toggleSidebar()" />
</template>
