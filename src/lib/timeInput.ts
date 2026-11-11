/** Helpers for the date and time pickers in the create popup and the inline task forms. */
import { type WeekStart, addDays, startOfDay, startOfWeek } from './dates'
import { MONTHS_LONG, MONTHS_SHORT, WEEKDAYS_LONG, WEEKDAYS_SHORT } from './format'

const pad = (n: number) => String(n).padStart(2, '0')

/** "HH:MM" → minutes after midnight. */
export function toMinutes(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
}

/** Minutes (wrapped into one day) → "HH:MM". */
export function fromMinutes(m: number): string {
  const v = ((m % 1440) + 1440) % 1440
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`
}

/**
 * Reads a typed time as 24h "HH:MM", or null when it is not one.
 * Accepts "14:30", "14.30", "14,30", "1430", "930", "14", "9", "14h", "2pm", "2:30 pm", "12am".
 */
export function parseTime(text: string): string | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  // The separator is optional, so "930" reads as 9:30 and "1430" as 14:30.
  const m = /^(\d{1,2})(?:[:.,h]?(\d{2}))?(h|am|pm|a|p)?$/.exec(s)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const suffix = m[3]
  if (suffix && suffix !== 'h') {
    if (h < 1 || h > 12) return null
    const pm = suffix.startsWith('p')
    if (h === 12) h = pm ? 12 : 0
    else if (pm) h += 12
  }
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

/** Google Calendar style: "0 mins", "45 mins", "1 hr", "1.5 hrs", "2.25 hrs". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} mins`
  const h = Math.round((minutes / 60) * 100) / 100
  return h === 1 ? '1 hr' : `${h} hrs`
}

/**
 * "Thursday, November 12" ("Thu, Nov 12" with `short`), with the year when it is not the
 * current one.
 */
export function formatPickerDate(d: Date, opts: { short?: boolean; now?: Date } = {}): string {
  const now = opts.now ?? new Date()
  const base = opts.short
    ? `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
    : `${WEEKDAYS_LONG[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`
}

export interface DateShortcut {
  key: 'today' | 'tomorrow' | 'weekend' | 'next-week'
  label: string
  date: Date
}

/**
 * Quick due dates: today, tomorrow, this weekend (the coming Saturday, or today on a weekend
 * day) and next week (the start of next week).
 */
export function dateShortcuts(now = new Date(), weekStart: WeekStart = 1): DateShortcut[] {
  const today = startOfDay(now)
  const dow = today.getDay()
  const weekend = dow === 6 || dow === 0 ? today : addDays(today, 6 - dow)
  return [
    { key: 'today', label: 'Today', date: today },
    { key: 'tomorrow', label: 'Tomorrow', date: addDays(today, 1) },
    { key: 'weekend', label: 'This weekend', date: weekend },
    { key: 'next-week', label: 'Next week', date: addDays(startOfWeek(today, weekStart), 7) },
  ]
}
