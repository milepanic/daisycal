<script setup lang="ts">
import { computed } from 'vue'

import { useCalendarRoute } from '@/composables/useCalendarRoute'
import { stepLabel, viewTitle } from '@/lib/format'
import { useSyncStore } from '@/stores/sync'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SidebarToggle from './SidebarToggle.vue'
import ViewSwitcher from './ViewSwitcher.vue'

const ui = useUiStore()
const sync = useSyncStore()
const nav = useCalendarRoute()

const title = computed(() => viewTitle(ui.view, ui.currentDate, ui.visibleRange))
const unit = computed(() => stepLabel(ui.view))
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-x-3">
    <SidebarToggle />

    <div class="flex min-w-0 items-center gap-x-2">
      <div class="flex h-9 items-center rounded-lg bg-white/60 p-0.5">
        <button
          type="button"
          class="flex h-full w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-white hover:text-gray-900"
          @click="nav.prev()"
        >
          <span class="sr-only">Previous {{ unit }}</span>
          <AppIcon name="chevron-left" class="size-4" stroke-width="2" />
        </button>
        <button
          type="button"
          class="h-full rounded-lg px-2.5 text-sm font-semibold text-gray-900 hover:bg-white"
          @click="nav.today()"
        >
          Today
        </button>
        <button
          type="button"
          class="flex h-full w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-white hover:text-gray-900"
          @click="nav.next()"
        >
          <span class="sr-only">Next {{ unit }}</span>
          <AppIcon name="chevron-right" class="size-4" stroke-width="2" />
        </button>
      </div>
      <h1 class="ml-1 truncate text-lg font-semibold text-gray-900">{{ title }}</h1>
    </div>

    <div class="ml-auto flex shrink-0 items-center gap-x-2">
      <IconButton
        icon="refresh"
        :label="sync.lastError ? `Sync failed: ${sync.lastError}` : 'Refresh'"
        :class="sync.lastError ? 'text-red-600' : ''"
        @click="sync.syncNow()"
      />
      <ViewSwitcher :view="ui.view" @change="nav.setView" />
      <IconButton
        icon="tasks"
        label="Show tasks panel"
        :active="ui.tasksPanelOpen"
        @click="ui.toggleTasksPanel()"
      />
      <button
        type="button"
        class="inline-flex h-9 items-center gap-x-1.5 rounded-lg bg-gray-900 px-3 text-sm font-semibold text-white hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        @click="ui.openCreate({ kind: 'event' })"
      >
        <AppIcon name="plus" class="-ml-0.5 size-5" />
        Create
      </button>
    </div>
  </header>
</template>
