import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'

import { applyAlarm, parseAlarm } from '../alarms'
import { parseCalendar } from '../common'
import { registerTimezones } from '../timezones'
import { APPLE_REMINDER, APPLE_STANDUP } from './fixtures'

describe('alarms', () => {
  it('reads a relative trigger as minutes before start', () => {
    const vevent = parseCalendar(APPLE_STANDUP.trim()).getFirstSubcomponent('vevent')!
    expect(parseAlarm(vevent)).toBe(10)
  })

  it('reads an absolute trigger (what Reminders writes) relative to DUE', () => {
    const cal = parseCalendar(APPLE_REMINDER.trim())
    registerTimezones(cal)
    const vtodo = cal.getFirstSubcomponent('vtodo')!
    expect(parseAlarm(vtodo)).toBe(60)
    applyAlarm(vtodo, 120)
    const alarm = vtodo.getFirstSubcomponent('valarm')!
    expect(alarm.getFirstProperty('trigger')!.toICALString()).toBe('TRIGGER:-PT2H')
    expect(alarm.getFirstPropertyValue('x-wr-alarmuid')).toBe(
      '9C6B5E1C-7F3D-4B2E-9B1A-000000000002',
    )
  })

  it('updates the existing Apple alarm in place, keeping its UIDs', () => {
    const vevent = parseCalendar(APPLE_STANDUP.trim()).getFirstSubcomponent('vevent')!
    applyAlarm(vevent, 30)
    const alarms = vevent.getAllSubcomponents('valarm')
    expect(alarms).toHaveLength(1)
    expect(alarms[0]!.getFirstProperty('trigger')!.toICALString()).toBe('TRIGGER:-PT30M')
    expect(alarms[0]!.getFirstPropertyValue('x-wr-alarmuid')).toBe(
      '1C6B5E1C-7F3D-4B2E-9B1A-000000000001',
    )
  })

  it('adds a DISPLAY alarm when none exists and removes all for null', () => {
    const c = new ICAL.Component('vevent')
    applyAlarm(c, 1440)
    const alarm = c.getFirstSubcomponent('valarm')!
    expect(alarm.getFirstPropertyValue('action')).toBe('DISPLAY')
    expect(alarm.getFirstProperty('trigger')!.toICALString()).toBe('TRIGGER:-P1D')
    expect(parseAlarm(c)).toBe(1440)
    applyAlarm(c, null)
    expect(c.getAllSubcomponents('valarm')).toHaveLength(0)
  })
})
