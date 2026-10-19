/**
 * CalDAV client for Radicale, built on tsdav's low-level helpers.
 *
 * Every request goes through `davFetch`, which adds Basic auth and maps HTTP failures to
 * typed errors (`UnauthorizedError`, `ConflictError`, `NotFoundError`, `NetworkError`).
 * Collections other than Calendar (VEVENT) and Tasks (VTODO) are filtered out (CHECKLIST.md §0).
 */
import {
  calendarQuery,
  createObject,
  davRequest,
  deleteObject,
  fetchHomeUrl,
  fetchPrincipalUrl,
  getBasicAuthHeaders,
  propfind,
  updateObject,
  type DAVAccount,
  type DAVResponse,
} from 'tsdav'

import { type Collection, davText, toCollection } from './collections'
import { ConflictError, DavError, NetworkError, NotFoundError, UnauthorizedError } from './errors'
import { newUid, stampForWrite } from './stamp'

export interface CalendarObject {
  /** Absolute URL of the `.ics` resource. */
  url: string
  /** Absolute URL of the collection it lives in. */
  collectionUrl: string
  etag: string
  /** Raw iCalendar text. */
  data: string
}

export interface DateRange {
  start: Date
  end: Date
}

export interface CalDavClientOptions {
  /** Absolute URL of the CalDAV root, e.g. `https://daisycal.home/dav/`. */
  serverUrl: string
  /** Basic-auth credentials. Omit when the reverse proxy adds the Authorization header. */
  username?: string
  password?: string
  /** Called once per rejected request after a successful login (session expired, password changed). */
  onUnauthorized?: () => void
  /** Injectable for tests. */
  fetch?: typeof fetch
}

export interface CalDavClient {
  readonly serverUrl: string
  /** Login name; after `login()` the last segment of the principal URL when none was given. */
  readonly username: string
  /** Verifies the credentials and discovers the principal and calendar home URLs. */
  login(): Promise<{ principalUrl: string; homeUrl: string }>
  /** All supported collections (Calendar and Tasks) under the calendar home. */
  listCollections(): Promise<Collection[]>
  /** Current `getctag` of every supported collection, keyed by collection URL. */
  fetchCtags(): Promise<Map<string, string>>
  /** VEVENTs overlapping the range. Recurrences are NOT expanded; the client does that. */
  fetchEvents(collection: Collection, range: DateRange): Promise<CalendarObject[]>
  /** All VTODOs in a Tasks collection, completed ones included. */
  fetchTasks(collection: Collection): Promise<CalendarObject[]>
  /** Re-reads specific objects by URL (calendar-multiget). Missing ones are omitted. */
  fetchObjects(collection: Collection, urls: string[]): Promise<CalendarObject[]>
  /** PUT with `If-None-Match: *`. `uid` becomes the file name; DTSTAMP/LAST-MODIFIED are set. */
  createObject(collection: Collection, ics: string, uid?: string): Promise<CalendarObject>
  /** PUT with `If-Match: <etag>`; throws `ConflictError` when the server copy changed. */
  updateObject(object: CalendarObject, ics: string): Promise<CalendarObject>
  /** DELETE with `If-Match: <etag>`; throws `ConflictError` when the server copy changed. */
  deleteObject(object: CalendarObject): Promise<void>
}

/** Default CalDAV root for the running app: same origin + `VITE_DAV_BASE`. */
export function defaultServerUrl(): string {
  const base = import.meta.env.VITE_DAV_BASE || '/dav'
  return new URL(base.endsWith('/') ? base : `${base}/`, window.location.origin).href
}

const PROPFIND_COLLECTION_PROPS = {
  'd:displayname': {},
  'd:resourcetype': {},
  'ca:calendar-color': {},
  'cs:getctag': {},
  'd:sync-token': {},
  'c:supported-calendar-component-set': {},
}

/** `YYYYMMDDTHHMMSSZ` as required by CalDAV time-range filters. */
export function toDavUtc(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`
}

function objectUrlFor(collection: Collection, uid: string): string {
  return new URL(`${encodeURIComponent(uid)}.ics`, collection.url).href
}

export function createCalDavClient(options: CalDavClientOptions): CalDavClient {
  const serverUrl = options.serverUrl.endsWith('/') ? options.serverUrl : `${options.serverUrl}/`
  const baseFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const authHeaders =
    options.username !== undefined
      ? getBasicAuthHeaders({ username: options.username, password: options.password ?? '' })
      : {}

  let loggedIn = false
  let homeUrl: string | null = null
  let principalUrl: string | null = null

  const davFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const headers = new Headers(init?.headers)
    for (const [k, v] of Object.entries(authHeaders)) if (!headers.has(k)) headers.set(k, v)

    let res: Response
    try {
      res = await baseFetch(input, { ...init, headers, credentials: 'omit' })
    } catch (err) {
      throw new NetworkError(url, err)
    }
    if (res.status === 401) {
      if (loggedIn) options.onUnauthorized?.()
      throw new UnauthorizedError(url)
    }
    if (res.status === 412) throw new ConflictError(url)
    if (res.status === 404) throw new NotFoundError(url)
    if (res.status >= 400) throw new DavError(`${res.status} ${res.statusText}`, res.status, url)
    return res
  }

  const account = (): DAVAccount => ({
    accountType: 'caldav',
    serverUrl,
    rootUrl: serverUrl,
    principalUrl: principalUrl ?? undefined,
    homeUrl: homeUrl ?? undefined,
  })

  async function discover(): Promise<{ principalUrl: string; homeUrl: string }> {
    if (principalUrl && homeUrl) return { principalUrl, homeUrl }
    const principal = await fetchPrincipalUrl({ account: account(), fetch: davFetch })
    principalUrl = new URL(principal, serverUrl).href
    const home = await fetchHomeUrl({ account: account(), fetch: davFetch })
    homeUrl = new URL(home, serverUrl).href
    if (!homeUrl.endsWith('/')) homeUrl += '/'
    return { principalUrl, homeUrl }
  }

  function toObject(res: DAVResponse, collection: Collection): CalendarObject | null {
    const data = davText(res.props?.calendarData)
    const etag = davText(res.props?.getetag)
    if (!res.href || !data || !etag) return null
    return { url: new URL(res.href, serverUrl).href, collectionUrl: collection.url, etag, data }
  }

  async function query(collection: Collection, filters: unknown): Promise<CalendarObject[]> {
    const responses = await calendarQuery({
      url: collection.url,
      props: { 'd:getetag': {}, 'c:calendar-data': {} },
      filters: filters as never,
      depth: '1',
      fetch: davFetch,
    })
    return responses
      .map((r) => toObject(r, collection))
      .filter((o): o is CalendarObject => o !== null)
  }

  async function readBack(
    collection: Collection,
    url: string,
    etagHeader: string | null,
    data: string,
  ) {
    if (etagHeader) return { url, collectionUrl: collection.url, etag: etagHeader, data }
    const [fresh] = await client.fetchObjects(collection, [url])
    if (!fresh) throw new NotFoundError(url)
    return fresh
  }

  let username = options.username ?? ''

  const client: CalDavClient = {
    serverUrl,
    get username() {
      return username
    },

    async login() {
      loggedIn = false
      principalUrl = null
      homeUrl = null
      const result = await discover()
      loggedIn = true
      if (!username)
        username = decodeURIComponent(result.principalUrl.replace(/\/$/, '').split('/').pop() ?? '')
      return result
    },

    async listCollections() {
      const { homeUrl: home } = await discover()
      const responses = await propfind({
        url: home,
        props: PROPFIND_COLLECTION_PROPS,
        depth: '1',
        fetch: davFetch,
      })
      return responses
        .map((r) => toCollection(r, serverUrl))
        .filter((c): c is Collection => c !== null)
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
    },

    async fetchCtags() {
      const collections = await client.listCollections()
      return new Map(collections.filter((c) => c.ctag).map((c) => [c.url, c.ctag as string]))
    },

    fetchEvents(collection, range) {
      return query(collection, [
        {
          'comp-filter': {
            _attributes: { name: 'VCALENDAR' },
            'comp-filter': {
              _attributes: { name: 'VEVENT' },
              'time-range': {
                _attributes: { start: toDavUtc(range.start), end: toDavUtc(range.end) },
              },
            },
          },
        },
      ])
    },

    fetchTasks(collection) {
      return query(collection, [
        {
          'comp-filter': {
            _attributes: { name: 'VCALENDAR' },
            'comp-filter': { _attributes: { name: 'VTODO' } },
          },
        },
      ])
    },

    async fetchObjects(collection, urls) {
      if (urls.length === 0) return []
      // Hand-rolled calendar-multiget: tsdav's helper throws when any href comes back 404,
      // but a deleted object is a normal outcome here (we just omit it).
      const responses = await davRequest({
        url: collection.url,
        init: {
          method: 'REPORT',
          headers: { depth: '1' },
          namespace: 'c',
          body: {
            'calendar-multiget': {
              _attributes: { 'xmlns:d': 'DAV:', 'xmlns:c': 'urn:ietf:params:xml:ns:caldav' },
              'd:prop': { 'd:getetag': {}, 'c:calendar-data': {} },
              'd:href': urls.map((u) => new URL(u, serverUrl).pathname),
            },
          },
        },
        fetch: davFetch,
      })
      return responses
        .filter((r) => r.ok && r.status < 400)
        .map((r) => toObject(r, collection))
        .filter((o): o is CalendarObject => o !== null)
    },

    async createObject(collection, ics, uid = newUid()) {
      const url = objectUrlFor(collection, uid)
      const data = stampForWrite(ics)
      const res = await createObject({
        url,
        data,
        headers: { 'content-type': 'text/calendar; charset=utf-8', 'If-None-Match': '*' },
        fetch: davFetch,
      })
      return readBack(collection, url, res.headers.get('etag'), data)
    },

    async updateObject(object, ics) {
      const data = stampForWrite(ics)
      const res = await updateObject({
        url: object.url,
        data,
        etag: object.etag,
        headers: { 'content-type': 'text/calendar; charset=utf-8' },
        fetch: davFetch,
      })
      const collection = { url: object.collectionUrl } as Collection
      return readBack(collection, object.url, res.headers.get('etag'), data)
    },

    async deleteObject(object) {
      await deleteObject({ url: object.url, etag: object.etag, fetch: davFetch })
    },
  }

  return client
}
