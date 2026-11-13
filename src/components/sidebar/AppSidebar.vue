<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { useCalendarRoute } from '@/composables/useCalendarRoute'
import { stepLabel } from '@/lib/format'
import { useAuthStore } from '@/stores/auth'
import { useBirthdaysStore } from '@/stores/birthdays'
import { useCalendarsStore } from '@/stores/calendars'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import CollectionList from './CollectionList.vue'
import MiniCalendar from './MiniCalendar.vue'

const route = useRoute()
const ui = useUiStore()
const auth = useAuthStore()
const calendars = useCalendarsStore()
const birthdays = useBirthdaysStore()
const nav = useCalendarRoute()

/** Calendar / Tasks: the active one is a pill, like the view switcher. */
const tabClass = (active: boolean) =>
  active
    ? 'flex h-full items-center justify-center gap-x-2 rounded-full bg-pill px-3 text-sm font-semibold text-on-color'
    : 'flex h-full items-center justify-center gap-x-2 rounded-full px-3 text-sm font-medium text-gray-600 transition-colors duration-150 hover:text-gray-900'

/** "week", "day", "month"… for the prev / next labels. */
const unit = computed(() => stepLabel(ui.view, ui.customDays))

/** Days of the grid views shaded in the mini calendar (month / agenda: just the date). */
const bandRange = computed(() =>
  ui.view === 'day' || ui.view === 'week' || ui.view === 'work-week' || ui.view === 'custom'
    ? ui.selectedRange
    : null,
)

/** Days dragged in the mini calendar: the calendar shows exactly those. */
function pickRange(start: Date, days: number) {
  void nav.goCustom(start, days)
}

function pickDate(d: Date) {
  if (route.name === 'calendar') void nav.setDate(d)
  else void nav.go('day', d)
}
</script>

<template>
  <aside id="sidebar" class="flex w-64 shrink-0 flex-col">
    <nav class="flex h-14 shrink-0 items-center px-3" aria-label="Sections">
      <div class="grid h-9 w-full grid-cols-2">
        <RouterLink
          :to="route.name === 'calendar' ? route.fullPath : `/${ui.view}`"
          :aria-current="route.name === 'calendar' ? 'page' : undefined"
          :class="tabClass(route.name === 'calendar')"
        >
          <AppIcon name="nav-calendar" class="size-5 shrink-0" />
          Calendar
        </RouterLink>
        <RouterLink
          to="/tasks"
          :aria-current="route.name === 'tasks' ? 'page' : undefined"
          :class="tabClass(route.name === 'tasks')"
        >
          <AppIcon name="nav-tasks" class="size-5 shrink-0" />
          Tasks
        </RouterLink>
      </div>
    </nav>

    <div class="flex-1 overflow-y-auto px-2 pb-4">
      <MiniCalendar
        v-if="route.name === 'calendar'"
        :selected="ui.currentDate"
        :week-start="ui.weekStart"
        :range="bandRange"
        @select="pickDate"
        @select-range="pickRange"
      />

      <!-- Prev / Today / next of the calendar view. -->
      <div
        v-if="route.name === 'calendar'"
        class="mx-1 mt-1.5 flex h-8 items-center"
        data-testid="date-nav"
      >
        <button
          type="button"
          class="flex h-full w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors duration-150 hover:bg-white/60 hover:text-gray-900"
          :title="`Previous ${unit} (←)`"
          @click="nav.prev()"
        >
          <span class="sr-only">Previous {{ unit }}</span>
          <AppIcon name="chevron-left" class="size-4" stroke-width="2" />
        </button>
        <button
          type="button"
          class="h-full flex-1 rounded-full text-[13px] font-semibold text-gray-900 transition-colors duration-150 hover:bg-white/60"
          title="Today (T)"
          @click="nav.today()"
        >
          Today
        </button>
        <button
          type="button"
          class="flex h-full w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors duration-150 hover:bg-white/60 hover:text-gray-900"
          :title="`Next ${unit} (→)`"
          @click="nav.next()"
        >
          <span class="sr-only">Next {{ unit }}</span>
          <AppIcon name="chevron-right" class="size-4" stroke-width="2" />
        </button>
      </div>

      <CollectionList
        v-if="route.name === 'calendar'"
        title="Calendars"
        :collections="
          birthdays.collection
            ? [...calendars.calendars, birthdays.collection]
            : calendars.calendars
        "
        :is-visible="calendars.isVisible"
        :loading="calendars.status === 'loading'"
        @toggle="calendars.setVisible"
      />
      <CollectionList
        title="Tasks"
        :collections="calendars.taskLists"
        :is-visible="calendars.isVisible"
        :loading="calendars.status === 'loading'"
        @toggle="calendars.setVisible"
      />
      <p v-if="calendars.status === 'error'" class="mt-4 px-2 text-xs text-red-600">
        Could not load calendars: {{ calendars.error }}
      </p>
    </div>

    <div class="flex shrink-0 items-center px-3 py-3">
      <p
        class="font-signature text-[30px] leading-none whitespace-nowrap text-gray-500"
        :title="`${auth.username} · ${auth.serverUrl}`"
      >
        Mile's Calendar
      </p>
    </div>
  </aside>
</template>
