/** In-memory CalDavClient used by store tests. Supports ETags, 412 conflicts and failure injection. */
import { vi } from 'vitest'

import type { CalDavClient, CalendarObject, DateRange } from '@/api/caldav'
import type { Collection } from '@/api/collections'
import { ConflictError, NotFoundError } from '@/api/errors'
import { stampForWrite } from '@/api/stamp'

export const SERVER = 'https://daisycal.home/dav/'

export const WORK: Collection = {
  url: `${SERVER}daisy/work/`,
  kind: 'calendar',
  displayName: 'Work',
  color: '#225688',
  ctag: '"w1"',
  syncToken: null,
}
export const PERSONAL: Collection = {
  url: `${SERVER}daisy/personal/`,
  kind: 'calendar',
  displayName: 'Personal',
  color: '#566c86',
  ctag: '"p1"',
  syncToken: null,
}
export const MY_TASKS: Collection = {
  url: `${SERVER}daisy/my-tasks/`,
  kind: 'tasks',
  displayName: 'My tasks',
  color: '#7c3aed',
  ctag: '"t1"',
  syncToken: null,
}

export function ics(body: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    ...body.replace(/\r\n/g, '\n').trim().split('\n'),
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function eventIcs(
  uid: string,
  summary: string,
  startUtc: string,
  endUtc: string,
  extra = '',
): string {
  return ics(`BEGIN:VEVENT
UID:${uid}
DTSTAMP:20261001T000000Z
SUMMARY:${summary}
DTSTART:${startUtc}
DTEND:${endUtc}
${extra}END:VEVENT`)
}

export function todoIcs(uid: string, summary: string, extra = ''): string {
  return ics(`BEGIN:VTODO
UID:${uid}
DTSTAMP:20261001T000000Z
SUMMARY:${summary}
STATUS:NEEDS-ACTION
${extra}END:VTODO`)
}

export class FakeClient implements CalDavClient {
  readonly serverUrl = SERVER
  readonly username = 'daisy'
  collections: Collection[] = [WORK, PERSONAL, MY_TASKS]
  objects = new Map<string, CalendarObject>()
  ctags = new Map<string, number>()
  /** When set, the next matching call throws this error once. */
  failNext: { op: 'create' | 'update' | 'delete' | 'fetch'; error: Error } | null = null
  calls: string[] = []

  private etagCounter = 0

  seed(collection: Collection, uid: string, data: string): CalendarObject {
    const url = `${collection.url}${uid}.ics`
    const obj = { url, collectionUrl: collection.url, etag: `"e${++this.etagCounter}"`, data }
    this.objects.set(url, obj)
    return obj
  }

  touch(collectionUrl: string) {
    this.ctags.set(collectionUrl, (this.ctags.get(collectionUrl) ?? 0) + 1)
  }

  private maybeFail(op: NonNullable<FakeClient['failNext']>['op']) {
    if (this.failNext?.op === op) {
      const { error } = this.failNext
      this.failNext = null
      throw error
    }
  }

  login = vi.fn<CalDavClient['login']>(async () => ({
    principalUrl: `${SERVER}daisy/`,
    homeUrl: `${SERVER}daisy/`,
  }))

  listCollections = vi.fn<CalDavClient['listCollections']>(async () => {
    this.calls.push('listCollections')
    return this.collections.map((c) => ({ ...c, ctag: `"${c.url}:${this.ctags.get(c.url) ?? 0}"` }))
  })

  fetchCtags = vi.fn<CalDavClient['fetchCtags']>(async () => {
    this.calls.push('fetchCtags')
    return new Map(this.collections.map((c) => [c.url, `"${c.url}:${this.ctags.get(c.url) ?? 0}"`]))
  })

  fetchEvents = vi.fn<CalDavClient['fetchEvents']>(async (collection, range) => {
    this.calls.push(
      `fetchEvents ${collection.displayName} ${range.start.toISOString().slice(0, 7)}`,
    )
    this.maybeFail('fetch')
    return [...this.objects.values()].filter(
      (o) =>
        o.collectionUrl === collection.url &&
        o.data.includes('BEGIN:VEVENT') &&
        overlaps(o.data, range),
    )
  })

  fetchTasks = vi.fn<CalDavClient['fetchTasks']>(async (collection) => {
    this.calls.push(`fetchTasks ${collection.displayName}`)
    this.maybeFail('fetch')
    return [...this.objects.values()].filter(
      (o) => o.collectionUrl === collection.url && o.data.includes('BEGIN:VTODO'),
    )
  })

  fetchObjects = vi.fn<CalDavClient['fetchObjects']>(async (_collection, urls) => {
    this.calls.push('fetchObjects')
    return urls.map((u) => this.objects.get(u)).filter((o): o is CalendarObject => !!o)
  })

  createObject = vi.fn<CalDavClient['createObject']>(
    async (collection, data, uid = crypto.randomUUID()) => {
      this.calls.push(`create ${uid}`)
      this.maybeFail('create')
      const url = `${collection.url}${encodeURIComponent(uid)}.ics`
      if (this.objects.has(url)) throw new ConflictError(url)
      const obj = {
        url,
        collectionUrl: collection.url,
        etag: `"e${++this.etagCounter}"`,
        data: stampForWrite(data),
      }
      this.objects.set(url, obj)
      this.touch(collection.url)
      return obj
    },
  )

  updateObject = vi.fn<CalDavClient['updateObject']>(async (object, data) => {
    this.calls.push(`update ${object.url.split('/').pop()}`)
    this.maybeFail('update')
    const current = this.objects.get(object.url)
    if (!current) throw new NotFoundError(object.url)
    if (current.etag !== object.etag) throw new ConflictError(object.url)
    const next = { ...current, etag: `"e${++this.etagCounter}"`, data: stampForWrite(data) }
    this.objects.set(object.url, next)
    this.touch(object.collectionUrl)
    return next
  })

  deleteObject = vi.fn<CalDavClient['deleteObject']>(async (object) => {
    this.calls.push(`delete ${object.url.split('/').pop()}`)
    this.maybeFail('delete')
    const current = this.objects.get(object.url)
    if (!current) throw new NotFoundError(object.url)
    if (current.etag !== object.etag) throw new ConflictError(object.url)
    this.objects.delete(object.url)
    this.touch(object.collectionUrl)
  })
}

/** Crude overlap check on the first DTSTART/DTEND; recurring objects always match. */
function overlaps(data: string, range: DateRange): boolean {
  if (data.includes('RRULE')) return true
  const start = /DTSTART[^:]*:(\d{8}T\d{6}Z?|\d{8})/.exec(data)?.[1]
  const end = /DTEND[^:]*:(\d{8}T\d{6}Z?|\d{8})/.exec(data)?.[1] ?? start
  if (!start || !end) return true
  const toDate = (s: string) =>
    new Date(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
      Number(s.slice(9, 11) || 0),
      Number(s.slice(11, 13) || 0),
    )
  return toDate(start) < range.end && toDate(end) > range.start
}
