import { describe, expect, it } from 'vitest'

import { customLabel, rangeForView, snapCustomRange, stepDate } from '../dates'
import {
  dayTitle,
  formatShortDateTime,
  formatTime,
  monthTitle,
  spanTitle,
  viewTitle,
} from '../format'

describe('format', () => {
  it('builds the mockup titles', () => {
    const week = rangeForView('week', new Date(2026, 9, 9))
    expect(spanTitle(week)).toBe('October 5 – 11, 2026')
    expect(spanTitle(rangeForView('work-week', new Date(2026, 9, 9)))).toBe('October 5 – 9, 2026')
    expect(spanTitle(rangeForView('week', new Date(2026, 8, 30)))).toBe('Sep 28 – Oct 4, 2026')
    expect(spanTitle(rangeForView('week', new Date(2025, 11, 31)))).toBe(
      'Dec 29, 2025 – Jan 4, 2026',
    )
    expect(dayTitle(new Date(2026, 9, 9))).toBe('Friday, October 9, 2026')
    expect(monthTitle(new Date(2026, 9, 9))).toBe('October 2026')
    expect(
      viewTitle('agenda', new Date(2026, 9, 9), rangeForView('agenda', new Date(2026, 9, 9))),
    ).toBe('October 2026')
    expect(viewTitle('day', new Date(2026, 9, 9), rangeForView('day', new Date(2026, 9, 9)))).toBe(
      'Friday, October 9, 2026',
    )
  })

  it('formats times and short dates', () => {
    expect(formatTime(new Date(2026, 9, 5, 17, 0))).toBe('17:00')
    expect(formatShortDateTime(new Date(2026, 9, 5, 17, 0))).toBe('Mon, Oct 5, 17:00')
    expect(formatShortDateTime(new Date(2026, 9, 5), false)).toBe('Mon, Oct 5')
  })

  it('agenda covers a month and steps by month', () => {
    expect(rangeForView('agenda', new Date(2026, 9, 16))).toEqual({
      start: new Date(2026, 9, 1),
      end: new Date(2026, 10, 1),
    })
    expect(stepDate('agenda', new Date(2026, 9, 31), 1)).toEqual(new Date(2026, 10, 30))
  })
})

describe('custom range (mini calendar drag)', () => {
  it('shows exactly the picked days up to a week, whole weeks beyond', () => {
    // Tue Nov 10 + 4 days → Tue–Fri.
    const short = rangeForView('custom', new Date(2026, 10, 10), 1, 4)
    expect(short).toEqual({ start: new Date(2026, 10, 10), end: new Date(2026, 10, 14) })
    // Tue Nov 3 + 15 days (to Tue Nov 17) → Mon Nov 2 … Sun Nov 22, three weeks.
    const long = rangeForView('custom', new Date(2026, 10, 3), 1, 15)
    expect(long).toEqual({ start: new Date(2026, 10, 2), end: new Date(2026, 10, 23) })
  })

  it('steps by its own length', () => {
    expect(stepDate('custom', new Date(2026, 10, 3), 1, 15)).toEqual(new Date(2026, 10, 18))
    expect(stepDate('custom', new Date(2026, 10, 3), -1, 4)).toEqual(new Date(2026, 9, 30))
  })
})

describe('snapCustomRange', () => {
  it('keeps up to a week exact and grows longer picks to whole weeks', () => {
    expect(snapCustomRange(new Date(2026, 10, 10), 4)).toEqual({
      start: new Date(2026, 10, 10),
      end: new Date(2026, 10, 14),
    })
    // 10 days, Tue Nov 3 – Thu Nov 12 → Mon Nov 2 – Sun Nov 15 (14 days).
    expect(snapCustomRange(new Date(2026, 10, 3), 10)).toEqual({
      start: new Date(2026, 10, 2),
      end: new Date(2026, 10, 16),
    })
    expect(customLabel(14)).toBe('2 weeks')
    expect(customLabel(5)).toBe('5 days')
  })
})
