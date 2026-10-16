import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'

import { applyRepeat, describeRepeat, parseRepeat, type SimpleRepeat } from '../recurrence'
import { toIcalTime } from '../timezones'

const compWith = (rrule?: string) => {
  const c = new ICAL.Component('vevent')
  c.addPropertyWithValue('dtstart', ICAL.Time.fromString('2026-10-16T09:00:00', null as never))
  if (rrule) c.addPropertyWithValue('rrule', ICAL.Recur.fromString(rrule))
  return c
}

describe('parseRepeat', () => {
  it('maps simple rules', () => {
    expect(parseRepeat(compWith())).toBeNull()
    expect(parseRepeat(compWith('FREQ=DAILY'))).toMatchObject({
      kind: 'simple',
      freq: 'daily',
      interval: 1,
      byDay: [],
    })
    expect(parseRepeat(compWith('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'))).toMatchObject({
      kind: 'simple',
      freq: 'weekly',
      interval: 2,
      byDay: ['MO', 'WE'],
    })
    expect(parseRepeat(compWith('FREQ=YEARLY;COUNT=5'))).toMatchObject({ freq: 'yearly', count: 5 })
    const until = parseRepeat(compWith('FREQ=MONTHLY;UNTIL=20261231T225959Z')) as SimpleRepeat
    expect(until.until?.toISOString()).toBe('2026-12-31T22:59:59.000Z')
  })

  it('reports Apple-style rules it cannot edit as custom', () => {
    const custom = parseRepeat(compWith('FREQ=MONTHLY;BYDAY=-1FR'))
    expect(custom).toMatchObject({ kind: 'custom', rrule: 'FREQ=MONTHLY;BYDAY=-1FR' })
    expect(parseRepeat(compWith('FREQ=MONTHLY;BYMONTHDAY=1,15'))?.kind).toBe('custom')
    expect(parseRepeat(compWith('FREQ=HOURLY'))?.kind).toBe('custom')
  })
})

describe('applyRepeat', () => {
  it('writes RRULE with UNTIL as end of day UTC for timed events', () => {
    const c = compWith()
    const start = toIcalTime(new Date('2026-10-16T07:00:00Z'), { tzid: 'Europe/Belgrade' })
    applyRepeat(
      c,
      {
        kind: 'simple',
        freq: 'weekly',
        interval: 1,
        byDay: ['MO', 'FR'],
        until: new Date(2026, 11, 31),
        count: null,
      },
      start,
    )
    expect(c.getFirstProperty('rrule')!.toICALString()).toBe(
      'RRULE:FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20261231T225959Z',
    )
  })

  it('writes UNTIL as DATE for all-day events and COUNT otherwise', () => {
    const c = compWith()
    const start = toIcalTime(new Date(2026, 9, 16), { allDay: true })
    applyRepeat(
      c,
      {
        kind: 'simple',
        freq: 'daily',
        interval: 3,
        byDay: [],
        until: new Date(2026, 9, 30),
        count: null,
      },
      start,
    )
    expect(c.getFirstProperty('rrule')!.toICALString()).toBe(
      'RRULE:FREQ=DAILY;INTERVAL=3;UNTIL=20261030',
    )
    applyRepeat(
      c,
      { kind: 'simple', freq: 'monthly', interval: 1, byDay: [], until: null, count: 4 },
      start,
    )
    expect(c.getFirstProperty('rrule')!.toICALString()).toBe('RRULE:FREQ=MONTHLY;COUNT=4')
  })

  it('leaves custom rules alone and removes rules for null', () => {
    const c = compWith('FREQ=MONTHLY;BYDAY=-1FR')
    c.addPropertyWithValue('exdate', ICAL.Time.fromString('2026-10-30T09:00:00', null as never))
    applyRepeat(
      c,
      { kind: 'custom', rrule: 'x', summary: 'x' },
      c.getFirstPropertyValue('dtstart') as ICAL.Time,
    )
    expect(c.getFirstProperty('rrule')!.toICALString()).toBe('RRULE:FREQ=MONTHLY;BYDAY=-1FR')
    applyRepeat(c, null, c.getFirstPropertyValue('dtstart') as ICAL.Time)
    expect(c.hasProperty('rrule')).toBe(false)
    expect(c.hasProperty('exdate')).toBe(false)
  })
})

describe('describeRepeat', () => {
  it('labels rules', () => {
    expect(describeRepeat(null)).toBe('Does not repeat')
    expect(
      describeRepeat({
        kind: 'simple',
        freq: 'weekly',
        interval: 2,
        byDay: ['MO'],
        until: null,
        count: null,
      }),
    ).toBe('Every 2 weeks on MO')
    expect(describeRepeat({ kind: 'custom', rrule: '', summary: 'Custom (monthly)' })).toBe(
      'Custom (monthly)',
    )
  })
})
