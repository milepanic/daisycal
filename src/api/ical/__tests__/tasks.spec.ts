import { beforeEach, describe, expect, it } from 'vitest'

import {
  buildTaskIcs,
  parseTask,
  parseTaskObject,
  taskToForm,
  toggleTaskIcs,
  updateTaskIcs,
} from '../tasks'
import { _resetTimezones } from '../timezones'
import { APPLE_REMINDER, COMPLETED_TODO, obj } from './fixtures'

beforeEach(() => _resetTimezones())

const TASKS_URL = 'https://daisycal.home/dav/daisy/my-tasks/t.ics'

describe('parseTask', () => {
  it('maps an Apple reminder', () => {
    const task = parseTask(obj(APPLE_REMINDER, TASKS_URL))
    expect(task).toMatchObject({
      uid: 'todo-uid',
      summary: 'Send invoice',
      description: 'Attach the PDF',
      dueAllDay: false,
      completed: false,
      completedAt: null,
      percent: 0,
      priority: 'high',
      priorityValue: 1,
      alarm: 60,
      sortOrder: 745000000,
      parentUid: 'parent-uid',
      collectionUrl: 'https://daisycal.home/dav/daisy/my-tasks/',
    })
    expect(task.due?.toISOString()).toBe('2026-10-17T15:00:00.000Z')
    expect(task.created?.toISOString()).toBe('2026-09-30T10:00:00.000Z')
  })

  it('maps a completed reminder with an all-day due', () => {
    const task = parseTask(obj(COMPLETED_TODO, TASKS_URL))
    expect(task).toMatchObject({
      completed: true,
      percent: 100,
      priority: 'low',
      dueAllDay: true,
      parentUid: null,
    })
    expect(task.completedAt?.toISOString()).toBe('2026-10-06T09:00:00.000Z')
    expect(task.due).toEqual(new Date(2026, 9, 6))
  })
})

describe('buildTaskIcs', () => {
  it('writes a new VTODO with due, priority and alarm', () => {
    const { uid, ics } = buildTaskIcs({
      summary: 'Call plumber',
      description: 'About the leak',
      due: new Date('2026-10-20T08:00:00Z'),
      dueAllDay: false,
      tzid: 'Europe/Belgrade',
      priority: 'medium',
      alarm: 60,
    })
    expect(ics).toContain(`UID:${uid}`)
    expect(ics).toContain('BEGIN:VTODO')
    expect(ics).toContain('STATUS:NEEDS-ACTION')
    expect(ics).toContain('DUE;TZID=Europe/Belgrade:20261020T100000')
    expect(ics).toContain('PRIORITY:5')
    expect(ics).toContain('TRIGGER:-PT1H')
    expect(ics).toContain('BEGIN:VTIMEZONE')
    expect(parseTask(obj(ics, TASKS_URL))).toMatchObject({
      summary: 'Call plumber',
      priority: 'medium',
      alarm: 60,
    })
  })

  it('writes an all-day due and omits empty fields', () => {
    const { ics } = buildTaskIcs({
      summary: 'Milk',
      description: '',
      due: new Date(2026, 9, 20),
      dueAllDay: true,
      priority: null,
      alarm: null,
    })
    expect(ics).toContain('DUE;VALUE=DATE:20261020')
    expect(ics).not.toContain('PRIORITY')
    expect(ics).not.toContain('DESCRIPTION')
    expect(ics).not.toContain('VTIMEZONE')
  })
})

describe('updateTaskIcs', () => {
  it('changes form fields, keeps Apple properties and the exact priority when the bucket is unchanged', () => {
    const doc = parseTaskObject(obj(APPLE_REMINDER, TASKS_URL))
    doc.vtodo.updatePropertyWithValue('priority', 2)
    const form = {
      ...taskToForm(parseTask(obj(APPLE_REMINDER, TASKS_URL))),
      summary: 'Send invoice (March)',
      due: null,
    }
    const ics = updateTaskIcs(doc, form)
    expect(ics).toContain('SUMMARY:Send invoice (March)')
    expect(ics).not.toContain('DUE;')
    expect(ics).toContain('PRIORITY:2')
    expect(ics).toContain('X-APPLE-SORT-ORDER:745000000')
    expect(ics).toContain('RELATED-TO;RELTYPE=PARENT:parent-uid')
    expect(ics).toContain('X-WR-ALARMUID:9C6B5E1C-7F3D-4B2E-9B1A-000000000002')
    expect(ics).toContain('SEQUENCE:5')
    expect(ics).toContain('DTSTART;TZID=Europe/Belgrade:20261017T170000')
  })

  it('changes priority when the bucket changes', () => {
    const doc = parseTaskObject(obj(APPLE_REMINDER, TASKS_URL))
    const ics = updateTaskIcs(doc, {
      ...taskToForm(parseTask(obj(APPLE_REMINDER, TASKS_URL))),
      priority: 'low',
    })
    expect(ics).toContain('PRIORITY:9')
  })
})

describe('toggleTaskIcs', () => {
  it('completes and un-completes the way Reminders does', () => {
    const doc = parseTaskObject(obj(APPLE_REMINDER, TASKS_URL))
    const done = toggleTaskIcs(doc, true, new Date('2026-10-16T12:00:00Z'))
    expect(done).toContain('STATUS:COMPLETED')
    expect(done).toContain('COMPLETED:20261016T120000Z')
    expect(done).toContain('PERCENT-COMPLETE:100')
    expect(parseTask(obj(done, TASKS_URL)).completed).toBe(true)

    const undone = toggleTaskIcs(parseTaskObject(obj(done, TASKS_URL)), false)
    expect(undone).toContain('STATUS:NEEDS-ACTION')
    expect(undone).not.toContain('COMPLETED:')
    expect(undone).not.toContain('PERCENT-COMPLETE')
    expect(parseTask(obj(undone, TASKS_URL)).completed).toBe(false)
  })
})
