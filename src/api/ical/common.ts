import ICAL from 'ical.js'

export const PRODID = '-//DaisyCal//EN'

/** Parses iCalendar text into a VCALENDAR component. */
export function parseCalendar(ics: string): ICAL.Component {
  const comp = new ICAL.Component(ICAL.parse(ics))
  if (comp.name !== 'vcalendar') throw new Error(`Expected VCALENDAR, got ${comp.name}`)
  return comp
}

/** New VCALENDAR with DaisyCal's PRODID. */
export function createCalendar(): ICAL.Component {
  const comp = new ICAL.Component('vcalendar')
  comp.addPropertyWithValue('version', '2.0')
  comp.addPropertyWithValue('prodid', PRODID)
  comp.addPropertyWithValue('calscale', 'GREGORIAN')
  return comp
}

export function text(comp: ICAL.Component, name: string): string {
  const value = comp.getFirstPropertyValue(name)
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

/** Sets a text property, or removes it when the value is empty. */
export function setText(comp: ICAL.Component, name: string, value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  if (trimmed) comp.updatePropertyWithValue(name, trimmed)
  else comp.removeAllProperties(name)
}

export function nowUtc(): ICAL.Time {
  return ICAL.Time.fromJSDate(new Date(), true)
}
