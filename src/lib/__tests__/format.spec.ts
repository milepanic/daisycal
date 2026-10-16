import { describe, expect, it } from 'vitest'

import { rangeForView, stepDate } from '../dates'
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
