<script setup lang="ts">
import { computed } from 'vue'

import { useCalendarRoute } from '@/composables/useCalendarRoute'
import { type CalendarView, customLabel } from '@/lib/dates'
import { viewTitle } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SectionSwitch from './SectionSwitch.vue'
import SettingsMenu from './SettingsMenu.vue'
import SidebarToggle from './SidebarToggle.vue'
import ViewSwitcher from './ViewSwitcher.vue'

const ui = useUiStore()
const nav = useCalendarRoute()

const title = computed(() => viewTitle(ui.view, ui.currentDate, ui.selectedRange))
</script>

<template>
  <!-- Wide: one row (switch, sidebar, centered title, actions). Narrow: two rows: sidebar,
       title and the main actions on top; section switch, prev / Today / next and the view
       below (the sidebar with its date nav is a drawer there). -->
  <header
    class="flex shrink-0 flex-wrap items-center gap-2 py-2 md:h-14 md:flex-nowrap md:gap-x-3 md:py-0"
  >
    <SectionSwitch class="order-3 md:order-none" />
    <SidebarToggle class="order-1 md:order-none" />
    <h1
      class="order-1 min-w-0 flex-1 truncate font-display text-base font-bold text-gray-900 md:order-none md:text-center md:text-lg"
    >
      {{ title }}
    </h1>

    <div class="order-1 flex shrink-0 items-center gap-x-1 md:order-none md:gap-x-2">
      <IconButton icon="search" label="Search (Ctrl+K)" @click="ui.searchOpen = true" />
      <SettingsMenu />
      <IconButton
        :icon="ui.tasksPanelOpen ? 'panel-right-open' : 'panel-right'"
        label="Show tasks panel"
        :pressed="ui.tasksPanelOpen"
        class="hidden md:flex"
        @click="ui.toggleTasksPanel()"
      />
      <ViewSwitcher
        :view="ui.view"
        :custom-days="ui.customDays"
        class="hidden md:flex"
        @change="nav.setView"
      />
      <button
        type="button"
        class="inline-flex h-9 items-center gap-x-1.5 rounded-full bg-accent px-2.5 text-sm font-semibold text-on-color transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:pr-4 sm:pl-3"
        @click="ui.openCreate({ kind: 'event' })"
      >
        <AppIcon name="plus" class="size-5" stroke-width="2.25" />
        <span class="hidden sm:inline">Create</span>
        <span class="sr-only sm:hidden">Create</span>
      </button>
    </div>

    <!-- Narrow only: second row. -->
    <div class="order-2 basis-full md:hidden" aria-hidden="true"></div>
    <div class="order-3 flex h-9 items-center rounded-full ring-1 ring-gray-300 md:hidden">
      <button
        type="button"
        class="flex h-full w-9 items-center justify-center rounded-full text-gray-600 hover:bg-white/60"
        @click="nav.prev()"
      >
        <span class="sr-only">Previous</span>
        <AppIcon name="arrow-left" class="size-4" stroke-width="1.75" />
      </button>
      <button
        type="button"
        class="h-full rounded-full px-2 text-[13px] font-medium text-gray-900 hover:bg-white/60"
        @click="nav.today()"
      >
        Today
      </button>
      <button
        type="button"
        class="flex h-full w-9 items-center justify-center rounded-full text-gray-600 hover:bg-white/60"
        @click="nav.next()"
      >
        <span class="sr-only">Next</span>
        <AppIcon name="arrow-right" class="size-4" stroke-width="1.75" />
      </button>
    </div>
    <div class="relative order-3 ml-auto md:hidden">
      <label for="view-select" class="sr-only">Calendar view</label>
      <select
        id="view-select"
        :value="ui.view"
        class="h-9 cursor-pointer appearance-none rounded-full py-1.5 pr-8 pl-3.5 text-sm font-medium text-gray-900 ring-1 ring-gray-300"
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
        class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-gray-500"
      />
    </div>
  </header>
</template>
