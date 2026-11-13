import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TimeGrid from '@/components/calendar/TimeGrid.vue'
import { eachDay } from '@/lib/dates'
import { describeWeather, forecastUrl, parseForecast } from '@/lib/weather'
import { useWeatherStore } from '../weather'

const FORECAST = {
  daily: {
    time: ['2026-10-12', '2026-10-13', '2026-10-14'],
    weather_code: [0, 61, null],
    temperature_2m_max: [18.4, 12.6, 10],
    temperature_2m_min: [7.5, 6.2, 3],
    precipitation_probability_max: [null, 85, 10],
    precipitation_sum: [0, 4.24, 0],
    apparent_temperature_max: [null, 10.4, 8],
    apparent_temperature_min: [null, 3.6, 1],
    wind_speed_10m_max: [null, 18.2, 5],
    wind_gusts_10m_max: [null, 41.7, 9],
    uv_index_max: [null, 2.35, 1],
    sunrise: [null, '2026-10-13T07:05', '2026-10-14T07:06'],
    sunset: [null, '2026-10-13T18:12', '2026-10-14T18:10'],
  },
}

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(FORECAST)))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 44.77234, longitude: 17.19121 } } as GeolocationPosition),
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('weather', () => {
  it('asks Open-Meteo with rounded coordinates only', () => {
    const url = new URL(forecastUrl(44.77234, 17.19121))
    expect(url.origin).toBe('https://api.open-meteo.com')
    expect(url.searchParams.get('latitude')).toBe('44.8')
    expect(url.searchParams.get('longitude')).toBe('17.2')
  })

  it('reads the daily forecast and names the weather codes', () => {
    expect(parseForecast(FORECAST)).toEqual({
      // Missing extras (as for past days) are simply left out.
      '2026-10-12': { code: 0, max: 18, min: 8, precipitation: 0 },
      '2026-10-13': {
        code: 61,
        max: 13,
        min: 6,
        rainChance: 85,
        precipitation: 4.24,
        feelsMax: 10,
        feelsMin: 4,
        wind: 18,
        gusts: 42,
        uv: 2.35,
        sunrise: '07:05',
        sunset: '18:12',
      },
    })
    expect(describeWeather(0).label).toBe('Clear')
    expect(describeWeather(63).label).toBe('Rain')
    expect(describeWeather(75).label).toBe('Snow')
    expect(describeWeather(96).label).toBe('Thunderstorm')
  })

  it('turns on with the location, caches, and forgets everything when turned off', async () => {
    const weather = useWeatherStore()
    expect(weather.forDay('2026-10-12')).toBeUndefined()
    await weather.enable()
    expect(weather.coords).toEqual({ lat: 44.8, lon: 17.2 })
    expect(weather.forDay('2026-10-12')).toEqual({ code: 0, max: 18, min: 8, precipitation: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Fresh cache: no second request.
    await weather.fetchForecast()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    weather.disable()
    expect(weather.forDay('2026-10-12')).toBeUndefined()
    expect(localStorage.getItem('daisycal.weather')).toBeNull()
  })

  it('fetches again when the cache predates the detailed forecast', async () => {
    localStorage.setItem(
      'daisycal.weather',
      JSON.stringify({
        enabled: true,
        lat: 44.8,
        lon: 17.2,
        fetchedAt: Date.now(),
        days: { '2026-10-12': { code: 0, max: 18, min: 8 } },
      }),
    )
    const weather = useWeatherStore()
    await weather.fetchForecast()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(weather.forDay('2026-10-13')?.rainChance).toBe(85)
  })

  it('stays off when the location is refused', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
          fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      },
    })
    const weather = useWeatherStore()
    await weather.enable()
    expect(weather.enabled).toBe(false)
    expect(weather.error).toBe('Location access was denied')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows icon and temperatures above the day name in the time grid', () => {
    const days = parseForecast(FORECAST)
    const wrapper = mount(TimeGrid, {
      props: {
        days: eachDay({ start: new Date(2026, 9, 12), end: new Date(2026, 9, 15) }),
        instances: [],
        tasks: [],
        colorFor: () => '#225688',
        weatherFor: (key: string) => days[key],
      },
    })
    const shown = wrapper.findAll('[data-testid="day-weather"]')
    expect(shown.map((w) => w.text().replace(/\s+/g, ''))).toEqual(['8°/18°', '6°/13°'])
    // Hover card with the details, rain chance included.
    const card = wrapper.findAll('[data-testid="weather-card"]')[1]!
    expect(card.text()).toContain('Light rain')
    expect(card.text()).toContain('Chance of rain85%')
    expect(card.text()).toContain('Precipitation4.2 mm')
    expect(card.text()).toContain('Wind18 km/h, gusts 42')
    expect(card.text()).toContain('Sunrise / sunset07:05 / 18:12')
  })
})
