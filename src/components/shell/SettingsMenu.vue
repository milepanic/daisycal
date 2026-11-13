<script setup lang="ts">
/**
 * Settings (gear in the header): theme, event style, weather, first day of the week and
 * completed tasks, in one card instead of a row of header icons.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type { WeekStart } from '@/lib/dates'
import { switchTheme } from '@/lib/themeSwitch'
import { formatTime } from '@/lib/format'
import { useNotificationsStore } from '@/stores/notifications'
import { useSyncStore } from '@/stores/sync'
import { type ChipStyle, type Theme, useUiStore } from '@/stores/ui'
import { useWeatherStore } from '@/stores/weather'
import ColorSelect from '@/components/ui/ColorSelect.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useCalendarsStore } from '@/stores/calendars'

const ui = useUiStore()
const weather = useWeatherStore()
const notifications = useNotificationsStore()
const calendars = useCalendarsStore()
const sync = useSyncStore()

/** Refresh (moved here from the header): checks the server for changes right away. */
const syncing = ref(false)
async function refresh() {
  if (syncing.value) return
  syncing.value = true
  try {
    await sync.syncNow()
  } finally {
    syncing.value = false
  }
}
const syncNote = computed(() =>
  sync.lastError
    ? `Sync failed: ${sync.lastError}`
    : sync.lastSyncAt
      ? `Last checked at ${formatTime(sync.lastSyncAt)}`
      : 'Checks for changes every few seconds',
)

/** Pickers for where new events / tasks go; '' is "the first one". */
const calendarOptions = computed(() => [
  { value: '', label: 'First in the list' },
  ...calendars.calendars.map((c) => ({
    value: c.url,
    label: c.displayName,
    color: calendars.colorFor(c.url),
  })),
])
const listOptions = computed(() => [
  { value: '', label: 'First in the list' },
  ...calendars.taskLists.map((c) => ({
    value: c.url,
    label: c.displayName,
    color: calendars.colorFor(c.url),
  })),
])
const defaultCalendar = computed<string | number>({
  get: () => ui.defaultCalendar ?? '',
  set: (v) => (ui.defaultCalendar = v ? String(v) : null),
})
const defaultTaskList = computed<string | number>({
  get: () => ui.defaultTaskList ?? '',
  set: (v) => (ui.defaultTaskList = v ? String(v) : null),
})

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
const STYLES: { value: ChipStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'tinted', label: 'Tinted' },
]
const WEEK_STARTS: { value: WeekStart; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 0, label: 'Sunday' },
  { value: 6, label: 'Saturday' },
]

function setTheme(theme: Theme, e: MouseEvent) {
  if (theme === ui.theme) return
  switchTheme(() => (ui.theme = theme), e.currentTarget as HTMLElement)
}

const weatherNote = computed(() =>
  weather.status === 'locating'
    ? 'Getting your location…'
    : weather.enabled
      ? 'Forecast above the day names'
      : 'Asks for your location (about 10 km)',
)
async function toggleWeather() {
  if (weather.enabled) {
    weather.disable()
    return
  }
  await weather.enable()
  if (weather.error) notifications.push(`Weather: ${weather.error}`, { kind: 'error' })
}

function onDocMouseDown(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    open.value = false
  }
}
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onDocKeydown, true)
  } else {
    document.removeEventListener('mousedown', onDocMouseDown)
    document.removeEventListener('keydown', onDocKeydown, true)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onDocKeydown, true)
})

const segment = (active: boolean) =>
  active
    ? 'rounded-full bg-pill px-3 py-1 font-semibold text-on-color'
    : 'rounded-full px-3 py-1 font-medium text-gray-600 hover:text-gray-900'
</script>

<template>
  <div ref="root" class="relative">
    <IconButton
      icon="settings"
      :label="sync.lastError ? `Settings · sync failed: ${sync.lastError}` : 'Settings'"
      :pressed="open"
      :class="sync.lastError ? 'text-red-600' : ''"
      data-testid="settings-button"
      @click="open = !open"
    />
    <Transition name="dropdown">
      <div
        v-if="open"
        role="dialog"
        aria-label="Settings"
        class="absolute top-full right-0 z-50 mt-1.5 max-h-[calc(100vh-6rem)] w-80 origin-top-right overflow-y-auto rounded-xl bg-white p-4 text-[13px] shadow-xl ring-1 ring-gray-200 max-md:fixed max-md:inset-x-2 max-md:top-24 max-md:w-auto"
        data-testid="settings-menu"
      >
        <div class="flex items-center justify-between gap-x-3">
          <h2 class="font-display text-base font-bold text-gray-900">Settings</h2>
        </div>

        <!-- Sync -->
        <div class="mt-3 flex items-center justify-between gap-x-3 rounded-lg bg-gray-50 px-3 py-2">
          <span class="min-w-0">
            <span class="block font-medium text-gray-900">Sync</span>
            <span
              class="block truncate text-xs"
              :class="sync.lastError ? 'text-red-600' : 'text-gray-500'"
              :title="syncNote"
              >{{ syncNote }}</span
            >
          </span>
          <button
            type="button"
            class="btn btn-sm btn-secondary"
            :disabled="syncing"
            data-testid="setting-refresh"
            @click="refresh"
          >
            <AppIcon name="refresh" class="size-3.5" :class="syncing ? 'animate-spin' : ''" />
            {{ syncing ? 'Refreshing…' : 'Refresh now' }}
          </button>
        </div>

        <dl class="mt-3 space-y-4">
          <div>
            <dt class="mb-1.5 text-xs font-semibold text-gray-500">Theme</dt>
            <dd class="inline-flex rounded-full ring-1 ring-gray-300" data-testid="setting-theme">
              <button
                v-for="t in THEMES"
                :key="t.value"
                type="button"
                :class="segment(ui.theme === t.value)"
                :aria-pressed="ui.theme === t.value"
                @click="setTheme(t.value, $event)"
              >
                {{ t.label }}
              </button>
            </dd>
          </div>

          <div>
            <dt class="mb-1.5 text-xs font-semibold text-gray-500">Event style</dt>
            <dd class="inline-flex rounded-full ring-1 ring-gray-300" data-testid="setting-style">
              <button
                v-for="s in STYLES"
                :key="s.value"
                type="button"
                :class="segment(ui.chipStyle === s.value)"
                :aria-pressed="ui.chipStyle === s.value"
                @click="ui.chipStyle = s.value"
              >
                {{ s.label }}
              </button>
            </dd>
          </div>

          <div>
            <dt class="mb-1.5 text-xs font-semibold text-gray-500">Week starts on</dt>
            <dd class="inline-flex rounded-full ring-1 ring-gray-300" data-testid="setting-week">
              <button
                v-for="w in WEEK_STARTS"
                :key="w.value"
                type="button"
                :class="segment(ui.weekStart === w.value)"
                :aria-pressed="ui.weekStart === w.value"
                @click="ui.weekStart = w.value"
              >
                {{ w.label }}
              </button>
            </dd>
          </div>

          <div class="space-y-3 border-t border-gray-100 pt-4">
            <div>
              <dt class="mb-1.5 text-xs font-semibold text-gray-500">New events in</dt>
              <dd>
                <ColorSelect
                  id="setting-default-calendar"
                  v-model="defaultCalendar"
                  :options="calendarOptions"
                  label="Default calendar"
                />
              </dd>
            </div>
            <div>
              <dt class="mb-1.5 text-xs font-semibold text-gray-500">New tasks in</dt>
              <dd>
                <ColorSelect
                  id="setting-default-list"
                  v-model="defaultTaskList"
                  :options="listOptions"
                  label="Default task list"
                />
              </dd>
            </div>
          </div>

          <div class="space-y-3 border-t border-gray-100 pt-4">
            <label class="flex cursor-pointer items-center justify-between gap-x-4">
              <span>
                <span class="block font-medium text-gray-900">Weather</span>
                <span class="block text-xs text-gray-500">{{ weatherNote }}</span>
              </span>
              <button
                type="button"
                role="switch"
                :aria-checked="weather.enabled"
                class="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150"
                :class="weather.enabled ? 'bg-pill' : 'bg-gray-300'"
                data-testid="setting-weather"
                @click="toggleWeather"
              >
                <span class="sr-only">Weather</span>
                <span
                  class="absolute top-0.5 left-0.5 size-4 rounded-full bg-on-color shadow-sm transition-transform duration-150"
                  :class="weather.enabled ? 'translate-x-4' : ''"
                ></span>
              </button>
            </label>
            <label class="flex cursor-pointer items-center justify-between gap-x-4">
              <span>
                <span class="block font-medium text-gray-900">Mini calendar dots</span>
                <span class="block text-xs text-gray-500"
                  >Calendars with events under each day</span
                >
              </span>
              <button
                type="button"
                role="switch"
                :aria-checked="ui.miniDots"
                class="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150"
                :class="ui.miniDots ? 'bg-pill' : 'bg-gray-300'"
                data-testid="setting-dots"
                @click="ui.miniDots = !ui.miniDots"
              >
                <span class="sr-only">Mini calendar dots</span>
                <span
                  class="absolute top-0.5 left-0.5 size-4 rounded-full bg-on-color shadow-sm transition-transform duration-150"
                  :class="ui.miniDots ? 'translate-x-4' : ''"
                ></span>
              </button>
            </label>
            <label class="flex cursor-pointer items-center justify-between gap-x-4">
              <span>
                <span class="block font-medium text-gray-900">Completed tasks</span>
                <span class="block text-xs text-gray-500">Show them in the task lists</span>
              </span>
              <button
                type="button"
                role="switch"
                :aria-checked="ui.showCompletedTasks"
                class="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150"
                :class="ui.showCompletedTasks ? 'bg-pill' : 'bg-gray-300'"
                data-testid="setting-completed"
                @click="ui.showCompletedTasks = !ui.showCompletedTasks"
              >
                <span class="sr-only">Show completed tasks</span>
                <span
                  class="absolute top-0.5 left-0.5 size-4 rounded-full bg-on-color shadow-sm transition-transform duration-150"
                  :class="ui.showCompletedTasks ? 'translate-x-4' : ''"
                ></span>
              </button>
            </label>
          </div>
        </dl>
      </div>
    </Transition>
  </div>
</template>
