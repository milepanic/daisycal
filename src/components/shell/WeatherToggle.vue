<script setup lang="ts">
/** Turns the forecast in the day headers on (asks for the location once) or off. */
import { computed } from 'vue'

import { useNotificationsStore } from '@/stores/notifications'
import { useWeatherStore } from '@/stores/weather'
import IconButton from '@/components/ui/IconButton.vue'

const weather = useWeatherStore()
const notifications = useNotificationsStore()

const label = computed(() =>
  weather.status === 'locating'
    ? 'Getting your location…'
    : weather.enabled
      ? 'Hide weather'
      : 'Show weather (asks for your location)',
)

async function toggle() {
  if (weather.enabled) {
    weather.disable()
    return
  }
  await weather.enable()
  if (weather.error) notifications.push(`Weather: ${weather.error}`, { kind: 'error' })
}
</script>

<template>
  <IconButton
    icon="cloud"
    :label="label"
    :active="weather.enabled"
    data-testid="weather-toggle"
    @click="toggle"
  />
</template>
