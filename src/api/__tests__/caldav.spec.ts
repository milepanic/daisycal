import { describe, expect, it, vi } from 'vitest'

import { createCalDavClient, toDavUtc } from '../caldav'
import type { Collection } from '../collections'
import { ConflictError, NetworkError, NotFoundError, UnauthorizedError } from '../errors'

const SERVER = 'https://daisycal.home/dav/'
const calendar: Collection = {
  url: `${SERVER}daisy/work/`,
  kind: 'calendar',
  displayName: 'Work',
  color: '#225688',
  ctag: '"1"',
  syncToken: null,
}

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//test//EN',
  'BEGIN:VEVENT',
  'UID:abc',
  'SUMMARY:Hello',
  'DTSTART:20261016T090000Z',
  'DTEND:20261016T100000Z',
  'X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n')

type Call = { url: string; method: string; headers: Headers; body: string | null }
type FetchFn = typeof globalThis.fetch

/** Fake fetch returning the given status for every request and recording calls. */
function fakeFetch(status: number, headers: Record<string, string> = {}, body = '') {
  const calls: Call[] = []
  const fetchFn = vi.fn<FetchFn>(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : null,
    })
    const text = body.replace('{{href}}', new URL(url).pathname)
    return new Response(text || null, { status, statusText: String(status), headers })
  })
  return { calls, fetch: fetchFn as FetchFn }
}

function client(fetch: FetchFn, onUnauthorized?: () => void) {
  return createCalDavClient({
    serverUrl: SERVER,
    username: 'daisy',
    password: 'secret',
    fetch,
    onUnauthorized,
  })
}

describe('createCalDavClient', () => {
  it('sends Basic auth and never browser credentials', async () => {
    const { calls, fetch } = fakeFetch(401)
    await expect(client(fetch).login()).rejects.toBeInstanceOf(UnauthorizedError)
    expect(calls[0]!.headers.get('authorization')).toBe(`Basic ${btoa('daisy:secret')}`)
    expect(calls[0]!.method).toBe('PROPFIND')
    expect(calls[0]!.url).toBe(SERVER)
  })

  it('does not fire onUnauthorized for a failed login, but does once logged in', async () => {
    const onUnauthorized = vi.fn<() => void>()
    const { fetch } = fakeFetch(401)
    await expect(client(fetch, onUnauthorized).login()).rejects.toBeInstanceOf(UnauthorizedError)
    expect(onUnauthorized).not.toHaveBeenCalled()

    // Simulate an expired session: login succeeds (fake 207), later calls get 401.
    const good = fakeFetch(
      207,
      { 'content-type': 'application/xml' },
      `<?xml version="1.0"?><multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
        <response><href>{{href}}</href><propstat><prop>
          <current-user-principal><href>/dav/daisy/</href></current-user-principal>
          <C:calendar-home-set><href>/dav/daisy/</href></C:calendar-home-set>
        </prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`,
    )
    const c = client(good.fetch, onUnauthorized)
    await expect(c.login()).resolves.toEqual({
      principalUrl: `${SERVER}daisy/`,
      homeUrl: `${SERVER}daisy/`,
    })
    // Login needs two PROPFINDs (principal, home); after that every request is rejected.
    let requests = 0
    const expired = createCalDavClient({
      serverUrl: SERVER,
      username: 'daisy',
      password: 'secret',
      onUnauthorized,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests++
        if (requests > 2) return new Response(null, { status: 401 })
        return good.fetch(input, init)
      }) as FetchFn,
    })
    await expired.login()
    await expect(expired.listCollections()).rejects.toBeInstanceOf(UnauthorizedError)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('creates with If-None-Match: * at <collection>/<uid>.ics and stamps the object', async () => {
    const { calls, fetch } = fakeFetch(201, { etag: '"e1"' })
    const obj = await client(fetch).createObject(calendar, ICS, 'abc')
    const call = calls[0]!
    expect(call.method).toBe('PUT')
    expect(call.url).toBe(`${calendar.url}abc.ics`)
    expect(call.headers.get('if-none-match')).toBe('*')
    expect(call.headers.get('content-type')).toMatch(/^text\/calendar/)
    expect(call.body).toMatch(/DTSTAMP:\d{8}T\d{6}Z/)
    expect(call.body).toMatch(/LAST-MODIFIED:\d{8}T\d{6}Z/)
    expect(call.body).toContain('X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC')
    expect(obj).toMatchObject({
      url: `${calendar.url}abc.ics`,
      etag: '"e1"',
      collectionUrl: calendar.url,
    })
  })

  it('generates a UUID file name when no uid is given', async () => {
    const { calls, fetch } = fakeFetch(201, { etag: '"e1"' })
    await client(fetch).createObject(calendar, ICS)
    expect(calls[0]!.url).toMatch(new RegExp(`^${calendar.url}[0-9a-f-]{36}\\.ics$`))
  })

  it('updates with If-Match and maps 412 to ConflictError', async () => {
    const ok = fakeFetch(204, { etag: '"e2"' })
    const object = {
      url: `${calendar.url}abc.ics`,
      collectionUrl: calendar.url,
      etag: '"e1"',
      data: ICS,
    }
    const updated = await client(ok.fetch).updateObject(object, ICS)
    expect(ok.calls[0]!.method).toBe('PUT')
    expect(ok.calls[0]!.headers.get('if-match')).toBe('"e1"')
    expect(updated.etag).toBe('"e2"')

    const stale = fakeFetch(412)
    await expect(client(stale.fetch).updateObject(object, ICS)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })

  it('deletes with If-Match and maps 404/412', async () => {
    const object = {
      url: `${calendar.url}abc.ics`,
      collectionUrl: calendar.url,
      etag: '"e1"',
      data: ICS,
    }
    const ok = fakeFetch(200)
    await client(ok.fetch).deleteObject(object)
    expect(ok.calls[0]!.method).toBe('DELETE')
    expect(ok.calls[0]!.headers.get('if-match')).toBe('"e1"')

    await expect(client(fakeFetch(404).fetch).deleteObject(object)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(client(fakeFetch(412).fetch).deleteObject(object)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })

  it('sends a VEVENT time-range calendar-query without expand', async () => {
    const { calls, fetch } = fakeFetch(
      207,
      { 'content-type': 'application/xml' },
      '<multistatus xmlns="DAV:"/>',
    )
    await client(fetch).fetchEvents(calendar, {
      start: new Date('2026-10-12T00:00:00Z'),
      end: new Date('2026-10-19T00:00:00Z'),
    })
    const call = calls[0]!
    expect(call.method).toBe('REPORT')
    expect(call.headers.get('depth')).toBe('1')
    expect(call.body).toContain('name="VEVENT"')
    expect(call.body).toContain('start="20261012T000000Z"')
    expect(call.body).toContain('end="20261019T000000Z"')
    expect(call.body).not.toContain('expand')
    expect(call.body).toContain('calendar-data')
  })

  it('sends a VTODO calendar-query without a time range', async () => {
    const { calls, fetch } = fakeFetch(
      207,
      { 'content-type': 'application/xml' },
      '<multistatus xmlns="DAV:"/>',
    )
    await client(fetch).fetchTasks({ ...calendar, kind: 'tasks' })
    expect(calls[0]!.body).toContain('name="VTODO"')
    expect(calls[0]!.body).not.toContain('time-range')
  })

  it('wraps fetch failures in NetworkError', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as FetchFn
    await expect(client(failing).login()).rejects.toBeInstanceOf(NetworkError)
  })
})

describe('createCalDavClient without credentials (proxy adds them)', () => {
  it('sends no Authorization header and derives the username from the principal', async () => {
    const good = fakeFetch(
      207,
      { 'content-type': 'application/xml' },
      `<?xml version="1.0"?><multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
        <response><href>{{href}}</href><propstat><prop>
          <current-user-principal><href>/dav/mile/</href></current-user-principal>
          <C:calendar-home-set><href>/dav/mile/</href></C:calendar-home-set>
        </prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`,
    )
    const c = createCalDavClient({ serverUrl: SERVER, fetch: good.fetch })
    await c.login()
    expect(good.calls[0]!.headers.has('authorization')).toBe(false)
    expect(c.username).toBe('mile')
  })
})

describe('toDavUtc', () => {
  it('formats as YYYYMMDDTHHMMSSZ', () => {
    expect(toDavUtc(new Date('2026-10-16T07:05:09.123Z'))).toBe('20261016T070509Z')
  })
})
