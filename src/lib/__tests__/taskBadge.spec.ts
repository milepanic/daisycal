import { describe, expect, it } from 'vitest'

import type { Task } from '@/api/ical'
import { dueBadge } from '../taskBadge'

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
      cls: 'bg-red-50 text-red-600',
    })
    expect(dueBadge({ ...base, due: new Date(2026, 9, 9, 11) }, now)).toEqual({
      label: 'Today, 11:00',
      cls: 'bg-red-50 text-red-600',
    })
    expect(dueBadge({ ...base, due: new Date(2026, 9, 9, 15) }, now)).toEqual({
      label: 'Today, 15:00',
      cls: 'bg-accent/10 text-accent',
    })
    expect(dueBadge({ ...base, due: new Date(2026, 9, 9), dueAllDay: true }, now)).toEqual({
      label: 'Today',
      cls: 'bg-accent/10 text-accent',
    })
    expect(dueBadge({ ...base, due: new Date(2026, 9, 11), dueAllDay: true }, now)).toEqual({
      label: 'Sun, Oct 11',
      cls: 'bg-gray-100 text-gray-600',
    })
    expect(dueBadge({ ...base, due: new Date(2026, 9, 5), completed: true }, now)?.cls).toBe(
      'bg-gray-100 text-gray-600',
    )
  })
})
