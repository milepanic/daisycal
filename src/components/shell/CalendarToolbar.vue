<script setup lang="ts">
import { computed } from 'vue'

import { useCalendarRoute } from '@/composables/useCalendarRoute'
import { type CalendarView, customLabel } from '@/lib/dates'
import { viewTitle } from '@/lib/format'
import { useSyncStore } from '@/stores/sync'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SectionSwitch from './SectionSwitch.vue'
import ChipStyleToggle from './ChipStyleToggle.vue'
import ThemeToggle from './ThemeToggle.vue'
import WeatherToggle from './WeatherToggle.vue'
import SidebarToggle from './SidebarToggle.vue'
import ViewSwitcher from './ViewSwitcher.vue'

const ui = useUiStore()
const sync = useSyncStore()
const nav = useCalendarRoute()

const title = computed(() => viewTitle(ui.view, ui.currentDate, ui.selectedRange))
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-x-3">
    <SectionSwitch />
    <SidebarToggle />
    <!-- Centered in the space between the section switch and the actions. -->
    <h1
      class="min-w-0 flex-1 truncate text-center font-display text-base font-bold text-gray-900 sm:text-lg"
    >
      {{ title }}
    </h1>

    <div class="flex shrink-0 items-center gap-x-2">
      <IconButton icon="search" label="Search (Ctrl+K)" @click="ui.searchOpen = true" />
      <WeatherToggle />
      <ThemeToggle />
      <ChipStyleToggle />
      <IconButton
        icon="refresh"
        :label="sync.lastError ? `Sync failed: ${sync.lastError}` : 'Refresh'"
        :class="sync.lastError ? 'text-red-600' : ''"
        @click="sync.syncNow()"
      />
      <IconButton
        :icon="ui.tasksPanelOpen ? 'panel-right-open' : 'panel-right'"
        label="Show tasks panel"
        :pressed="ui.tasksPanelOpen"
        @click="ui.toggleTasksPanel()"
      />
      <ViewSwitcher
        :view="ui.view"
        :custom-days="ui.customDays"
        class="hidden md:flex"
        @change="nav.setView"
      />
      <div class="relative md:hidden">
        <label for="view-select" class="sr-only">Calendar view</label>
        <select
          id="view-select"
          :value="ui.view"
          class="h-9 cursor-pointer appearance-none rounded-sm bg-white/60 py-1.5 pr-7 pl-3 text-sm font-medium text-gray-900"
          @change="nav.setView(($event.target as HTMLSelectElement).value as CalendarView)"
        >
          <option value="agenda">Agenda</option>
          <option value="day">Day</option>
          <option value="work-week">Work week</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option v-if="ui.view === 'custom'" value="custom">
            {{ customLabel(ui.customDays) }}
          </option>
        </select>
        <AppIcon
          name="chevron-down"
          class="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-gray-500"
        />
      </div>
      <button
        type="button"
        class="inline-flex h-9 items-center gap-x-1.5 rounded-full bg-accent pr-4 pl-3 text-sm font-semibold text-on-color shadow-[0_2px_10px_color-mix(in_srgb,var(--color-accent)_35%,transparent)] transition-[filter,box-shadow,transform] duration-150 hover:shadow-[0_4px_14px_color-mix(in_srgb,var(--color-accent)_45%,transparent)] hover:brightness-110 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        @click="ui.openCreate({ kind: 'event' })"
      >
        <AppIcon name="plus" class="size-5" stroke-width="2.25" />
        <span class="hidden sm:inline">Create</span>
        <span class="sr-only sm:hidden">Create</span>
      </button>
    </div>
  </header>
</template>
