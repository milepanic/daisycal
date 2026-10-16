import ICAL from 'ical.js'
import { beforeEach, describe, expect, it } from 'vitest'

import { parseCalendar } from '../common'
import {
  _resetTimezones,
  ensureTimezone,
  offsetAt,
  registerTimezones,
  setTimeProperty,
  synthesizeVtimezone,
  toIcalTime,
  toJsDate,
  tzidOf,
  vtimezoneFor,
} from '../timezones'
import { APPLE_STANDUP, MISSING_VTIMEZONE } from './fixtures'

beforeEach(() => _resetTimezones())

describe('offsetAt', () => {
  it('knows DST for Belgrade and fixed offsets', () => {
    expect(offsetAt('Europe/Belgrade', new Date('2026-07-01T00:00:00Z'))).toBe(7200)
    expect(offsetAt('Europe/Belgrade', new Date('2026-12-01T00:00:00Z'))).toBe(3600)
    expect(offsetAt('Asia/Kolkata', new Date('2026-12-01T00:00:00Z'))).toBe(19800)
    expect(offsetAt('UTC', new Date())).toBe(0)
  })
})

describe('synthesizeVtimezone', () => {
  it('produces a VTIMEZONE that ical.js converts correctly across DST', () => {
    const vtz = synthesizeVtimezone('Europe/Belgrade', 2025, 2027)!
    expect(vtz.getFirstPropertyValue('tzid')).toBe('Europe/Belgrade')
    const zone = new ICAL.Timezone(vtz)
    const summer = ICAL.Time.fromData({ year: 2026, month: 7, day: 1, hour: 12 }, zone)
    const winter = ICAL.Time.fromData({ year: 2026, month: 12, day: 1, hour: 12 }, zone)
    expect(summer.toJSDate().toISOString()).toBe('2026-07-01T10:00:00.000Z')
    expect(winter.toJSDate().toISOString()).toBe('2026-12-01T11:00:00.000Z')
    // Exact transition: 2026-03-29 01:00Z Belgrade jumps to +02:00.
    const transitions = vtz
      .getAllSubcomponents()
      .map((c) => c.getFirstPropertyValue('dtstart')!.toString())
    expect(transitions).toContain('2026-03-29T02:00:00')
    expect(transitions).toContain('2026-10-25T03:00:00')
  })

  it('handles zones without DST and rejects unknown ids', () => {
    const vtz = synthesizeVtimezone('Asia/Tokyo', 2026, 2026)!
    expect(vtz.getAllSubcomponents()).toHaveLength(1)
    expect(synthesizeVtimezone('Mars/Olympus')).toBeNull()
  })
})

describe('registerTimezones / ensureTimezone', () => {
  it('registers VTIMEZONE from the file and resolves wall-clock times with it', () => {
    const cal = parseCalendar(APPLE_STANDUP.trim())
    registerTimezones(cal)
    expect(ICAL.TimezoneService.has('Europe/Belgrade')).toBe(true)
    const start = cal.getFirstSubcomponent('vevent')!.getFirstPropertyValue('dtstart') as ICAL.Time
    expect(toJsDate(start).toISOString()).toBe('2026-10-12T07:30:00.000Z')
    expect(tzidOf(start)).toBe('Europe/Belgrade')
    expect(vtimezoneFor('Europe/Belgrade')?.getFirstPropertyValue('tzid')).toBe('Europe/Belgrade')
  })

  it('synthesizes a TZID the file references but does not define', () => {
    const cal = parseCalendar(MISSING_VTIMEZONE.trim())
    registerTimezones(cal)
    const start = cal.getFirstSubcomponent('vevent')!.getFirstPropertyValue('dtstart') as ICAL.Time
    expect(toJsDate(start).toISOString()).toBe('2026-10-16T13:00:00.000Z')
    expect(vtimezoneFor('America/New_York')?.getFirstPropertyValue('x-daisycal-synthesized')).toBe(
      'TRUE',
    )
  })

  it('falls back to floating for nonsense ids', () => {
    expect(ensureTimezone('Nowhere/Land')).toBe(ICAL.Timezone.localTimezone)
  })
})

describe('toIcalTime / setTimeProperty', () => {
  it('writes TZID wall-clock, UTC and DATE values', () => {
    const comp = new ICAL.Component('vevent')
    const instant = new Date('2026-10-16T07:30:00Z')

    setTimeProperty(comp, 'dtstart', toIcalTime(instant, { tzid: 'Europe/Belgrade' }))
    expect(comp.getFirstProperty('dtstart')!.toICALString()).toBe(
      'DTSTART;TZID=Europe/Belgrade:20261016T093000',
    )

    setTimeProperty(comp, 'dtstart', toIcalTime(instant, { tzid: null }))
    expect(comp.getFirstProperty('dtstart')!.toICALString()).toBe('DTSTART:20261016T073000Z')

    setTimeProperty(comp, 'dtstart', toIcalTime(new Date(2026, 9, 16, 12), { allDay: true }))
    expect(comp.getFirstProperty('dtstart')!.toICALString()).toBe('DTSTART;VALUE=DATE:20261016')
  })

  it('round-trips through a different zone than the browser', () => {
    const instant = new Date('2026-10-16T13:00:00Z')
    const t = toIcalTime(instant, { tzid: 'America/New_York' })
    expect(t.toString()).toBe('2026-10-16T09:00:00')
    expect(toJsDate(t).getTime()).toBe(instant.getTime())
  })
})
