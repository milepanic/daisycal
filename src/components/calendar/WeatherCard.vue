<script setup lang="ts">
/** Hover card on a day header's forecast: conditions, temperatures, rain, wind, UV, sun times. */
import { computed } from 'vue'

import { type DayWeather, describeWeather, uvLevel, weatherDetail } from '@/lib/weather'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = defineProps<{ weather: DayWeather }>()

const rows = computed(() => {
  const w = props.weather
  const out: { label: string; value: string }[] = []
  if (w.rainChance != null) out.push({ label: 'Chance of rain', value: `${w.rainChance}%` })
  if (w.precipitation != null)
    out.push({
      label: 'Precipitation',
      value: w.precipitation > 0 ? `${w.precipitation.toFixed(1)} mm` : 'None',
    })
  if (w.feelsMin != null && w.feelsMax != null)
    out.push({ label: 'Feels like', value: `${w.feelsMin}° / ${w.feelsMax}°` })
  if (w.wind != null)
    out.push({
      label: 'Wind',
      value: `${w.wind} km/h${w.gusts != null ? `, gusts ${w.gusts}` : ''}`,
    })
  if (w.uv != null) out.push({ label: 'UV index', value: `${Math.round(w.uv)} · ${uvLevel(w.uv)}` })
  if (w.sunrise && w.sunset)
    out.push({ label: 'Sunrise / sunset', value: `${w.sunrise} / ${w.sunset}` })
  return out
})
</script>

<template>
  <div
    class="w-56 rounded-xl bg-white p-3 text-left text-xs shadow-xl ring-1 ring-gray-200"
    role="tooltip"
    data-testid="weather-card"
  >
    <div class="flex items-center gap-x-2.5">
      <AppIcon
        :name="describeWeather(weather.code).icon"
        class="size-7 shrink-0 text-gray-500"
        :stroke-width="1.5"
      />
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-gray-900">
          {{ weatherDetail(weather.code) }}
        </p>
        <p class="text-gray-500 tabular-nums">
          Low {{ weather.min }}° · High
          <span class="font-medium text-gray-800">{{ weather.max }}°</span>
        </p>
      </div>
    </div>
    <dl v-if="rows.length" class="mt-2.5 space-y-1 border-t border-gray-100 pt-2.5">
      <div v-for="r in rows" :key="r.label" class="flex justify-between gap-x-3">
        <dt class="text-gray-500">{{ r.label }}</dt>
        <dd class="font-medium text-gray-800 tabular-nums">{{ r.value }}</dd>
      </div>
    </dl>
  </div>
</template>
