// @vitest-environment node
/** Full chain against the local Radicale: fetch -> parse -> expand -> edit -> PUT -> re-read. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type CalendarObject, createCalDavClient } from '../../caldav'
import type { Collection } from '../../collections'
import {
  buildEventIcs,
  eventToForm,
  expandEvent,
  parseEventObject,
  updateEventIcs,
} from '../events'
import { buildTaskIcs, parseTask, parseTaskObject, toggleTaskIcs } from '../tasks'

const SERVER = (process.env.RADICALE_URL ?? 'http://localhost:5232').replace(/\/?$/, '/')
const USER = process.env.RADICALE_USER ?? 'daisy'
const PASSWORD = process.env.RADICALE_PASSWORD ?? 'daisy'

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(SERVER, { method: 'OPTIONS', signal: AbortSignal.timeout(1500) })
    return res.status < 500
  } catch {
    return false
  }
}

const up = await reachable()

describe.skipIf(!up)('iCalendar round trip through Radicale', () => {
  const client = createCalDavClient({ serverUrl: SERVER, username: USER, password: PASSWORD })
  let work: Collection
  let tasks: Collection
  const created: CalendarObject[] = []

  beforeAll(async () => {
    await client.login()
    const collections = await client.listCollections()
    work = collections.find((c) => c.displayName === 'Work')!
    tasks = collections.find((c) => c.displayName === 'Shopping')!
  })

  afterAll(async () => {
    for (const o of created) await client.deleteObject(o).catch(() => undefined)
  })

  it('reads the seeded Apple standup, expands it and edits one occurrence without losing Apple data', async () => {
    const now = new Date()
    const weekStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - ((now.getDay() + 6) % 7),
    )
    const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
    const objects = await client.fetchEvents(work, { start: weekStart, end: weekEnd })
    const seeded = objects.find((o) => o.data.includes('SUMMARY:Daily standup'))!
    // Work on a private copy so the other integration suite sees the seed untouched.
    const copyUid = `standup-copy-${crypto.randomUUID()}`
    const standupObj = await client.createObject(
      work,
      seeded.data.replace(/^UID:.*$/gm, `UID:${copyUid}`),
      copyUid,
    )
    created.push(standupObj)
    const doc = parseEventObject(standupObj)
    const instances = expandEvent(doc, weekStart, weekEnd)
    // Mon-Fri minus the EXDATEd Thursday = 4, one of them the moved override.
    expect(instances).toHaveLength(4)
    expect(instances.filter((i) => i.isException)).toHaveLength(1)

    const wednesday = instances.find((i) => !i.isException && i.start.getDay() === 3)!
    const form = { ...eventToForm(wednesday), summary: 'Standup (edited from web)' }
    const ics = updateEventIcs(doc, form, wednesday, 'this')
    const saved = await client.updateObject(standupObj, ics)
    expect(saved.etag).not.toBe(standupObj.etag)
    created[created.indexOf(standupObj)] = saved

    const [reread] = await client.fetchObjects(work, [standupObj.url])
    const again = parseEventObject(reread!)
    const after = expandEvent(again, weekStart, weekEnd)
    expect(after).toHaveLength(4)
    expect(after.filter((i) => i.isException)).toHaveLength(2)
    expect(after.find((i) => i.summary === 'Standup (edited from web)')).toBeDefined()
    expect(reread!.data).toContain('X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC')
    expect(reread!.data).toContain('X-WR-ALARMUID')
    expect(reread!.data).toContain('PRODID:-//Apple Inc.//iOS 26.0//EN')
  })

  it('creates an event and a task from forms and reads them back', async () => {
    const start = new Date(2027, 2, 29, 10, 0) // first Monday after the 2027 DST switch
    const { ics, uid } = buildEventIcs({
      summary: 'Round trip event',
      description: 'desc',
      location: 'loc',
      start,
      end: new Date(2027, 2, 29, 11, 30),
      allDay: false,
      tzid: 'Europe/Belgrade',
      repeat: { kind: 'simple', freq: 'daily', interval: 1, byDay: [], until: null, count: 3 },
      alarm: 30,
    })
    const eventObj = await client.createObject(work, ics, uid)
    created.push(eventObj)
    const fetched = (
      await client.fetchEvents(work, { start: new Date(2027, 2, 28), end: new Date(2027, 3, 4) })
    ).find((o) => o.url === eventObj.url)
    const instances = expandEvent(
      parseEventObject(fetched!),
      new Date(2027, 2, 28),
      new Date(2027, 3, 4),
    )
    expect(instances).toHaveLength(3)
    expect(instances[0]!.start.getTime()).toBe(start.getTime())
    expect(instances[0]!.alarm).toBe(30)

    const task = buildTaskIcs({
      summary: 'Round trip task',
      description: '',
      due: new Date(2027, 2, 30),
      dueAllDay: true,
      priority: 'high',
      alarm: null,
    })
    const taskObj = await client.createObject(tasks, task.ics, task.uid)
    created.push(taskObj)
    const parsed = parseTask((await client.fetchObjects(tasks, [taskObj.url]))[0]!)
    expect(parsed).toMatchObject({
      summary: 'Round trip task',
      priority: 'high',
      dueAllDay: true,
      completed: false,
    })
    const done = await client.updateObject(taskObj, toggleTaskIcs(parseTaskObject(taskObj), true))
    created[created.length - 1] = done
    expect(parseTask(done).completed).toBe(true)
  })
})
