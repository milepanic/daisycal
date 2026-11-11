import { describe, expect, it } from 'vitest'

import type { Task } from '@/api/ical'
import { dueBadge, dueLabel } from '../taskBadge'

const base: Task = {
  uid: 'u',
  objectUrl: 'o',
  collectionUrl: 'c',
  etag: '"e"',
  summary: 'x',
  description: '',
  due: null,
  dueAllDay: false,
  completed: false,
  completedAt: null,
  percent: 0,
  priority: null,
  priorityValue: 0,
  alarm: null,
  created: null,
  sortOrder: null,
  parentUid: null,
}
const now = new Date(2026, 9, 9, 12, 0)

describe('dueBadge', () => {
  it('returns null without a due date', () => {
    expect(dueBadge(base, now)).toBeNull()
  })
  it('is red for overdue, accent for today, gray for later and for completed', () => {
    expect(dueBadge({ ...base, due: new Date(2026, 9, 5, 17) }, now)).toEqual({
      label: 'Mon, Oct 5, 17:00',
      cls: 'text-red-600 ring-red-200',
    })
    expect(dueBadge({ ...base, due: new Date(2026, 9, 9, 11) }, now)).toEqual({
      label: 'Today, 11:00',
      cls: 'text-red-600 ring-red-200',
    })
    expect(dueBadge({ ...base, due: new Date(2026, 9, 9, 15) }, now)).toEqual({
      label: 'Today, 15:00',
      cls: 'text-accent ring-accent/30',
    })
    expect(dueBadge({ ...base, due: new Date(2026, 9, 9), dueAllDay: true }, now)).toEqual({
      label: 'Today',
      cls: 'text-accent ring-accent/30',
    })
    expect(dueBadge({ ...base, due: new Date(2026, 9, 11), dueAllDay: true }, now)).toEqual({
      label: 'Sunday',
      cls: 'text-gray-600 ring-gray-200',
    })
    expect(dueBadge({ ...base, due: new Date(2026, 9, 5), completed: true }, now)?.cls).toBe(
      'text-gray-600 ring-gray-200',
    )
  })

  it('names nearby days like Google Tasks', () => {
    // now = Friday, Oct 9 2026, 12:00
    const label = (d: Date, allDay = true) => dueLabel(d, allDay, now)
    expect(label(new Date(2026, 9, 8))).toBe('Yesterday')
    expect(label(new Date(2026, 9, 10, 18), false)).toBe('Tomorrow, 18:00')
    expect(label(new Date(2026, 9, 15))).toBe('Thursday')
    expect(label(new Date(2026, 9, 16))).toBe('Fri, Oct 16')
    expect(label(new Date(2026, 9, 7))).toBe('Wed, Oct 7')
    expect(label(new Date(2027, 0, 4))).toBe('Mon, Jan 4, 2027')
  })
})
