<script setup lang="ts">
import { useSyncStore } from '@/stores/sync'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SidebarToggle from './SidebarToggle.vue'

const ui = useUiStore()
const sync = useSyncStore()
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-x-3 px-2">
    <SidebarToggle />
    <h1 class="truncate text-lg font-semibold text-gray-900">Tasks</h1>
    <div class="ml-auto flex shrink-0 items-center gap-x-2">
      <IconButton
        icon="refresh"
        :label="sync.lastError ? `Sync failed: ${sync.lastError}` : 'Refresh'"
        :class="sync.lastError ? 'text-red-600' : ''"
        @click="sync.syncNow()"
      />
      <label
        class="flex h-9 cursor-pointer items-center gap-x-2 rounded-lg px-2 text-sm text-gray-600 hover:bg-white/60"
      >
        <input
          v-model="ui.showCompletedTasks"
          type="checkbox"
          class="size-4 rounded-sm accent-gray-900"
        />
        Show completed
      </label>
      <button
        type="button"
        class="inline-flex h-9 items-center gap-x-1.5 rounded-lg bg-gray-900 px-3 text-sm font-semibold text-white hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        @click="ui.openCreate({ kind: 'task' })"
      >
        <AppIcon name="plus" class="-ml-0.5 size-5" />
        New task
      </button>
    </div>
  </header>
</template>
