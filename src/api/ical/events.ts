/**
 * VEVENT <-> domain mapping. Parsed objects keep their ical.js component tree so edits touch
 * only the fields the form knows about and every other property (X-APPLE-*, ATTACH, Apple's
 * VALARM UIDs, ...) survives a round trip to Radicale and back to the phone.
 */
import ICAL from 'ical.js'

import type { CalendarObject } from '../caldav'
import { createCalendar, nowUtc, parseCalendar, setText, text } from './common'
import { type AlarmMinutes, applyAlarm, parseAlarm } from './alarms'
import { type RepeatRule, applyRepeat, parseRepeat } from './recurrence'
import {
  browserTimeZone,
  registerTimezones,
  setTimeProperty,
  toIcalTime,
  toJsDate,
  tzidOf,
  vtimezoneFor,
} from './timezones'

/** Default length for events that have neither DTEND nor DURATION. */
export const DEFAULT_EVENT_MINUTES = 60
/** Safety cap when expanding runaway rules. */
const MAX_OCCURRENCES = 2000

/** Same instant, regardless of the zone each value is expressed in (UTC vs TZID). */
function sameInstant(a: ICAL.Time | null | undefined, b: ICAL.Time | null | undefined): boolean {
  if (!a || !b) return false
  return a.isDate === b.isDate && a.toUnixTime() === b.toUnixTime()
}

function findOverride(
  vcalendar: ICAL.Component,
  recurrenceId: ICAL.Time,
): ICAL.Component | undefined {
  return vcalendar.getAllSubcomponents('vevent').find((v) => {
    const rid = v.getFirstPropertyValue('recurrence-id')
    return rid instanceof ICAL.Time && sameInstant(rid, recurrenceId)
  })
}

/** A parsed `.ics` holding one event (master + any RECURRENCE-ID overrides). */
export interface EventDocument {
  object: CalendarObject
  vcalendar: ICAL.Component
  master: ICAL.Event
  uid: string
  isRecurring: boolean
}

/** One occurrence as shown in the calendar. */
export interface EventInstance {
  uid: string
  objectUrl: string
  collectionUrl: string
  etag: string
  summary: string
  description: string
  location: string
  start: Date
  /** Exclusive. For all-day events this is midnight after the last day. */
  end: Date
  allDay: boolean
  tzid: string | null
  /** Set on every occurrence of a recurring event (the RECURRENCE-ID this instance has/would have). */
  recurrenceId: ICAL.Time | null
  /** True when this occurrence comes from a RECURRENCE-ID override component. */
  isException: boolean
  isRecurring: boolean
  repeat: RepeatRule | null
  alarm: AlarmMinutes
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED' | null
}

/** What the create/edit form edits. */
export interface EventForm {
  summary: string
  description: string
  location: string
  start: Date
  /** Exclusive end. All-day: local midnight after the last day. */
  end: Date
  allDay: boolean
  /** IANA zone for timed events; defaults to the browser's. */
  tzid?: string | null
  repeat: RepeatRule | null
  alarm: AlarmMinutes
}

export function parseEventObject(object: CalendarObject): EventDocument {
  const vcalendar = parseCalendar(object.data)
  registerTimezones(vcalendar)
  const vevents = vcalendar.getAllSubcomponents('vevent')
  if (vevents.length === 0) throw new Error(`No VEVENT in ${object.url}`)
  const masterComp = vevents.find((v) => !v.hasProperty('recurrence-id')) ?? vevents[0]!
  const master = new ICAL.Event(masterComp, { strictExceptions: false })
  for (const v of vevents) {
    if (v !== masterComp && v.hasProperty('recurrence-id')) master.relateException(v)
  }
  return {
    object,
    vcalendar,
    master,
    uid: master.uid ?? text(masterComp, 'uid'),
    isRecurring: master.isRecurring(),
  }
}

function endOf(event: ICAL.Event): ICAL.Time {
  const start = event.startDate
  const end = event.endDate
  if (end.compare(start) > 0) return end
  const fixed = start.clone()
  if (start.isDate) fixed.adjust(1, 0, 0, 0)
  else fixed.adjust(0, 0, DEFAULT_EVENT_MINUTES, 0)
  return fixed
}

function statusOf(comp: ICAL.Component): EventInstance['status'] {
  const s = text(comp, 'status').toUpperCase()
  return s === 'CONFIRMED' || s === 'TENTATIVE' || s === 'CANCELLED' ? s : null
}

function instanceFrom(
  doc: EventDocument,
  item: ICAL.Event,
  start: ICAL.Time,
  end: ICAL.Time,
  recurrenceId: ICAL.Time | null,
): EventInstance {
  const comp = item.component
  return {
    uid: doc.uid,
    objectUrl: doc.object.url,
    collectionUrl: doc.object.collectionUrl,
    etag: doc.object.etag,
    summary: item.summary ?? '',
    description: item.description ?? '',
    location: item.location ?? '',
    start: toJsDate(start),
    end: toJsDate(end),
    allDay: start.isDate,
    tzid: tzidOf(start),
    recurrenceId,
    isException: item !== doc.master,
    isRecurring: doc.isRecurring,
    repeat: parseRepeat(doc.master.component),
    alarm: parseAlarm(comp),
    status: statusOf(comp),
  }
}

/**
 * All occurrences of the event overlapping [rangeStart, rangeEnd). Handles RRULE, RDATE,
 * EXDATE and RECURRENCE-ID overrides (including ones moved into the range from outside it).
 */
export function expandEvent(doc: EventDocument, rangeStart: Date, rangeEnd: Date): EventInstance[] {
  const overlaps = (s: Date, e: Date) => s < rangeEnd && e > rangeStart
  const { master } = doc

  if (!doc.isRecurring) {
    const s = master.startDate
    const e = endOf(master)
    return overlaps(toJsDate(s), toJsDate(e)) ? [instanceFrom(doc, master, s, e, null)] : []
  }

  const out: EventInstance[] = []
  const seen = new Set<number>()
  const iterator = master.iterator()
  let next: ICAL.Time | null
  let guard = 0
  while ((next = iterator.next()) && guard++ < MAX_OCCURRENCES) {
    if (toJsDate(next) >= rangeEnd) break
    const details = master.getOccurrenceDetails(next)
    const item = details.item
    const start = details.startDate
    const end = item === master ? shiftedEnd(master, start) : endOf(item)
    seen.add(next.toUnixTime())
    if (overlaps(toJsDate(start), toJsDate(end)))
      out.push(instanceFrom(doc, item, start, end, next))
  }

  // Overrides whose original occurrence lies beyond the iterated range but which were moved
  // into it (e.g. next week's standup pulled into this week).
  for (const exception of Object.values(master.exceptions)) {
    const rid = exception.recurrenceId
    if (!rid || seen.has(rid.toUnixTime())) continue
    const s = exception.startDate
    const e = endOf(exception)
    if (overlaps(toJsDate(s), toJsDate(e))) out.push(instanceFrom(doc, exception, s, e, rid))
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime())
  return out
}

/** End time of a regular (non-override) occurrence: master duration applied to the occurrence start. */
function shiftedEnd(master: ICAL.Event, occurrenceStart: ICAL.Time): ICAL.Time {
  const duration = endOf(master).subtractDateTz(master.startDate)
  const end = occurrenceStart.clone()
  end.addDuration(duration)
  return end
}

export function expandEvents(
  docs: EventDocument[],
  rangeStart: Date,
  rangeEnd: Date,
): EventInstance[] {
  return docs
    .flatMap((d) => expandEvent(d, rangeStart, rangeEnd))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** Pre-fills the form from an instance. */
export function eventToForm(instance: EventInstance): EventForm {
  return {
    summary: instance.summary,
    description: instance.description,
    location: instance.location,
    start: instance.start,
    end: instance.end,
    allDay: instance.allDay,
    tzid: instance.tzid ?? browserTimeZone(),
    repeat: instance.repeat,
    alarm: instance.alarm,
  }
}

/** Writes the form fields onto an existing VEVENT, leaving everything else as it was. */
export function applyEventForm(
  comp: ICAL.Component,
  form: EventForm,
  options: { repeat?: boolean } = {},
) {
  const tzid = form.allDay ? null : (form.tzid ?? browserTimeZone())
  const start = toIcalTime(form.start, { allDay: form.allDay, tzid })
  const end = toIcalTime(form.end, { allDay: form.allDay, tzid })
  setText(comp, 'summary', form.summary)
  setText(comp, 'description', form.description)
  setText(comp, 'location', form.location)
  setTimeProperty(comp, 'dtstart', start)
  comp.removeAllProperties('duration')
  setTimeProperty(comp, 'dtend', end)
  if (options.repeat !== false) applyRepeat(comp, form.repeat, start)
  applyAlarm(comp, form.alarm)
  const seq = comp.getFirstPropertyValue('sequence')
  comp.updatePropertyWithValue('sequence', (typeof seq === 'number' ? seq : 0) + 1)
}

function ensureVtimezone(vcalendar: ICAL.Component, tzid: string | null | undefined) {
  if (!tzid) return
  const present = vcalendar
    .getAllSubcomponents('vtimezone')
    .some((v) => v.getFirstPropertyValue('tzid') === tzid)
  if (present) return
  const vtz = vtimezoneFor(tzid)
  if (vtz) vcalendar.addSubcomponent(vtz)
}

/** Builds a brand-new `.ics` for the form. Returns the text and the UID used as file name. */
export function buildEventIcs(
  form: EventForm,
  uid = crypto.randomUUID(),
): { uid: string; ics: string } {
  const vcalendar = createCalendar()
  const vevent = new ICAL.Component('vevent')
  vevent.addPropertyWithValue('uid', uid)
  vevent.addPropertyWithValue('dtstamp', nowUtc())
  vevent.addPropertyWithValue('created', nowUtc())
  vevent.addPropertyWithValue('sequence', -1)
  applyEventForm(vevent, form)
  vcalendar.addSubcomponent(vevent)
  ensureVtimezone(vcalendar, form.allDay ? null : (form.tzid ?? browserTimeZone()))
  return { uid, ics: vcalendar.toString() }
}

export type EditScope = 'all' | 'this'

/**
 * Applies the form to an existing document and returns the new `.ics`.
 *  - scope `all` (or a non-recurring event): edits the master (or the override itself when the
 *    instance is an override and scope is `this`).
 *  - scope `this` on a regular occurrence: adds a RECURRENCE-ID override for that occurrence.
 * Editing the master's start/end of a recurring event moves the whole series; overrides keep
 * their own times.
 */
export function updateEventIcs(
  doc: EventDocument,
  form: EventForm,
  instance?: EventInstance | null,
  scope: EditScope = 'all',
): string {
  const vcalendar = doc.vcalendar
  const masterComp = doc.master.component
  const tzid = form.allDay ? null : (form.tzid ?? browserTimeZone())

  if (!doc.isRecurring || scope === 'all' || !instance?.recurrenceId) {
    if (doc.isRecurring && scope === 'all' && instance) {
      // Keep the series anchored on the master's DTSTART; apply the instance's time shift
      // to the master so "move the whole series by 30 minutes" works from any occurrence.
      const shift = form.start.getTime() - instance.start.getTime()
      const length = form.end.getTime() - form.start.getTime()
      const masterStart = toJsDate(doc.master.startDate)
      const start = new Date(masterStart.getTime() + shift)
      applyEventForm(masterComp, { ...form, start, end: new Date(start.getTime() + length) })
      // Overrides made obsolete by a series-wide time change are left alone (Apple does the same).
    } else {
      applyEventForm(masterComp, form)
    }
  } else if (instance.isException) {
    const override = vcalendar
      .getAllSubcomponents('vevent')
      .find(
        (v) =>
          v.getFirstPropertyValue('recurrence-id')?.toString() ===
          instance.recurrenceId?.toString(),
      )
    applyEventForm(override ?? masterComp, form, { repeat: false })
  } else {
    const override = new ICAL.Component('vevent')
    override.addPropertyWithValue('uid', doc.uid)
    override.addPropertyWithValue('dtstamp', nowUtc())
    setTimeProperty(override, 'recurrence-id', instance.recurrenceId)
    applyEventForm(override, form, { repeat: false })
    vcalendar.addSubcomponent(override)
  }
  ensureVtimezone(vcalendar, tzid)
  return vcalendar.toString()
}

/** Removes one occurrence of a recurring event (EXDATE on the master, override dropped). */
export function excludeOccurrenceIcs(doc: EventDocument, instance: EventInstance): string {
  if (!instance.recurrenceId) throw new Error('Not a recurring occurrence')
  const vcalendar = doc.vcalendar
  const rid = instance.recurrenceId
  const override = findOverride(vcalendar, rid)
  if (override) vcalendar.removeSubcomponent(override)
  const masterComp = doc.master.component
  const exdate = masterComp.addProperty(new ICAL.Property('exdate'))
  exdate.setValue(rid)
  if (rid.isDate) exdate.setParameter('value', 'DATE')
  else if (tzidOf(rid)) exdate.setParameter('tzid', tzidOf(rid)!)
  masterComp.updatePropertyWithValue('dtstamp', nowUtc())
  return vcalendar.toString()
}
