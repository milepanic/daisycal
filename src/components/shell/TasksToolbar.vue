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
  <!-- Narrow: the section switch moves to a second row. -->
  <header
    class="flex shrink-0 flex-wrap items-center gap-2 px-2 py-2 md:h-14 md:flex-nowrap md:gap-x-3 md:py-0"
  >
    <SectionSwitch class="order-3 md:order-none" />
    <SidebarToggle class="order-1 md:order-none" />
    <!-- Centered in the space between the section switch and the actions. -->
    <h1
      class="order-1 min-w-0 flex-1 truncate font-display text-lg font-bold text-gray-900 md:order-none md:text-center"
    >
      Tasks
    </h1>
    <div class="order-1 flex shrink-0 items-center gap-x-1 md:order-none md:gap-x-2">
      <IconButton icon="search" label="Search (Ctrl+K)" @click="ui.searchOpen = true" />
      <SettingsMenu />
      <button
        type="button"
        class="btn btn-primary h-9 rounded-full pr-4 pl-3"
        @click="ui.openCreate({ kind: 'task' })"
      >
        <AppIcon name="plus" class="-ml-0.5 size-5" />
        <span class="hidden sm:inline">New task</span>
        <span class="sr-only sm:hidden">New task</span>
      </button>
    </div>
    <div class="order-2 basis-full md:hidden" aria-hidden="true"></div>
  </header>
</template>
