/**
 * Weather in the day headers (Open-Meteo, free, no key). Off until turned on from the toolbar;
 * turning it on asks the browser for the location once. The forecast is cached for 3 hours.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { readJson, remove, writeJson } from '@/lib/storage'
import {
  type DayWeather,
  FORECAST_VERSION,
  forecastUrl,
  parseForecast,
  roundCoord,
} from '@/lib/weather'

const KEY = 'daisycal.weather'
const MAX_AGE_MS = 3 * 60 * 60_000

interface Saved {
  enabled: boolean
  lat?: number
  lon?: number
  fetchedAt?: number
  /** FORECAST_VERSION the days were parsed with; older caches are fetched again. */
  version?: number
  days?: Record<string, DayWeather>
}

export const useWeatherStore = defineStore('weather', () => {
  const saved = readJson<Saved>('local', KEY, { enabled: false })
  const enabled = ref(saved.enabled)
  const coords = ref<{ lat: number; lon: number } | null>(
    saved.lat != null && saved.lon != null ? { lat: saved.lat, lon: saved.lon } : null,
  )
  const days = ref<Record<string, DayWeather>>(saved.days ?? {})
  const fetchedAt = ref(saved.version === FORECAST_VERSION ? (saved.fetchedAt ?? 0) : 0)
  const status = ref<'idle' | 'locating' | 'loading' | 'error'>('idle')
  const error = ref<string | null>(null)

  function persist() {
    writeJson('local', KEY, {
      enabled: enabled.value,
      lat: coords.value?.lat,
      lon: coords.value?.lon,
      fetchedAt: fetchedAt.value,
      version: FORECAST_VERSION,
      days: days.value,
    } satisfies Saved)
  }

  function locate(): Promise<{ lat: number; lon: number }> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('This browser cannot share its location'))
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude) }),
        (err) =>
          reject(
            new Error(
              err.code === err.PERMISSION_DENIED
                ? 'Location access was denied'
                : 'Could not get the location',
            ),
          ),
        { maximumAge: 6 * 60 * 60_000, timeout: 15_000 },
      )
    })
  }

  async function fetchForecast(force = false) {
    if (!coords.value) return
    if (!force && Date.now() - fetchedAt.value < MAX_AGE_MS && Object.keys(days.value).length)
      return
    status.value = 'loading'
    try {
      const res = await fetch(forecastUrl(coords.value.lat, coords.value.lon))
      if (!res.ok) throw new Error(`Weather service answered ${res.status}`)
      days.value = parseForecast(await res.json())
      fetchedAt.value = Date.now()
      status.value = 'idle'
      error.value = null
      persist()
    } catch (err) {
      status.value = 'error'
      error.value = err instanceof Error ? err.message : 'Could not load the weather'
    }
  }

  /** Turns the forecast on: asks for the location (first time) and loads it. */
  async function enable() {
    enabled.value = true
    persist()
    if (!coords.value) {
      status.value = 'locating'
      try {
        coords.value = await locate()
        persist()
      } catch (err) {
        status.value = 'error'
        error.value = err instanceof Error ? err.message : 'Could not get the location'
        enabled.value = false
        persist()
        return
      }
    }
    await fetchForecast()
  }

  /** Turns it off and forgets the location and the forecast. */
  function disable() {
    enabled.value = false
    coords.value = null
    days.value = {}
    fetchedAt.value = 0
    status.value = 'idle'
    error.value = null
    remove('local', KEY)
  }

  /** On start: refresh a stale forecast when it is on. */
  function refresh() {
    if (enabled.value) void fetchForecast()
  }

  const forDay = computed(() => (key: string) => (enabled.value ? days.value[key] : undefined))

  return { enabled, coords, days, status, error, enable, disable, refresh, fetchForecast, forDay }
})
