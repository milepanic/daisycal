import { describe, expect, it } from 'vitest'

import { newUid, stampForWrite } from '../stamp'

describe('stampForWrite', () => {
  it('sets DTSTAMP and LAST-MODIFIED on VEVENT and VTODO, preserving everything else', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Apple Inc.//iOS 26.0//EN',
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Belgrade',
      'BEGIN:STANDARD',
      'DTSTART:19961027T030000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:1',
      'DTSTAMP:20200101T000000Z',
      'DTSTART;TZID=Europe/Belgrade:20261016T090000',
      'SUMMARY:Old',
      'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-TITLE=Office:geo:44.787,20.457',
      'BEGIN:VALARM',
      'TRIGGER:-PT10M',
      'ACTION:DISPLAY',
      'END:VALARM',
      'END:VEVENT',
      'BEGIN:VTODO',
      'UID:2',
      'SUMMARY:Task',
      'END:VTODO',
      'END:VCALENDAR',
      '',
    ].join('\r\n')

    const out = stampForWrite(ics, new Date('2026-10-16T12:34:56Z'))
    expect(out.match(/DTSTAMP:20261016T123456Z/g)).toHaveLength(2)
    expect(out.match(/LAST-MODIFIED:20261016T123456Z/g)).toHaveLength(2)
    expect(out).not.toContain('20200101T000000Z')
    expect(out).toContain('PRODID:-//Apple Inc.//iOS 26.0//EN')
    expect(out).toContain('TZID:Europe/Belgrade')
    expect(out).toContain('DTSTART;TZID=Europe/Belgrade:20261016T090000')
    // ical.js may reorder parameters; the property and its value must survive.
    expect(out).toMatch(
      /X-APPLE-STRUCTURED-LOCATION;(VALUE=URI;X-TITLE=Office|X-TITLE=Office;VALUE=URI):geo:44\.787,20\.457/,
    )
    expect(out).toContain('TRIGGER:-PT10M')
  })
})

describe('newUid', () => {
  it('returns distinct RFC 4122 UUIDs', () => {
    const a = newUid()
    const b = newUid()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })
})
