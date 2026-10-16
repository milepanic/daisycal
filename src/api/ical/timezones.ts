/**
 * Time zone handling. ical.js ships no IANA data, so zones come from two sources:
 *   1. VTIMEZONE components inside the .ics files we read (what Apple writes);
 *   2. zones synthesized from the browser's Intl data for any other TZID
 *      (the browser's own zone for new events, or a TZID a file references without defining).
 */
import ICAL from 'ical.js'

/** VTIMEZONEs seen in parsed files, kept so we can re-emit them for new events. */
const knownVtimezones = new Map<string, ICAL.Component>()

const DATE_TIME_PROPS = ['dtstart', 'dtend', 'due', 'recurrence-id', 'exdate', 'rdate', 'completed']

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Registers every VTIMEZONE of the calendar and synthesizes any TZID it references but omits. */
export function registerTimezones(vcalendar: ICAL.Component): void {
  for (const vtz of vcalendar.getAllSubcomponents('vtimezone')) {
    const tzid = vtz.getFirstPropertyValue('tzid')
    if (typeof tzid !== 'string' || !tzid) continue
    if (!knownVtimezones.has(tzid)) knownVtimezones.set(tzid, vtz)
    if (!ICAL.TimezoneService.has(tzid)) ICAL.TimezoneService.register(vtz)
  }
  for (const comp of vcalendar.getAllSubcomponents()) {
    for (const name of DATE_TIME_PROPS) {
      for (const prop of comp.getAllProperties(name)) {
        const tzid = prop.getParameter('tzid')
        if (typeof tzid === 'string' && tzid) ensureTimezone(tzid)
      }
    }
  }
}

/** Makes sure `tzid` resolves in ical.js, synthesizing it from Intl when nothing else defines it. */
export function ensureTimezone(tzid: string): ICAL.Timezone {
  if (tzid === 'UTC' || tzid === 'Z') return ICAL.Timezone.utcTimezone
  if (!ICAL.TimezoneService.has(tzid)) {
    const vtz = synthesizeVtimezone(tzid)
    if (vtz) {
      ICAL.TimezoneService.register(vtz)
      if (!knownVtimezones.has(tzid)) knownVtimezones.set(tzid, vtz)
    }
  }
  return ICAL.TimezoneService.has(tzid)
    ? ICAL.TimezoneService.get(tzid)
    : ICAL.Timezone.localTimezone
}

/** VTIMEZONE to embed when writing an object that references `tzid`. */
export function vtimezoneFor(tzid: string): ICAL.Component | null {
  if (tzid === 'UTC') return null
  ensureTimezone(tzid)
  const vtz = knownVtimezones.get(tzid)
  return vtz ? new ICAL.Component(structuredClone(vtz.toJSON())) : null
}

export function isValidTimeZone(tzid: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tzid })
    return true
  } catch {
    return false
  }
}

/** UTC offset (seconds) of `tzid` at the given instant, from Intl. */
export function offsetAt(tzid: string, instant: Date): number {
  // Intl drops milliseconds; compare whole seconds so sub-second instants do not skew the result.
  const seconds = Math.floor(instant.getTime() / 1000) * 1000
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tzid,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(new Date(seconds))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>
  const asUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour! % 24,
    parts.minute!,
    parts.second!,
  )
  return Math.round((asUtc - seconds) / 1000) || 0
}

function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+'
  const abs = Math.abs(seconds)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  return `${sign}${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`
}

function localTime(instant: Date, offsetSeconds: number): ICAL.Time {
  const d = new Date(instant.getTime() + offsetSeconds * 1000)
  return ICAL.Time.fromData({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  })
}

/**
 * Builds a VTIMEZONE with explicit (non-recurring) observances for every offset transition in
 * [fromYear, toYear], found by scanning Intl offsets. Good enough for display and for writing
 * events a few years around now; Apple clients bring their own definitions anyway.
 */
export function synthesizeVtimezone(
  tzid: string,
  fromYear = new Date().getFullYear() - 5,
  toYear = new Date().getFullYear() + 10,
): ICAL.Component | null {
  if (!isValidTimeZone(tzid)) return null
  const vtz = new ICAL.Component('vtimezone')
  vtz.addPropertyWithValue('tzid', tzid)
  vtz.addPropertyWithValue('x-daisycal-synthesized', 'TRUE')

  const start = Date.UTC(fromYear, 0, 1)
  const end = Date.UTC(toYear + 1, 0, 1)
  let prevOffset = offsetAt(tzid, new Date(start))
  const observances: { at: number; from: number; to: number }[] = []

  const DAY = 86_400_000
  for (let t = start + DAY; t <= end; t += DAY) {
    const offset = offsetAt(tzid, new Date(t))
    if (offset === prevOffset) continue
    // Binary search the exact transition instant inside the last day.
    let lo = t - DAY
    let hi = t
    while (hi - lo > 60_000) {
      const mid = lo + Math.floor((hi - lo) / 2 / 60_000) * 60_000
      if (offsetAt(tzid, new Date(mid)) === prevOffset) lo = mid
      else hi = mid
    }
    observances.push({ at: hi, from: prevOffset, to: offset })
    prevOffset = offset
  }

  const addObservance = (name: 'standard' | 'daylight', at: number, from: number, to: number) => {
    const obs = new ICAL.Component(name)
    obs.addPropertyWithValue('dtstart', localTime(new Date(at), from))
    obs.addPropertyWithValue('tzoffsetfrom', ICAL.UtcOffset.fromString(formatOffset(from)))
    obs.addPropertyWithValue('tzoffsetto', ICAL.UtcOffset.fromString(formatOffset(to)))
    vtz.addSubcomponent(obs)
  }

  if (observances.length === 0) {
    addObservance('standard', start, prevOffset, prevOffset)
  } else {
    // Initial observance so dates before the first transition resolve too.
    const first = observances[0]!
    addObservance('standard', start, first.from, first.from)
    for (const o of observances)
      addObservance(o.to > o.from ? 'daylight' : 'standard', o.at, o.from, o.to)
  }
  return vtz
}

/** Wall-clock components of `instant` in `tzid`. */
function wallClock(instant: Date, tzid: string) {
  const offset = offsetAt(tzid, instant)
  const d = new Date(instant.getTime() + offset * 1000)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  }
}

/**
 * Converts a JS Date to an ICAL.Time.
 *  - all-day: a DATE value using the browser-local calendar date
 *  - `tzid` given: wall-clock time in that zone with TZID
 *  - `tzid` null: UTC
 */
export function toIcalTime(
  date: Date,
  options: { allDay?: boolean; tzid?: string | null } = {},
): ICAL.Time {
  if (options.allDay) {
    return ICAL.Time.fromData({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      isDate: true,
    })
  }
  if (!options.tzid || options.tzid === 'UTC') return ICAL.Time.fromJSDate(date, true)
  const zone = ensureTimezone(options.tzid)
  return ICAL.Time.fromData({ ...wallClock(date, options.tzid), isDate: false }, zone)
}

/** Converts an ICAL.Time to a JS Date. All-day values become browser-local midnight. */
export function toJsDate(time: ICAL.Time): Date {
  if (time.isDate) return new Date(time.year, time.month - 1, time.day)
  return time.toJSDate()
}

/** Sets a date-time property with the correct TZID parameter / VALUE=DATE. */
export function setTimeProperty(
  comp: ICAL.Component,
  name: string,
  time: ICAL.Time,
): ICAL.Property {
  // ical.js emits VALUE=DATE itself for date values; only the TZID parameter is ours to manage.
  const prop = comp.updatePropertyWithValue(name, time)
  prop.removeParameter('tzid')
  if (
    !time.isDate &&
    time.zone &&
    time.zone !== ICAL.Timezone.utcTimezone &&
    time.zone !== ICAL.Timezone.localTimezone
  ) {
    prop.setParameter('tzid', time.zone.tzid)
  }
  return prop
}

/** TZID of a time property, or null for UTC / floating / all-day. */
export function tzidOf(time: ICAL.Time | null | undefined): string | null {
  if (!time || time.isDate) return null
  const zone = time.zone
  if (!zone || zone === ICAL.Timezone.utcTimezone || zone === ICAL.Timezone.localTimezone)
    return null
  return zone.tzid || null
}

/** Test hook. */
export function _resetTimezones() {
  knownVtimezones.clear()
  ICAL.TimezoneService.reset()
}
