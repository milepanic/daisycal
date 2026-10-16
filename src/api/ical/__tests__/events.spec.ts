import { beforeEach, describe, expect, it } from 'vitest'

import {
  buildEventIcs,
  eventToForm,
  excludeOccurrenceIcs,
  expandEvent,
  expandEvents,
  parseEventObject,
  updateEventIcs,
} from '../events'
import { _resetTimezones } from '../timezones'
import {
  ALL_DAY_MULTI,
  APPLE_STANDUP,
  MISSING_VTIMEZONE,
  MOVED_FROM_OUTSIDE,
  NO_DTEND,
  WITH_DURATION,
  YEARLY_ALLDAY,
  obj,
} from './fixtures'

beforeEach(() => _resetTimezones())

// Week of Mon 2026-10-12 .. Sun 2026-10-18, browser-local (Europe/Belgrade in vitest config).
const WEEK_START = new Date(2026, 9, 12)
const WEEK_END = new Date(2026, 9, 19)

describe('parseEventObject', () => {
  it('keeps the component tree and links overrides to the master', () => {
    const doc = parseEventObject(obj(APPLE_STANDUP))
    expect(doc.uid).toBe('standup-uid')
    expect(doc.isRecurring).toBe(true)
    expect(Object.keys(doc.master.exceptions)).toHaveLength(1)
    expect(doc.master.component.getFirstPropertyValue('x-apple-travel-advisory-behavior')).toBe(
      'AUTOMATIC',
    )
  })
})

describe('expandEvent', () => {
  it('expands a weekday rule, honours EXDATE and applies the moved override', () => {
    const doc = parseEventObject(obj(APPLE_STANDUP))
    const instances = expandEvent(doc, WEEK_START, WEEK_END)
    // Mon, Tue (moved), Wed, Fri – Thursday is EXDATEd.
    expect(instances.map((i) => i.start.toISOString())).toEqual([
      '2026-10-12T07:30:00.000Z',
      '2026-10-13T09:00:00.000Z',
      '2026-10-14T07:30:00.000Z',
      '2026-10-16T07:30:00.000Z',
    ])
    const moved = instances[1]!
    expect(moved.summary).toBe('Daily standup (moved)')
    expect(moved.isException).toBe(true)
    expect(moved.end.toISOString()).toBe('2026-10-13T09:15:00.000Z')
    expect(moved.recurrenceId?.toString()).toBe('2026-10-13T09:30:00')
    const regular = instances[0]!
    expect(regular.isException).toBe(false)
    expect(regular.isRecurring).toBe(true)
    expect(regular.end.toISOString()).toBe('2026-10-12T07:45:00.000Z')
    expect(regular.alarm).toBe(10)
    expect(regular.tzid).toBe('Europe/Belgrade')
    expect(regular.repeat).toMatchObject({
      kind: 'simple',
      freq: 'weekly',
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
    })
    expect(instances.every((i) => i.uid === 'standup-uid' && i.etag === '"e1"')).toBe(true)
  })

  it('includes overrides moved into the range from a later occurrence', () => {
    const doc = parseEventObject(obj(MOVED_FROM_OUTSIDE))
    const instances = expandEvent(doc, WEEK_START, WEEK_END)
    expect(instances.map((i) => [i.summary, i.start.toISOString()])).toEqual([
      ['Weekly sync', '2026-10-12T08:00:00.000Z'],
      ['Weekly sync (early)', '2026-10-16T13:00:00.000Z'],
    ])
    // ...and does not show it at its original slot the week after.
    const nextWeek = expandEvent(doc, new Date(2026, 9, 26), new Date(2026, 10, 2))
    expect(nextWeek).toHaveLength(0)
  })

  it('handles all-day multi-day events with exclusive DTEND', () => {
    const [e] = expandEvent(parseEventObject(obj(ALL_DAY_MULTI)), WEEK_START, new Date(2026, 9, 26))
    expect(e).toMatchObject({ allDay: true, summary: 'Company offsite', tzid: null })
    expect(e!.start).toEqual(new Date(2026, 9, 19))
    expect(e!.end).toEqual(new Date(2026, 9, 21))
    // Not in a range that ends on its first day.
    expect(
      expandEvent(parseEventObject(obj(ALL_DAY_MULTI)), WEEK_START, new Date(2026, 9, 19)),
    ).toHaveLength(0)
  })

  it('defaults the end for events without DTEND and uses DURATION when present', () => {
    const [ping] = expandEvent(parseEventObject(obj(NO_DTEND)), WEEK_START, WEEK_END)
    expect(ping!.end.getTime() - ping!.start.getTime()).toBe(60 * 60 * 1000)
    const [workshop] = expandEvent(parseEventObject(obj(WITH_DURATION)), WEEK_START, WEEK_END)
    expect(workshop!.end.toISOString()).toBe('2026-10-16T14:30:00.000Z')
  })

  it('resolves a TZID without VTIMEZONE via Intl', () => {
    const [e] = expandEvent(parseEventObject(obj(MISSING_VTIMEZONE)), WEEK_START, WEEK_END)
    expect(e!.start.toISOString()).toBe('2026-10-16T13:00:00.000Z')
    expect(e!.tzid).toBe('America/New_York')
  })

  it('expands yearly all-day rules decades after DTSTART', () => {
    const [bday] = expandEvent(
      parseEventObject(obj(YEARLY_ALLDAY)),
      new Date(2026, 3, 1),
      new Date(2026, 4, 1),
    )
    expect(bday!.start).toEqual(new Date(2026, 3, 16))
    expect(bday!.allDay).toBe(true)
    expect(bday!.recurrenceId?.toString()).toBe('2026-04-16')
  })

  it('expandEvents merges and sorts across documents', () => {
    const all = expandEvents(
      [parseEventObject(obj(NO_DTEND)), parseEventObject(obj(APPLE_STANDUP))],
      WEEK_START,
      WEEK_END,
    )
    expect(all.map((i) => i.summary)).toEqual([
      'Daily standup',
      'Daily standup (moved)',
      'Daily standup',
      'Daily standup',
      'Ping',
    ])
  })
})

describe('buildEventIcs', () => {
  it('writes a timed event with the browser zone and its VTIMEZONE', () => {
    const { uid, ics } = buildEventIcs({
      summary: 'Lunch',
      description: '',
      location: 'Cafe',
      start: new Date('2026-10-16T10:00:00Z'),
      end: new Date('2026-10-16T11:00:00Z'),
      allDay: false,
      tzid: 'Europe/Belgrade',
      repeat: { kind: 'simple', freq: 'weekly', interval: 1, byDay: [], until: null, count: null },
      alarm: 15,
    })
    expect(ics).toContain(`UID:${uid}`)
    expect(ics).toContain('PRODID:-//DaisyCal//EN')
    expect(ics).toContain('DTSTART;TZID=Europe/Belgrade:20261016T120000')
    expect(ics).toContain('DTEND;TZID=Europe/Belgrade:20261016T130000')
    expect(ics).toContain('LOCATION:Cafe')
    expect(parseEventObject(obj(ics)).master.description).toBeFalsy()
    expect(ics).toContain('RRULE:FREQ=WEEKLY')
    expect(ics).toContain('TRIGGER:-PT15M')
    expect(ics).toContain('SEQUENCE:0')
    expect(ics).toContain('BEGIN:VTIMEZONE')
    expect(ics).toContain('TZID:Europe/Belgrade')
    // Round-trips.
    const [e] = expandEvent(parseEventObject(obj(ics)), WEEK_START, WEEK_END)
    expect(e!.start.toISOString()).toBe('2026-10-16T10:00:00.000Z')
  })

  it('writes an all-day event without VTIMEZONE', () => {
    const { ics } = buildEventIcs({
      summary: 'Holiday',
      description: 'Long weekend',
      location: '',
      start: new Date(2026, 9, 17),
      end: new Date(2026, 9, 19),
      allDay: true,
      repeat: null,
      alarm: null,
    })
    expect(ics).toContain('DTSTART;VALUE=DATE:20261017')
    expect(ics).toContain('DTEND;VALUE=DATE:20261019')
    expect(ics).not.toContain('VTIMEZONE')
    expect(ics).not.toContain('VALARM')
  })
})

describe('updateEventIcs', () => {
  it('edits only form fields and preserves Apple properties, alarm UIDs and overrides', () => {
    const doc = parseEventObject(obj(APPLE_STANDUP))
    const [first] = expandEvent(doc, WEEK_START, WEEK_END)
    const form = { ...eventToForm(first!), summary: 'Standup', location: 'Zoom', alarm: 5 }
    const ics = updateEventIcs(doc, form, first, 'all')
    expect(ics).toContain('SUMMARY:Standup')
    expect(ics).toContain('LOCATION:Zoom')
    expect(ics).toContain('X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC')
    expect(ics).toContain('X-WR-ALARMUID:1C6B5E1C-7F3D-4B2E-9B1A-000000000001')
    expect(ics).toContain('TRIGGER:-PT5M')
    expect(ics).toContain('EXDATE;TZID=Europe/Belgrade:20261015T093000')
    expect(ics).toContain('RECURRENCE-ID;TZID=Europe/Belgrade:20261013T093000')
    expect(ics).toContain('SUMMARY:Daily standup (moved)')
    expect(ics).toContain('SEQUENCE:3')
    expect(ics).toContain('PRODID:-//Apple Inc.//iOS 26.0//EN')
    // Master DTSTART untouched because the time did not change.
    expect(ics).toContain('DTSTART;TZID=Europe/Belgrade:20261012T093000')
  })

  it('shifts the whole series when editing a later occurrence with scope all', () => {
    const doc = parseEventObject(obj(APPLE_STANDUP))
    const wed = expandEvent(doc, WEEK_START, WEEK_END)[2]!
    const form = eventToForm(wed)
    form.start = new Date(wed.start.getTime() + 30 * 60 * 1000)
    form.end = new Date(form.start.getTime() + 20 * 60 * 1000)
    const ics = updateEventIcs(doc, form, wed, 'all')
    expect(ics).toContain('DTSTART;TZID=Europe/Belgrade:20261012T100000')
    expect(ics).toContain('DTEND;TZID=Europe/Belgrade:20261012T102000')
  })

  it('creates a RECURRENCE-ID override for scope this', () => {
    const doc = parseEventObject(obj(APPLE_STANDUP))
    const fri = expandEvent(doc, WEEK_START, WEEK_END)[3]!
    const form = { ...eventToForm(fri), summary: 'Standup (Friday retro)' }
    form.start = new Date('2026-10-16T12:00:00Z')
    form.end = new Date('2026-10-16T13:00:00Z')
    const ics = updateEventIcs(doc, form, fri, 'this')
    const next = parseEventObject(obj(ics))
    expect(Object.keys(next.master.exceptions)).toHaveLength(2)
    const instances = expandEvent(next, WEEK_START, WEEK_END)
    const retro = instances.find((i) => i.summary === 'Standup (Friday retro)')!
    expect(retro.start.toISOString()).toBe('2026-10-16T12:00:00.000Z')
    expect(retro.isException).toBe(true)
    expect(ics).toContain('RECURRENCE-ID;TZID=Europe/Belgrade:20261016T093000')
    // Master rule unchanged.
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    expect(instances).toHaveLength(4)
  })

  it('edits an existing override in place for scope this', () => {
    const doc = parseEventObject(obj(APPLE_STANDUP))
    const moved = expandEvent(doc, WEEK_START, WEEK_END)[1]!
    const ics = updateEventIcs(
      doc,
      { ...eventToForm(moved), summary: 'Moved again' },
      moved,
      'this',
    )
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('SUMMARY:Moved again')
    expect(ics).toContain('SUMMARY:Daily standup\r\n')
  })
})

describe('excludeOccurrenceIcs', () => {
  it('adds EXDATE and drops the override for that occurrence', () => {
    const doc = parseEventObject(obj(APPLE_STANDUP))
    const moved = expandEvent(doc, WEEK_START, WEEK_END)[1]!
    const ics = excludeOccurrenceIcs(doc, moved)
    expect(ics).toContain('EXDATE;TZID=Europe/Belgrade:20261013T093000')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(expandEvent(parseEventObject(obj(ics)), WEEK_START, WEEK_END)).toHaveLength(3)
  })
})
