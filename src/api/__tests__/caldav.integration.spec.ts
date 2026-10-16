// @vitest-environment node
/**
 * Runs against the local Radicale from docker-compose.dev.yml after `npm run seed`.
 * Skipped automatically when the server is not reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type CalendarObject, createCalDavClient } from '../caldav'
import type { Collection } from '../collections'
import { ConflictError, UnauthorizedError } from '../errors'

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

describe.skipIf(!up)('CalDAV client against local Radicale', () => {
  const client = createCalDavClient({ serverUrl: SERVER, username: USER, password: PASSWORD })
  let collections: Collection[] = []
  let shopping: Collection
  let work: Collection
  const created: CalendarObject[] = []

  beforeAll(async () => {
    await client.login()
    collections = await client.listCollections()
    shopping = collections.find((c) => c.displayName === 'Shopping')!
    work = collections.find((c) => c.displayName === 'Work')!
  })

  afterAll(async () => {
    for (const o of created) {
      try {
        await client.deleteObject(o)
      } catch {
        /* already gone */
      }
    }
  })

  it('rejects wrong credentials', async () => {
    const bad = createCalDavClient({ serverUrl: SERVER, username: USER, password: 'nope' })
    await expect(bad.login()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('discovers principal and home', async () => {
    await expect(client.login()).resolves.toEqual({
      principalUrl: `${SERVER}${USER}/`,
      homeUrl: `${SERVER}${USER}/`,
    })
  })

  it('lists only Calendar and Tasks collections with their metadata', () => {
    const names = collections.map((c) => c.displayName)
    expect(names).toEqual(
      [
        'Apartment',
        'Birthdays',
        'Events & Travel',
        'My tasks',
        'Personal',
        'Shopping',
        'Work',
      ].sort(),
    )
    expect(names.join()).not.toMatch(/unsupported/i)
    expect(work).toMatchObject({ kind: 'calendar', color: '#225688' })
    expect(shopping).toMatchObject({ kind: 'tasks', color: '#0ea5e9' })
    expect(work.ctag).toBeTruthy()
    expect(work.url).toBe(`${SERVER}${USER}/work/`)
  })

  it('fetches ctags for every supported collection', async () => {
    const ctags = await client.fetchCtags()
    const fresh = await client.listCollections()
    expect(ctags.size).toBe(fresh.length)
    expect(ctags.get(work.url)).toBe(fresh.find((c) => c.url === work.url)!.ctag)
  })

  it('fetches events in a time range, including a recurring master, without expanding', async () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
    const events = await client.fetchEvents(work, { start, end })
    expect(events.length).toBeGreaterThan(0)
    const standup = events.find((e) => e.data.includes('SUMMARY:Daily standup'))!
    expect(standup).toBeDefined()
    expect(standup.data).toContain('RRULE:FREQ=WEEKLY')
    expect(standup.data).toContain('RECURRENCE-ID')
    expect(standup.data.match(/BEGIN:VEVENT/g)!.length).toBeGreaterThanOrEqual(2)
    expect(standup.etag).toBeTruthy()
    expect(standup.collectionUrl).toBe(work.url)
    // Far future: only recurring events overlap.
    const far = await client.fetchEvents(work, {
      start: new Date(now.getFullYear() + 3, 0, 5),
      end: new Date(now.getFullYear() + 3, 0, 12),
    })
    expect(far.every((e) => e.data.includes('RRULE'))).toBe(true)
  })

  it('fetches all tasks including completed ones', async () => {
    const tasks = await client.fetchTasks(shopping)
    expect(tasks.length).toBeGreaterThanOrEqual(4)
    expect(tasks.some((t) => t.data.includes('STATUS:COMPLETED'))).toBe(true)
    expect(tasks.every((t) => t.data.includes('BEGIN:VTODO'))).toBe(true)
  })

  it('creates, re-reads, updates with ETag, conflicts on stale ETag, deletes', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//DaisyCal test//EN',
      'BEGIN:VTODO',
      'UID:placeholder',
      'SUMMARY:Integration test task',
      'STATUS:NEEDS-ACTION',
      'END:VTODO',
      'END:VCALENDAR',
      '',
    ].join('\r\n')

    const obj = await client.createObject(shopping, ics)
    created.push(obj)
    expect(obj.url).toMatch(new RegExp(`^${shopping.url}[0-9a-f-]{36}\\.ics$`))
    expect(obj.etag).toBeTruthy()
    expect(obj.data).toMatch(/DTSTAMP:\d{8}T\d{6}Z/)

    const [again] = await client.fetchObjects(shopping, [obj.url])
    expect(again?.etag).toBe(obj.etag)
    expect(again?.data).toContain('SUMMARY:Integration test task')

    const updated = await client.updateObject(obj, obj.data.replace('NEEDS-ACTION', 'COMPLETED'))
    expect(updated.etag).not.toBe(obj.etag)
    expect(updated.data).toContain('STATUS:COMPLETED')

    await expect(client.updateObject(obj, obj.data)).rejects.toBeInstanceOf(ConflictError)
    await expect(client.deleteObject(obj)).rejects.toBeInstanceOf(ConflictError)

    await client.deleteObject(updated)
    created.length = 0
    expect(await client.fetchObjects(shopping, [obj.url])).toEqual([])
  })

  it('creating twice with the same uid fails (If-None-Match: *)', async () => {
    const ics =
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:x\r\nBEGIN:VTODO\r\nUID:dup\r\nSUMMARY:dup\r\nEND:VTODO\r\nEND:VCALENDAR\r\n'
    const first = await client.createObject(shopping, ics, 'dup-test')
    created.push(first)
    await expect(client.createObject(shopping, ics, 'dup-test')).rejects.toBeInstanceOf(
      ConflictError,
    )
  })
})
