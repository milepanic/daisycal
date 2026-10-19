<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

import { useCalendarRoute } from '@/composables/useCalendarRoute'
import { useAuthStore } from '@/stores/auth'
import { useCalendarsStore } from '@/stores/calendars'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import CollectionList from './CollectionList.vue'
import MiniCalendar from './MiniCalendar.vue'

const route = useRoute()
const ui = useUiStore()
const auth = useAuthStore()
const calendars = useCalendarsStore()
const nav = useCalendarRoute()

const tabClass = (active: boolean) =>
  active
    ? 'flex items-center justify-center gap-x-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-900'
    : 'flex items-center justify-center gap-x-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white/60 hover:text-gray-900'

function pickDate(d: Date) {
  if (route.name === 'calendar') void nav.setDate(d)
  else void nav.go('day', d)
}
</script>

<template>
  <aside id="sidebar" class="flex w-64 shrink-0 flex-col">
    <nav class="grid h-14 shrink-0 grid-cols-2 items-center gap-x-1 px-2" aria-label="Sections">
      <RouterLink
        :to="route.name === 'calendar' ? route.fullPath : `/${ui.view}`"
        :aria-current="route.name === 'calendar' ? 'page' : undefined"
        :class="tabClass(route.name === 'calendar')"
      >
        <AppIcon name="calendar" class="size-5 shrink-0" />
        Calendar
      </RouterLink>
      <RouterLink
        to="/tasks"
        :aria-current="route.name === 'tasks' ? 'page' : undefined"
        :class="tabClass(route.name === 'tasks')"
      >
        <AppIcon name="tasks" class="size-5 shrink-0" />
        Tasks
      </RouterLink>
    </nav>

    <div class="flex-1 overflow-y-auto px-2 pb-4">
      <MiniCalendar :selected="ui.currentDate" :week-start="ui.weekStart" @select="pickDate" />

      <CollectionList
        title="My calendars"
        :collections="calendars.calendars"
        :is-visible="calendars.isVisible"
        :loading="calendars.status === 'loading'"
        @toggle="calendars.setVisible"
      />
      <CollectionList
        title="Task lists"
        :collections="calendars.taskLists"
        :is-visible="calendars.isVisible"
        :loading="calendars.status === 'loading'"
        @toggle="calendars.setVisible"
      />
      <p v-if="calendars.status === 'error'" class="mt-4 px-2 text-xs text-red-600">
        Could not load calendars: {{ calendars.error }}
      </p>
    </div>

    <div class="flex h-12 shrink-0 items-center gap-x-2 px-3 text-xs text-gray-500">
      <span class="truncate" :title="auth.serverUrl">{{ auth.username }}</span>
    </div>
  </aside>
</template>
