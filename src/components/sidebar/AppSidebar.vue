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
import AppLogo from '@/components/brand/AppLogo.vue'
import CollectionList from './CollectionList.vue'
import MiniCalendar from './MiniCalendar.vue'

const route = useRoute()
const ui = useUiStore()
const auth = useAuthStore()
const calendars = useCalendarsStore()
const birthdays = useBirthdaysStore()
const nav = useCalendarRoute()

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
    <!-- Logo (the Calendar / Tasks switch lives in the page header). -->
    <div class="flex h-14 shrink-0 items-center px-3">
      <RouterLink :to="`/${ui.view}`" class="rounded-sm" title="DaisyCal">
        <AppLogo />
      </RouterLink>
    </div>

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
          <AppIcon name="arrow-left" class="size-4" stroke-width="1.75" />
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
          <AppIcon name="arrow-right" class="size-4" stroke-width="1.75" />
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
