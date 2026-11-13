<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SectionSwitch from './SectionSwitch.vue'
import SettingsMenu from './SettingsMenu.vue'
import SidebarToggle from './SidebarToggle.vue'

const ui = useUiStore()
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-x-3 px-2">
    <SectionSwitch />
    <SidebarToggle />
    <!-- Centered in the space between the section switch and the actions. -->
    <h1 class="min-w-0 flex-1 truncate text-center font-display text-lg font-bold text-gray-900">
      Tasks
    </h1>
    <div class="flex shrink-0 items-center gap-x-2">
      <IconButton icon="search" label="Search (Ctrl+K)" @click="ui.searchOpen = true" />
      <SettingsMenu />
      <button
        type="button"
        class="btn btn-primary h-9 rounded-full pr-4 pl-3"
        @click="ui.openCreate({ kind: 'task' })"
      >
        <AppIcon name="plus" class="-ml-0.5 size-5" />
        New task
      </button>
    </div>
  </header>
</template>
