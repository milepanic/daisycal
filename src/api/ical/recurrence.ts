import ICAL from 'ical.js'

import { toIcalTime, toJsDate } from './timezones'

export type RepeatFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

/** The simple repeat options the form offers. */
export interface SimpleRepeat {
  kind: 'simple'
  freq: RepeatFreq
  interval: number
  /** Weekly only. Empty means "on the start day". */
  byDay: Weekday[]
  /** Inclusive end date, or null for "never". */
  until: Date | null
  count: number | null
}

/** An RRULE the form cannot express; written back unchanged. */
export interface CustomRepeat {
  kind: 'custom'
  rrule: string
  summary: string
}

export type RepeatRule = SimpleRepeat | CustomRepeat

const FREQ_TO_ICAL: Record<RepeatFreq, 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'> = {
  daily: 'DAILY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
}
const ICAL_TO_FREQ: Record<string, RepeatFreq> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
}
const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/** Reads the RRULE of a component into a RepeatRule (null when it does not repeat). */
export function parseRepeat(comp: ICAL.Component): RepeatRule | null {
  const prop = comp.getFirstProperty('rrule')
  if (!prop) return null
  const recur = prop.getFirstValue() as ICAL.Recur
  const rrule = prop.toICALString().replace(/^RRULE:/i, '')
  const freq = ICAL_TO_FREQ[recur.freq]
  const parts = recur.parts as Record<string, unknown[]>
  const partNames = Object.keys(parts).filter((k) => (parts[k] ?? []).length > 0)
  const byDay = (parts.BYDAY ?? []) as string[]

  const onlyAllowed =
    freq &&
    partNames.every((p) => p === 'BYDAY') &&
    (byDay.length === 0 ||
      (freq === 'weekly' && byDay.every((d) => WEEKDAYS.includes(d as Weekday)))) &&
    !(recur.until && recur.count) &&
    (recur.wkst === undefined || recur.wkst === ICAL.Time.MONDAY || recur.wkst === ICAL.Time.SUNDAY)

  if (!onlyAllowed || comp.getAllProperties('rrule').length > 1) {
    return { kind: 'custom', rrule, summary: describeCustom(recur) }
  }
  return {
    kind: 'simple',
    freq,
    interval: recur.interval || 1,
    byDay: byDay as Weekday[],
    until: recur.until ? toJsDate(recur.until) : null,
    count: recur.count ?? null,
  }
}

function describeCustom(recur: ICAL.Recur): string {
  return `Custom (${recur.freq.toLowerCase()}${recur.interval > 1 ? ` every ${recur.interval}` : ''})`
}

/**
 * Writes the RepeatRule to the component's RRULE. Custom rules are left untouched;
 * null removes the rule (and RDATE/EXDATE no longer make sense, so they go too).
 */
export function applyRepeat(comp: ICAL.Component, rule: RepeatRule | null, start: ICAL.Time): void {
  if (rule?.kind === 'custom') return
  if (!rule) {
    comp.removeAllProperties('rrule')
    comp.removeAllProperties('rdate')
    comp.removeAllProperties('exdate')
    return
  }
  const data: ConstructorParameters<typeof ICAL.Recur>[0] = {
    freq: FREQ_TO_ICAL[rule.freq],
    interval: rule.interval > 1 ? rule.interval : undefined,
  }
  if (rule.freq === 'weekly' && rule.byDay.length > 0) data.byday = [...rule.byDay]
  if (rule.until) {
    // UNTIL must match DTSTART's value type: DATE for all-day, otherwise UTC date-time
    // at the end of that day so the last occurrence is included.
    if (start.isDate) data.until = toIcalTime(rule.until, { allDay: true })
    else {
      const endOfDay = new Date(
        rule.until.getFullYear(),
        rule.until.getMonth(),
        rule.until.getDate(),
        23,
        59,
        59,
      )
      data.until = ICAL.Time.fromJSDate(endOfDay, true)
    }
  } else if (rule.count) data.count = rule.count
  comp.updatePropertyWithValue('rrule', new ICAL.Recur(data))
}

/** Human-readable label for a rule (used by the form and event details). */
export function describeRepeat(rule: RepeatRule | null): string {
  if (!rule) return 'Does not repeat'
  if (rule.kind === 'custom') return rule.summary
  const every = rule.interval > 1 ? `Every ${rule.interval} ` : 'Every '
  const unit: Record<RepeatFreq, [string, string]> = {
    daily: ['day', 'days'],
    weekly: ['week', 'weeks'],
    monthly: ['month', 'months'],
    yearly: ['year', 'years'],
  }
  let label = every + unit[rule.freq][rule.interval > 1 ? 1 : 0]
  if (rule.freq === 'weekly' && rule.byDay.length > 0) label += ` on ${rule.byDay.join(', ')}`
  if (rule.until) label += ` until ${rule.until.toLocaleDateString()}`
  else if (rule.count) label += `, ${rule.count} times`
  return label
}
