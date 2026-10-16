import ICAL from 'ical.js'

/** Minutes before the start, or null for "no notification". */
export type AlarmMinutes = number | null

/** DTSTART for events, DUE (or DTSTART) for tasks: what alarms are relative to. */
function referenceTime(comp: ICAL.Component): ICAL.Time | null {
  const v = comp.getFirstPropertyValue('due') ?? comp.getFirstPropertyValue('dtstart')
  return v instanceof ICAL.Time ? v : null
}

function hasUsableTrigger(alarm: ICAL.Component): boolean {
  const trigger = alarm.getFirstProperty('trigger')
  if (!trigger) return false
  const related = (trigger.getParameter('related') as string | undefined)?.toUpperCase()
  if (related === 'END') return false
  const value = trigger.getFirstValue()
  return value instanceof ICAL.Duration || value instanceof ICAL.Time
}

/**
 * First VALARM expressed as minutes before the reference time. Relative triggers are read
 * directly; absolute ones (what Reminders writes) are measured against DUE/DTSTART.
 */
export function parseAlarm(comp: ICAL.Component): AlarmMinutes {
  const alarm = comp.getAllSubcomponents('valarm').find(hasUsableTrigger)
  if (!alarm) return null
  const value = alarm.getFirstProperty('trigger')!.getFirstValue()
  if (value instanceof ICAL.Duration) return Math.round(-value.toSeconds() / 60)
  const ref = referenceTime(comp)
  if (!(value instanceof ICAL.Time) || !ref) return null
  const refMs = ref.isDate
    ? new Date(ref.year, ref.month - 1, ref.day).getTime()
    : ref.toJSDate().getTime()
  return Math.round((refMs - value.toJSDate().getTime()) / 60_000)
}

/**
 * Sets the notification. Keeps an existing relative VALARM (and its Apple UIDs) when only the
 * trigger changes, adds a DISPLAY alarm when there was none, removes all alarms for null.
 */
export function applyAlarm(comp: ICAL.Component, minutes: AlarmMinutes): void {
  const existing = comp.getAllSubcomponents('valarm').find(hasUsableTrigger)

  if (minutes == null) {
    comp.removeAllSubcomponents('valarm')
    return
  }
  const trigger = ICAL.Duration.fromSeconds(-minutes * 60)
  if (existing) {
    const prop = existing.updatePropertyWithValue('trigger', trigger)
    prop.removeParameter('related')
    prop.removeParameter('value')
    return
  }
  const alarm = new ICAL.Component('valarm')
  alarm.addPropertyWithValue('action', 'DISPLAY')
  alarm.addPropertyWithValue('description', 'Reminder')
  alarm.addPropertyWithValue('trigger', trigger)
  alarm.addPropertyWithValue('uid', crypto.randomUUID().toUpperCase())
  comp.addSubcomponent(alarm)
}
