import { type CalendarView, type DateRange, addDays, isSameDay } from './dates'

const LOCALE = 'en-US'

export const MONTHS_LONG = Array.from({ length: 12 }, (_, m) =>
  new Date(2000, m, 1).toLocaleDateString(LOCALE, { month: 'long' }),
)
export const MONTHS_SHORT = Array.from({ length: 12 }, (_, m) =>
  new Date(2000, m, 1).toLocaleDateString(LOCALE, { month: 'short' }),
)
export const WEEKDAYS_LONG = Array.from({ length: 7 }, (_, d) =>
  new Date(2023, 0, 1 + d).toLocaleDateString(LOCALE, { weekday: 'long' }),
) // 2023-01-01 is a Sunday → index = getDay()
export const WEEKDAYS_SHORT = WEEKDAYS_LONG.map((w) => w.slice(0, 3))
export const WEEKDAYS_LETTER = WEEKDAYS_LONG.map((w) => w[0]!)

/** "October 2026" */
export function monthTitle(d: Date): string {
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}

/** "October 5 – 11, 2026", "Sep 28 – Oct 4, 2026", "Dec 29, 2025 – Jan 4, 2026" */
export function spanTitle(range: DateRange): string {
  const first = range.start
  const last = addDays(range.end, -1)
  if (isSameDay(first, last)) return dayTitle(first)
  if (first.getFullYear() !== last.getFullYear()) {
    return `${MONTHS_SHORT[first.getMonth()]} ${first.getDate()}, ${first.getFullYear()} – ${MONTHS_SHORT[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${MONTHS_SHORT[first.getMonth()]} ${first.getDate()} – ${MONTHS_SHORT[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`
  }
  return `${MONTHS_LONG[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`
}

/** "Friday, October 9, 2026" */
export function dayTitle(d: Date): string {
  return `${WEEKDAYS_LONG[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** Toolbar heading for a view. */
export function viewTitle(view: CalendarView, date: Date, range: DateRange): string {
  switch (view) {
    case 'day':
      return dayTitle(date)
    case 'month':
    case 'agenda':
      return monthTitle(date)
    default:
      return spanTitle(range)
  }
}

/** What prev/next step over, for screen readers: "Previous week". */
export function stepLabel(view: CalendarView): string {
  return view === 'day' ? 'day' : view === 'month' || view === 'agenda' ? 'month' : 'week'
}

/** "09:30" (24h) */
export function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "Mon, Oct 5, 17:00" / "Mon, Oct 5" */
export function formatShortDateTime(d: Date, withTime = true): string {
  const base = `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
  return withTime ? `${base}, ${formatTime(d)}` : base
}
