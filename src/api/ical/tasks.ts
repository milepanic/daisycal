/** VTODO <-> domain mapping, preserving properties the form does not know about. */
import ICAL from 'ical.js'

import type { CalendarObject } from '../caldav'
import { createCalendar, nowUtc, parseCalendar, setText, text } from './common'
import { type AlarmMinutes, applyAlarm, parseAlarm } from './alarms'
import {
  browserTimeZone,
  registerTimezones,
  setTimeProperty,
  toIcalTime,
  toJsDate,
  tzidOf,
  vtimezoneFor,
} from './timezones'

export type TaskPriority = 'high' | 'medium' | 'low' | null

export interface TaskDocument {
  object: CalendarObject
  vcalendar: ICAL.Component
  vtodo: ICAL.Component
  uid: string
}

export interface Task {
  uid: string
  objectUrl: string
  collectionUrl: string
  etag: string
  summary: string
  description: string
  due: Date | null
  dueAllDay: boolean
  completed: boolean
  completedAt: Date | null
  percent: number
  priority: TaskPriority
  /** Raw PRIORITY 0-9 (0 = undefined). */
  priorityValue: number
  alarm: AlarmMinutes
  created: Date | null
  /** Apple Reminders sort hint, when present. */
  sortOrder: number | null
  /** UID of the parent task (RELATED-TO;RELTYPE=PARENT), when present. */
  parentUid: string | null
}

export interface TaskForm {
  summary: string
  description: string
  due: Date | null
  dueAllDay: boolean
  tzid?: string | null
  priority: TaskPriority
  alarm: AlarmMinutes
}

/** Apple Reminders writes 1 / 5 / 9 for high / medium / low. */
export function priorityFromValue(value: number): TaskPriority {
  if (value >= 1 && value <= 4) return 'high'
  if (value === 5) return 'medium'
  if (value >= 6 && value <= 9) return 'low'
  return null
}

export function priorityToValue(priority: TaskPriority): number {
  return priority === 'high' ? 1 : priority === 'medium' ? 5 : priority === 'low' ? 9 : 0
}

export function parseTaskObject(object: CalendarObject): TaskDocument {
  const vcalendar = parseCalendar(object.data)
  registerTimezones(vcalendar)
  const vtodo = vcalendar.getFirstSubcomponent('vtodo')
  if (!vtodo) throw new Error(`No VTODO in ${object.url}`)
  return { object, vcalendar, vtodo, uid: text(vtodo, 'uid') }
}

function timeValue(comp: ICAL.Component, name: string): ICAL.Time | null {
  const v = comp.getFirstPropertyValue(name)
  return v instanceof ICAL.Time ? v : null
}

function parentUid(comp: ICAL.Component): string | null {
  for (const prop of comp.getAllProperties('related-to')) {
    const reltype = (prop.getParameter('reltype') as string | undefined)?.toUpperCase() ?? 'PARENT'
    if (reltype === 'PARENT') {
      const v = prop.getFirstValue()
      return typeof v === 'string' ? v : null
    }
  }
  return null
}

export function taskFromDocument(doc: TaskDocument): Task {
  const { vtodo } = doc
  const due = timeValue(vtodo, 'due')
  const completedAt = timeValue(vtodo, 'completed')
  const created = timeValue(vtodo, 'created')
  const status = text(vtodo, 'status').toUpperCase()
  const percentRaw = vtodo.getFirstPropertyValue('percent-complete')
  const percent: number = typeof percentRaw === 'number' ? percentRaw : 0
  const priorityRaw = vtodo.getFirstPropertyValue('priority')
  const priorityValue = typeof priorityRaw === 'number' ? priorityRaw : 0
  const sortRaw = vtodo.getFirstPropertyValue('x-apple-sort-order')
  const sortOrder = sortRaw == null || sortRaw === '' ? null : Number(sortRaw)
  return {
    uid: doc.uid,
    objectUrl: doc.object.url,
    collectionUrl: doc.object.collectionUrl,
    etag: doc.object.etag,
    summary: text(vtodo, 'summary'),
    description: text(vtodo, 'description'),
    due: due ? toJsDate(due) : null,
    dueAllDay: due?.isDate ?? false,
    completed: status === 'COMPLETED' || percent === 100 || completedAt !== null,
    completedAt: completedAt ? toJsDate(completedAt) : null,
    percent,
    priority: priorityFromValue(priorityValue),
    priorityValue,
    alarm: parseAlarm(vtodo),
    created: created ? toJsDate(created) : null,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : null,
    parentUid: parentUid(vtodo),
  }
}

export function parseTask(object: CalendarObject): Task {
  return taskFromDocument(parseTaskObject(object))
}

export function taskToForm(task: Task): TaskForm {
  return {
    summary: task.summary,
    description: task.description,
    due: task.due,
    dueAllDay: task.dueAllDay,
    tzid: browserTimeZone(),
    priority: task.priority,
    alarm: task.alarm,
  }
}

/** Writes form fields onto an existing VTODO. Completion state is handled by `setTaskCompleted`. */
export function applyTaskForm(vtodo: ICAL.Component, form: TaskForm): void {
  setText(vtodo, 'summary', form.summary)
  setText(vtodo, 'description', form.description)
  if (form.due) {
    const tzid = form.dueAllDay ? null : (form.tzid ?? browserTimeZone())
    setTimeProperty(vtodo, 'due', toIcalTime(form.due, { allDay: form.dueAllDay, tzid }))
  } else {
    vtodo.removeAllProperties('due')
  }
  const current = vtodo.getFirstPropertyValue('priority')
  const currentPriority = priorityFromValue(typeof current === 'number' ? current : 0)
  // Keep Apple's exact value (e.g. 2) when the bucket did not change.
  if (currentPriority !== form.priority) {
    if (form.priority) vtodo.updatePropertyWithValue('priority', priorityToValue(form.priority))
    else vtodo.removeAllProperties('priority')
  }
  applyAlarm(vtodo, form.alarm)
  const seq = vtodo.getFirstPropertyValue('sequence')
  vtodo.updatePropertyWithValue('sequence', (typeof seq === 'number' ? seq : 0) + 1)
}

/** Marks the VTODO completed / not completed the way Reminders does. */
export function setTaskCompleted(
  vtodo: ICAL.Component,
  completed: boolean,
  at: Date = new Date(),
): void {
  if (completed) {
    vtodo.updatePropertyWithValue('status', 'COMPLETED')
    vtodo.updatePropertyWithValue('completed', ICAL.Time.fromJSDate(at, true))
    vtodo.updatePropertyWithValue('percent-complete', 100)
  } else {
    vtodo.updatePropertyWithValue('status', 'NEEDS-ACTION')
    vtodo.removeAllProperties('completed')
    vtodo.removeAllProperties('percent-complete')
  }
}

function ensureVtimezone(vcalendar: ICAL.Component, due: ICAL.Time | null) {
  const tzid = tzidOf(due)
  if (!tzid) return
  if (
    vcalendar.getAllSubcomponents('vtimezone').some((v) => v.getFirstPropertyValue('tzid') === tzid)
  )
    return
  const vtz = vtimezoneFor(tzid)
  if (vtz) vcalendar.addSubcomponent(vtz)
}

export function buildTaskIcs(
  form: TaskForm,
  uid = crypto.randomUUID(),
): { uid: string; ics: string } {
  const vcalendar = createCalendar()
  const vtodo = new ICAL.Component('vtodo')
  vtodo.addPropertyWithValue('uid', uid)
  vtodo.addPropertyWithValue('dtstamp', nowUtc())
  vtodo.addPropertyWithValue('created', nowUtc())
  vtodo.addPropertyWithValue('status', 'NEEDS-ACTION')
  vtodo.addPropertyWithValue('sequence', -1)
  applyTaskForm(vtodo, form)
  vcalendar.addSubcomponent(vtodo)
  ensureVtimezone(vcalendar, timeValue(vtodo, 'due'))
  return { uid, ics: vcalendar.toString() }
}

export function updateTaskIcs(doc: TaskDocument, form: TaskForm): string {
  applyTaskForm(doc.vtodo, form)
  ensureVtimezone(doc.vcalendar, timeValue(doc.vtodo, 'due'))
  return doc.vcalendar.toString()
}

export function toggleTaskIcs(doc: TaskDocument, completed: boolean, at?: Date): string {
  setTaskCompleted(doc.vtodo, completed, at)
  return doc.vcalendar.toString()
}
