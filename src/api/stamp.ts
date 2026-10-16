import ICAL from 'ical.js'

/** RFC 4122 UID for new events and tasks. */
export function newUid(): string {
  return crypto.randomUUID()
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
