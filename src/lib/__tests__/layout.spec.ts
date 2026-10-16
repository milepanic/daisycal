import { describe, expect, it } from 'vitest'

import type { EventInstance, Task } from '@/api/ical'
import {
  buildAgendaDays,
  buildMonthCells,
  isAllDayRow,
  layoutDay,
  layoutSpans,
  slotFromOffset,
} from '../layout'

let n = 0
function ev(start: Date, end: Date, extra: Partial<EventInstance> = {}): EventInstance {
  return {
    uid: `u${++n}`,
    objectUrl: `https://x/${n}.ics`,
    collectionUrl: 'https://x/',
    etag: '"e"',
    summary: extra.summary ?? `E${n}`,
    description: '',
    location: '',
    start,
    end,
    allDay: false,
    tzid: null,
    recurrenceId: null,
    isException: false,
    isRecurring: false,
    repeat: null,
    alarm: null,
    status: null,
    ...extra,
  }
}
function task(due: Date | null, extra: Partial<Task> = {}): Task {
  return {
    uid: `t${++n}`,
    objectUrl: `https://x/t${n}.ics`,
    collectionUrl: 'https://t/',
    etag: '"e"',
    summary: extra.summary ?? `T${n}`,
    description: '',
    due,
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
    ...extra,
  }
}
const d = (day: number, h = 0, m = 0) => new Date(2026, 9, day, h, m)

describe('layoutDay', () => {
  it('positions by time with a minimum height and compact flag', () => {
    const [a, b] = layoutDay([ev(d(5, 9), d(5, 10)), ev(d(5, 10, 20), d(5, 10, 30))], d(5))
    expect(a).toMatchObject({ top: 540, height: 60, left: 0, width: 1, compact: false })
    expect(b).toMatchObject({ top: 620, height: 16, compact: true })
  })

  it('splits overlapping events into columns and lets chips stretch over free columns', () => {
    const long = ev(d(5, 9), d(5, 12), { summary: 'long' })
    const a = ev(d(5, 9), d(5, 10), { summary: 'a' })
    const b = ev(d(5, 11), d(5, 12), { summary: 'b' })
    const placed = Object.fromEntries(
      layoutDay([a, long, b], d(5)).map((p) => [p.instance.summary, p]),
    )
    expect(placed.long).toMatchObject({ left: 0, width: 0.5 })
    expect(placed.a).toMatchObject({ left: 0.5, width: 0.5 })
    expect(placed.b).toMatchObject({ left: 0.5, width: 0.5 })
    // Separate clusters get full width again.
    const later = layoutDay([a, ev(d(5, 14), d(5, 15))], d(5))
    expect(later[1]).toMatchObject({ left: 0, width: 1 })
  })

  it('clips events crossing midnight and excludes all-day rows', () => {
    const night = ev(d(5, 23), d(6, 1))
    const sameDay = layoutDay([night], d(5))[0]!
    expect(sameDay).toMatchObject({
      top: 1380,
      height: 60,
      continuesAfter: true,
      continuesBefore: false,
    })
    const nextDay = layoutDay([night], d(6))[0]!
    expect(nextDay).toMatchObject({ top: 0, height: 60, continuesBefore: true })
    expect(layoutDay([ev(d(5), d(6), { allDay: true }), ev(d(5, 8), d(6, 9))], d(5))).toHaveLength(
      0,
    )
    expect(isAllDayRow(ev(d(5, 8), d(6, 9)))).toBe(true)
  })
})

describe('layoutSpans', () => {
  it('packs multi-day items into lanes and clips to the visible days', () => {
    const days = [d(5), d(6), d(7), d(8), d(9), d(10), d(11)]
    const items = [
      ev(d(5), d(6), { summary: 'mon', allDay: true }),
      ev(d(3), d(7), { summary: 'from-last-week', allDay: true }),
      ev(d(9), d(14), { summary: 'into-next', allDay: true }),
      ev(d(6), d(7), { summary: 'tue', allDay: true }),
    ]
    const placed = Object.fromEntries(
      layoutSpans(items, days, (i) => i).map((p) => [p.item.summary, p]),
    )
    expect(placed['from-last-week']).toMatchObject({
      startCol: 0,
      span: 2,
      lane: 0,
      continuesBefore: true,
    })
    expect(placed.mon).toMatchObject({ startCol: 0, span: 1, lane: 1 })
    expect(placed.tue).toMatchObject({ startCol: 1, span: 1, lane: 1 })
    expect(placed['into-next']).toMatchObject({
      startCol: 4,
      span: 3,
      lane: 0,
      continuesAfter: true,
    })
    expect(layoutSpans([ev(d(20), d(21), { allDay: true })], days, (i) => i)).toHaveLength(0)
  })
})

describe('buildMonthCells', () => {
  it('builds 42 cells with overflow counts, month flags and tasks', () => {
    const range = { start: new Date(2026, 8, 28), end: new Date(2026, 10, 9) }
    const events = [
      ev(d(5), d(7), { summary: 'two-day', allDay: true }),
      ev(d(5, 9), d(5, 10)),
      ev(d(5, 11), d(5, 12)),
      ev(d(5, 13), d(5, 14)),
    ]
    const cells = buildMonthCells(range, 9, events, [task(d(6, 12))], 3, d(9))
    expect(cells).toHaveLength(42)
    expect(cells[0]).toMatchObject({ key: '2026-09-28', inMonth: false })
    const mon = cells.find((c) => c.key === '2026-10-05')!
    expect(mon.items).toHaveLength(4)
    expect(mon.visible).toHaveLength(2)
    expect(mon.hiddenCount).toBe(2)
    expect(mon.visible[0]).toMatchObject({ kind: 'event', allDay: true })
    const tue = cells.find((c) => c.key === '2026-10-06')!
    expect(tue.items.map((i) => i.kind)).toEqual(['event', 'task'])
    expect(tue.hiddenCount).toBe(0)
    expect(cells.find((c) => c.key === '2026-10-09')?.isToday).toBe(true)
  })
})

describe('buildAgendaDays', () => {
  it('groups non-empty days, labels times and sorts all-day first', () => {
    const range = { start: d(5), end: d(12) }
    const events = [
      ev(d(6, 9), d(6, 10)),
      ev(d(6), d(7), { allDay: true, summary: 'allday' }),
      ev(d(8, 23), d(9, 1), { summary: 'late' }),
    ]
    const days = buildAgendaDays(
      range,
      events,
      [task(d(6, 17), { summary: 'todo' }), task(d(6), { dueAllDay: true, summary: 'anytime' })],
      d(9),
    )
    expect(days.map((x) => x.key)).toEqual(['2026-10-06', '2026-10-08', '2026-10-09'])
    expect(days[0]!.entries.map((e) => [e.kind, e.timeLabel])).toEqual([
      ['event', 'All day'],
      ['task', ''],
      ['event', '09:00 – 10:00'],
      ['task', '17:00'],
    ])
    expect(days[1]!.entries[0]!.timeLabel).toBe('23:00 – 24:00')
    expect(days[2]!.entries[0]!.timeLabel).toBe('00:00 – 01:00')
    expect(days[2]!.isToday).toBe(true)
  })
})

describe('slotFromOffset', () => {
  it('snaps to 30 minutes within the day', () => {
    expect(slotFromOffset(d(5), 635)).toEqual(d(5, 10, 30))
    expect(slotFromOffset(d(5), -10)).toEqual(d(5, 0, 0))
    expect(slotFromOffset(d(5), 99999)).toEqual(d(5, 23, 30))
  })
})
