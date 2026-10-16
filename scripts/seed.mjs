#!/usr/bin/env node
// Seeds the local development Radicale (docker-compose.dev.yml) with test collections
// and sample events/tasks. Idempotent: existing seed collections are deleted and recreated.
//
//   RADICALE_URL=http://localhost:5232 RADICALE_USER=daisy RADICALE_PASSWORD=daisy node scripts/seed.mjs

import { randomUUID } from 'node:crypto'

const BASE = (process.env.RADICALE_URL ?? 'http://localhost:5232').replace(/\/$/, '')
const USER = process.env.RADICALE_USER ?? 'daisy'
const PASSWORD = process.env.RADICALE_PASSWORD ?? 'daisy'
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64')

// ---------------------------------------------------------------------------
// Collections. Mirrors the mockup sidebar; "mixed" and "contacts" exist only to
// verify that the app ignores unsupported collection types (CHECKLIST.md §0).
// ---------------------------------------------------------------------------
const COLLECTIONS = [
  { id: 'personal', name: 'Personal', color: '#566c86', components: ['VEVENT'] },
  { id: 'apartment', name: 'Apartment', color: '#7c94b8', components: ['VEVENT'] },
  { id: 'birthdays', name: 'Birthdays', color: '#2a4d88', components: ['VEVENT'] },
  { id: 'travel', name: 'Events & Travel', color: '#8094aa', components: ['VEVENT'] },
  { id: 'work', name: 'Work', color: '#225688', components: ['VEVENT'] },
  { id: 'my-tasks', name: 'My tasks', color: '#7c3aed', components: ['VTODO'] },
  { id: 'shopping', name: 'Shopping', color: '#0ea5e9', components: ['VTODO'] },
  { id: 'mixed', name: 'Mixed (unsupported)', color: '#999999', components: ['VEVENT', 'VTODO'] },
  { id: 'contacts', name: 'Contacts (unsupported)', addressbook: true },
]

// ---------------------------------------------------------------------------
// Date helpers. Everything is relative to "now" so the seed stays useful.
// ---------------------------------------------------------------------------
const TZID = 'Europe/Belgrade'
const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))

/** Local date `days` after the start of the current week at `h:m`. */
const at = (days, h = 0, m = 0) =>
  new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + days, h, m)
const fmtLocal = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
const fmtDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
const fmtUtc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const stamp = fmtUtc(now)

// VTIMEZONE as Apple Calendar writes it for Europe/Belgrade.
const VTIMEZONE = `BEGIN:VTIMEZONE
TZID:Europe/Belgrade
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
DTSTART:19810329T020000
TZNAME:CEST
TZOFFSETTO:+0200
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
DTSTART:19961027T030000
TZNAME:CET
TZOFFSETTO:+0100
END:STANDARD
END:VTIMEZONE`

const wrap = (body, { prodid = '-//DaisyCal seed//EN', tz = true } = {}) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${prodid}`, 'CALSCALE:GREGORIAN', tz ? VTIMEZONE : null, body, 'END:VCALENDAR']
    .filter(Boolean)
    .join('\r\n') + '\r\n'

function event({ uid = randomUUID(), summary, start, end, allDay = false, days = 1, extra = [] }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${summary}`]
  if (allDay) {
    const endDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days)
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(start)}`, `DTEND;VALUE=DATE:${fmtDate(endDate)}`)
  } else {
    lines.push(`DTSTART;TZID=${TZID}:${fmtLocal(start)}`, `DTEND;TZID=${TZID}:${fmtLocal(end)}`)
  }
  lines.push(...extra, 'END:VEVENT')
  return { uid, ics: wrap(lines.join('\r\n')) }
}

function todo({ uid = randomUUID(), summary, due, completed = false, priority, description, extra = [] }) {
  const lines = ['BEGIN:VTODO', `UID:${uid}`, `DTSTAMP:${stamp}`, `CREATED:${stamp}`, `SUMMARY:${summary}`]
  if (due) lines.push(`DUE;TZID=${TZID}:${fmtLocal(due)}`)
  if (priority) lines.push(`PRIORITY:${priority}`)
  if (description) lines.push(`DESCRIPTION:${description}`)
  if (completed) lines.push('STATUS:COMPLETED', `COMPLETED:${fmtUtc(at(1, 9))}`, 'PERCENT-COMPLETE:100')
  else lines.push('STATUS:NEEDS-ACTION')
  lines.push(...extra, 'END:VTODO')
  return { uid, ics: wrap(lines.join('\r\n'), { tz: Boolean(due) }) }
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------
const APPLE_PRODID = '-//Apple Inc.//iOS 26.0//EN'

// A recurring Apple-style event with one modified instance (RECURRENCE-ID) and one EXDATE.
const standupUid = randomUUID()
const standupMaster = [
  'BEGIN:VEVENT',
  `UID:${standupUid}`,
  `DTSTAMP:${stamp}`,
  `CREATED:${stamp}`,
  `LAST-MODIFIED:${stamp}`,
  'SUMMARY:Daily standup',
  `DTSTART;TZID=${TZID}:${fmtLocal(at(0, 9, 30))}`,
  `DTEND;TZID=${TZID}:${fmtLocal(at(0, 9, 45))}`,
  'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  `EXDATE;TZID=${TZID}:${fmtLocal(at(3, 9, 30))}`,
  'SEQUENCE:2',
  'TRANSP:OPAQUE',
  'X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'DESCRIPTION:Reminder',
  'TRIGGER:-PT10M',
  'X-WR-ALARMUID:' + randomUUID().toUpperCase(),
  'UID:' + randomUUID().toUpperCase(),
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  `UID:${standupUid}`,
  `DTSTAMP:${stamp}`,
  `RECURRENCE-ID;TZID=${TZID}:${fmtLocal(at(1, 9, 30))}`,
  'SUMMARY:Daily standup (moved)',
  `DTSTART;TZID=${TZID}:${fmtLocal(at(1, 11, 0))}`,
  `DTEND;TZID=${TZID}:${fmtLocal(at(1, 11, 15))}`,
  'SEQUENCE:3',
  'END:VEVENT',
].join('\r\n')

const EVENTS = {
  work: [
    { uid: standupUid, ics: wrap(standupMaster, { prodid: APPLE_PRODID }) },
    event({ summary: 'Sprint planning', start: at(0, 13, 0), end: at(0, 15, 0), extra: ['LOCATION:Room 4B', 'DESCRIPTION:Plan the next two weeks.'] }),
    event({ summary: 'Client call', start: at(2, 16, 0), end: at(2, 17, 0), extra: ['X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-TITLE=Office:geo:44.787,20.457'] }),
    event({ summary: 'Design review', start: at(4, 10, 0), end: at(4, 11, 30) }),
    event({ summary: 'Company offsite', start: at(7), allDay: true, days: 2 }),
    event({ summary: 'Team lunch', start: at(2, 12, 0), end: at(2, 13, 0) }),
    event({ summary: '1:1 with manager', start: at(2, 12, 30), end: at(2, 13, 15) }),
  ],
  personal: [
    event({ summary: 'Gym', start: at(0, 7, 0), end: at(0, 8, 0), extra: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'] }),
    event({ summary: 'Dentist', start: at(3, 15, 0), end: at(3, 16, 0), extra: ['LOCATION:Dr. Petrović'] }),
    event({ summary: 'Dinner with friends', start: at(5, 19, 30), end: at(5, 22, 0) }),
    event({ summary: 'Lazy Sunday', start: at(6), allDay: true }),
  ],
  apartment: [
    event({ summary: 'Plumber visit', start: at(1, 8, 0), end: at(1, 10, 0) }),
    event({ summary: 'Rent due', start: at(14), allDay: true, extra: ['RRULE:FREQ=MONTHLY'] }),
  ],
  birthdays: [
    event({ summary: "Ana's birthday", start: at(4), allDay: true, extra: ['RRULE:FREQ=YEARLY'] }),
    event({ summary: "Marko's birthday", start: at(12), allDay: true, extra: ['RRULE:FREQ=YEARLY'] }),
  ],
  travel: [
    event({ summary: 'Trip to Vienna', start: at(9), allDay: true, days: 4 }),
    event({ summary: 'Flight BEG → VIE', start: at(9, 6, 45), end: at(9, 8, 10), extra: ['LOCATION:Belgrade Airport'] }),
    event({ summary: 'Concert', start: at(-3, 20, 0), end: at(-3, 23, 0) }),
  ],
  mixed: [event({ summary: 'Should not appear (mixed collection)', start: at(2, 9, 0), end: at(2, 10, 0) })],
}

const TODOS = {
  'my-tasks': [
    todo({ summary: 'Send invoice', due: at(1, 17, 0), priority: 1 }),
    todo({ summary: 'Reply to emails', due: at(2, 12, 0), priority: 5 }),
    todo({ summary: 'Update roadmap', due: at(4, 18, 0) }),
    todo({ summary: 'Prepare slides', due: at(8, 9, 0), description: 'For the quarterly review.' }),
    todo({ summary: 'Plan Q4 goals', priority: 9 }),
    todo({ summary: 'Water the plants' }),
    todo({ summary: 'Book dentist appointment', completed: true, due: at(-2, 10, 0) }),
    todo({ summary: 'Overdue report', due: at(-1, 16, 0), priority: 1 }),
  ],
  shopping: [
    todo({ summary: 'Order printer ink', due: at(3, 12, 0) }),
    todo({ summary: 'Pick up package' }),
    todo({ summary: 'Birthday gift for Ana', due: at(3, 20, 0), priority: 5, extra: ['X-APPLE-SORT-ORDER:745000000'] }),
    todo({ summary: 'Buy groceries', completed: true }),
  ],
  mixed: [todo({ summary: 'Should not appear (mixed collection)' })],
}

// ---------------------------------------------------------------------------
// DAV helpers
// ---------------------------------------------------------------------------
async function dav(method, path, { headers = {}, body } = {}) {
  const init = { method, headers: { Authorization: AUTH, ...headers } }
  if (body !== undefined) init.body = body
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok && res.status !== 404 && res.status !== 207) {
    throw new Error(`${method} ${path} → ${res.status} ${res.statusText}\n${await res.text()}`)
  }
  return res
}

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function mkcolBody(c) {
  const resourcetype = c.addressbook
    ? '<D:collection/><CR:addressbook/>'
    : '<D:collection/><C:calendar/>'
  const components = c.addressbook
    ? ''
    : `<C:supported-calendar-component-set>${c.components.map((n) => `<C:comp name="${n}"/>`).join('')}</C:supported-calendar-component-set>`
  const color = c.color ? `<ICAL:calendar-color>${c.color}</ICAL:calendar-color>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CR="urn:ietf:params:xml:ns:carddav" xmlns:ICAL="http://apple.com/ns/ical/">
  <D:set><D:prop>
    <D:resourcetype>${resourcetype}</D:resourcetype>
    <D:displayname>${xml(c.name)}</D:displayname>
    ${components}${color}
  </D:prop></D:set>
</D:mkcol>`
}

async function main() {
  const probe = await fetch(`${BASE}/${USER}/`, { method: 'PROPFIND', headers: { Authorization: AUTH, Depth: '0' } })
  if (probe.status === 401) throw new Error(`Login failed for '${USER}' at ${BASE}`)
  if (probe.status !== 207) throw new Error(`Unexpected ${probe.status} from ${BASE}/${USER}/ (is Radicale running?)`)

  let items = 0
  for (const c of COLLECTIONS) {
    const path = `/${USER}/${c.id}/`
    await dav('DELETE', path)
    await dav('MKCOL', path, { headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body: mkcolBody(c) })
    const objects = [...(EVENTS[c.id] ?? []), ...(TODOS[c.id] ?? [])]
    for (const { uid, ics } of objects) {
      await dav('PUT', `${path}${uid}.ics`, {
        headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*' },
        body: ics,
      })
      items++
    }
    console.log(`✓ ${c.name.padEnd(24)} ${String(objects.length).padStart(2)} items`)
  }
  console.log(`\nSeeded ${COLLECTIONS.length} collections, ${items} items at ${BASE}/${USER}/`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
