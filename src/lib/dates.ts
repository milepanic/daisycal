/** Date helpers. All ranges are half-open [start, end) in browser-local time. */

export interface DateRange {
  start: Date
  end: Date
}

/** 'custom': days picked by dragging in the mini calendar (start = the anchor date). */
export type CalendarView = 'day' | 'work-week' | 'week' | 'month' | 'agenda' | 'custom'

/** Longest custom range (the mini calendar shows six weeks). */
export const MAX_CUSTOM_DAYS = 42

/**
 * A mini calendar pick snapped to what the views show well: up to a week stays exact (time
 * grid with that many columns); longer picks grow to whole weeks (10 days → the 2 weeks around
 * them), since the month-style grid shows whole weeks anyway.
 */
export function snapCustomRange(start: Date, days: number, weekStart: WeekStart = 1): DateRange {
  const first = startOfDay(start)
  if (days <= 7) return { start: first, end: addDays(first, days) }
  const from = startOfWeek(first, weekStart)
  const to = addDays(startOfWeek(addDays(first, days - 1), weekStart), 7)
  const weeks = Math.min(Math.round((+to - +from) / (7 * DAY_MS)), MAX_CUSTOM_DAYS / 7)
  return { start: from, end: addDays(from, weeks * 7) }
}

/** Number of days in a range of whole days. */
export function daysIn(range: DateRange): number {
  return Math.round((+range.end - +range.start) / DAY_MS)
}

/** "4 days", "2 weeks" (custom view labels). */
export function customLabel(days: number): string {
  return days > 7 && days % 7 === 0 ? `${days / 7} weeks` : `${days} days`
}

/** The days picked for a custom view: `days` days from `date`. */
export function customRange(date: Date, days: number): DateRange {
  const start = startOfDay(date)
  return { start, end: addDays(start, days) }
}

/** 0 = Sunday ... 6 = Saturday; the app defaults to Monday. */
export type WeekStart = 0 | 1 | 6

export const DAY_MS = 86_400_000

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, days: number): Date {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  )
}

export function addMonths(d: Date, months: number): Date {
  const day = d.getDate()
  const first = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, last))
}

export function startOfWeek(d: Date, weekStart: WeekStart = 1): Date {
  const day = startOfDay(d)
  const diff = (day.getDay() - weekStart + 7) % 7
  return addDays(day, -diff)
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** `YYYY-MM-DD` of a local date (used in routes and cache keys). */
export function toDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** `YYYY-MM` of a local date. */
export function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Parses `YYYY-MM-DD` (or `YYYY-MM`) as a local date; null when invalid. */
export function parseDateKey(key: string | undefined | null): Date | null {
  if (!key) return null
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(key)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1)
  return Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? null : d
}

/** Days [start, end) as local midnights. */
export function eachDay(range: DateRange): Date[] {
  const days: Date[] = []
  for (let d = startOfDay(range.start); d < range.end; d = addDays(d, 1)) days.push(d)
  return days
}

/** Month keys covering the range (used by the event cache). */
export function monthKeysIn(range: DateRange): string[] {
  const keys: string[] = []
  for (let d = startOfMonth(range.start); d < range.end; d = addMonths(d, 1))
    keys.push(toMonthKey(d))
  return keys
}

export function monthRange(monthKey: string): DateRange {
  const start = parseDateKey(monthKey) ?? startOfMonth(new Date())
  return { start, end: addMonths(start, 1) }
}

/** The dates a view shows for the given anchor date. */
export function rangeForView(
  view: CalendarView,
  date: Date,
  weekStart: WeekStart = 1,
  customDays = 7,
): DateRange {
  switch (view) {
    case 'custom': {
      // Up to a week: exactly those days (time grid). Longer: whole weeks (month-style grid,
      // the days outside the pick shaded).
      const picked = customRange(date, customDays)
      if (customDays <= 7) return picked
      const start = startOfWeek(picked.start, weekStart)
      return { start, end: addDays(startOfWeek(addDays(picked.end, -1), weekStart), 7) }
    }
    case 'day': {
      const start = startOfDay(date)
      return { start, end: addDays(start, 1) }
    }
    case 'work-week': {
      const start = startOfWeek(date, 1)
      return { start, end: addDays(start, 5) }
    }
    case 'week': {
      const start = startOfWeek(date, weekStart)
      return { start, end: addDays(start, 7) }
    }
    case 'month': {
      // Full 6-row grid so the layout never jumps.
      const start = startOfWeek(startOfMonth(date), weekStart)
      return { start, end: addDays(start, 42) }
    }
    case 'agenda': {
      // The agenda lists a whole month (the mockup is titled "October 2026").
      const start = startOfMonth(date)
      return { start, end: addMonths(start, 1) }
    }
  }
}

/** Anchor date after moving one "page" of the view forward/backward. */
export function stepDate(view: CalendarView, date: Date, direction: 1 | -1, customDays = 7): Date {
  switch (view) {
    case 'custom':
      return addDays(date, customDays * direction)
    case 'day':
      return addDays(date, direction)
    case 'work-week':
    case 'week':
      return addDays(date, 7 * direction)
    case 'month':
      return addMonths(date, direction)
    case 'agenda':
      return addMonths(date, direction)
  }
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start < b.end && b.start < a.end
}
