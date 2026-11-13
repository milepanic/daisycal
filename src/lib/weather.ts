/** Open-Meteo daily forecast: request URL, response parsing and WMO weather codes. */
export interface DayWeather {
  /** WMO weather code (Open-Meteo `weather_code`). */
  code: number
  max: number
  min: number
  /** The rest is for the hover card; any of it can be missing (e.g. past days). */
  feelsMax?: number
  feelsMin?: number
  /** Highest chance of precipitation during the day, in %. */
  rainChance?: number
  /** Total precipitation in mm. */
  precipitation?: number
  /** Max wind speed and gusts, km/h. */
  wind?: number
  gusts?: number
  uv?: number
  /** Local "HH:MM". */
  sunrise?: string
  sunset?: string
}

/** Bump when DayWeather gains fields, so a cached forecast without them is fetched again. */
export const FORECAST_VERSION = 2

const DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'precipitation_probability_max',
  'precipitation_sum',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'uv_index_max',
  'sunrise',
  'sunset',
] as const

/**
 * Coordinates rounded to 0.1° (about 10 km): enough for a forecast, and all that leaves the
 * browser. No other data is sent.
 */
export function roundCoord(value: number): number {
  return Math.round(value * 10) / 10
}

export function forecastUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(roundCoord(lat)),
    longitude: String(roundCoord(lon)),
    daily: DAILY.join(','),
    timezone: 'auto',
    past_days: '7',
    forecast_days: '16',
  })
  return `https://api.open-meteo.com/v1/forecast?${params}`
}

interface OpenMeteoDaily {
  daily?: { time?: string[] } & Partial<Record<(typeof DAILY)[number], (number | string | null)[]>>
}

/** Forecast by date key (YYYY-MM-DD); days without code / max / min are left out. */
export function parseForecast(json: OpenMeteoDaily): Record<string, DayWeather> {
  const d = json.daily
  const out: Record<string, DayWeather> = {}
  const num = (key: (typeof DAILY)[number], i: number) => {
    const v = d?.[key]?.[i]
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }
  const round = (v: number | undefined) => (v == null ? undefined : Math.round(v))
  /** "2026-10-12T06:52" → "06:52". */
  const clock = (key: 'sunrise' | 'sunset', i: number) => {
    const v = d?.[key]?.[i]
    return typeof v === 'string' && /T\d{2}:\d{2}/.test(v) ? v.slice(11, 16) : undefined
  }
  d?.time?.forEach((day, i) => {
    const code = num('weather_code', i)
    const max = num('temperature_2m_max', i)
    const min = num('temperature_2m_min', i)
    if (code == null || max == null || min == null) return
    const w: DayWeather = { code, max: Math.round(max), min: Math.round(min) }
    const extra: Partial<DayWeather> = {
      feelsMax: round(num('apparent_temperature_max', i)),
      feelsMin: round(num('apparent_temperature_min', i)),
      rainChance: round(num('precipitation_probability_max', i)),
      precipitation: num('precipitation_sum', i),
      wind: round(num('wind_speed_10m_max', i)),
      gusts: round(num('wind_gusts_10m_max', i)),
      uv: num('uv_index_max', i),
      sunrise: clock('sunrise', i),
      sunset: clock('sunset', i),
    }
    for (const [k, v] of Object.entries(extra)) if (v !== undefined) Object.assign(w, { [k]: v })
    out[day] = w
  })
  return out
}

/** WMO code in words, finer than describeWeather (for the hover card). */
const WMO_DETAIL: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Light freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Light snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
}

export function weatherDetail(code: number): string {
  return WMO_DETAIL[code] ?? describeWeather(code).label
}

/** UV index in words (WHO scale). */
export function uvLevel(uv: number): string {
  if (uv < 3) return 'Low'
  if (uv < 6) return 'Moderate'
  if (uv < 8) return 'High'
  if (uv < 11) return 'Very high'
  return 'Extreme'
}

/** Icon and description for a WMO weather code. */
export function describeWeather(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: 'weather-clear', label: 'Clear' }
  if (code <= 2) return { icon: 'weather-partly', label: 'Partly cloudy' }
  if (code === 3) return { icon: 'weather-cloudy', label: 'Overcast' }
  if (code === 45 || code === 48) return { icon: 'weather-fog', label: 'Fog' }
  if (code >= 51 && code <= 57) return { icon: 'weather-drizzle', label: 'Drizzle' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { icon: 'weather-rain', label: 'Rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { icon: 'weather-snow', label: 'Snow' }
  if (code >= 95) return { icon: 'weather-storm', label: 'Thunderstorm' }
  return { icon: 'weather-cloudy', label: 'Weather' }
}
