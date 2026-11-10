import ICAL from 'ical.js'

/**
 * RFC 4122 version 4 UUID for new events, tasks and alarms.
 *
 * `crypto.randomUUID` only exists in secure contexts (HTTPS or localhost), so opening the app
 * over plain HTTP (e.g. `http://192.168.1.9:3035`) would break creating anything.
 * `crypto.getRandomValues` is available everywhere.
 */
export function newUid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40 // version 4
  b[8] = (b[8]! & 0x3f) | 0x80 // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * Sets `DTSTAMP` and `LAST-MODIFIED` on every VEVENT/VTODO in the given iCalendar text.
 * Round-trips through ical.js, so every other property (incl. X-APPLE-*) is preserved.
 */
export function stampForWrite(ics: string, now: Date = new Date()): string {
  const vcalendar = new ICAL.Component(ICAL.parse(ics))
  const stamp = ICAL.Time.fromJSDate(now, true)
  for (const name of ['vevent', 'vtodo'] as const) {
    for (const comp of vcalendar.getAllSubcomponents(name)) {
      comp.updatePropertyWithValue('dtstamp', stamp.clone())
      comp.updatePropertyWithValue('last-modified', stamp.clone())
    }
  }
  return vcalendar.toString()
}
