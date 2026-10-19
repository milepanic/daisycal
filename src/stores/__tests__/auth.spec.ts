import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCalDavClient } from '@/api/caldav'
import { ConnectError, useAuthStore } from '../auth'

vi.mock('@/api/caldav', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/caldav')>()
  return {
    ...actual,
    createCalDavClient: vi.fn<typeof actual.createCalDavClient>(actual.createCalDavClient),
    defaultServerUrl: () => 'https://daisycal.home/dav/',
  }
})

const okFetch = (async (input: RequestInfo | URL) => {
  const path = new URL(typeof input === 'string' ? input : (input as URL).href).pathname
  return new Response(
    `<?xml version="1.0"?><multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><response><href>${path}</href><propstat><prop>
      <current-user-principal><href>/dav/mile/</href></current-user-principal>
      <C:calendar-home-set><href>/dav/mile/</href></C:calendar-home-set>
    </prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`,
    { status: 207, headers: { 'content-type': 'application/xml' } },
  )
}) as typeof fetch
const badFetch = (async () => new Response(null, { status: 401 })) as typeof fetch
const downFetch = (async () => {
  throw new TypeError('Failed to fetch')
}) as typeof fetch

let original: typeof createCalDavClient
let lastHeaders: Headers | null = null
function useFetch(fetchImpl: typeof fetch) {
  vi.mocked(createCalDavClient).mockImplementation((opts) =>
    original({
      ...opts,
      fetch: ((input, init) => {
        lastHeaders = new Headers(init?.headers)
        return fetchImpl(input, init)
      }) as typeof fetch,
    }),
  )
}

beforeEach(async () => {
  setActivePinia(createPinia())
  lastHeaders = null
  original = (await vi.importActual<typeof import('@/api/caldav')>('@/api/caldav'))
    .createCalDavClient
})

describe('auth store (proxy-authenticated, no login screen)', () => {
  it('connects on demand, sends no Authorization itself and learns the user from the principal', async () => {
    useFetch(okFetch)
    const auth = useAuthStore()
    const p1 = auth.connect()
    const p2 = auth.connect()
    expect(auth.status).toBe('connecting')
    await expect(p1).resolves.toBe(true)
    await expect(p2).resolves.toBe(true)
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.username).toBe('mile')
    expect(lastHeaders?.has('authorization')).toBe(false)
    expect(vi.mocked(createCalDavClient)).toHaveBeenCalledTimes(1)
  })

  it('maps rejected credentials and unreachable servers to typed errors', async () => {
    const auth = useAuthStore()
    useFetch(badFetch)
    await expect(auth.connect()).resolves.toBe(false)
    expect(auth.status).toBe('error')
    expect(auth.error).toBeInstanceOf(ConnectError)
    expect(auth.error?.kind).toBe('credentials')
    useFetch(downFetch)
    await expect(auth.connect()).resolves.toBe(false)
    expect(auth.error?.kind).toBe('network')
    expect(() => auth.requireClient()).toThrow('Not connected')
  })

  it('a 401 after connecting disconnects, notifies listeners and shows a credentials error', async () => {
    let requests = 0
    useFetch((async (input, init) => {
      requests++
      return requests > 2 ? new Response(null, { status: 401 }) : okFetch(input, init)
    }) as typeof fetch)
    const auth = useAuthStore()
    const listener = vi.fn<(reason: string | null) => void>()
    auth.onDisconnect(listener)
    await auth.connect()
    await expect(auth.requireClient().listCollections()).rejects.toThrow('Not authorized')
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.status).toBe('error')
    expect(auth.error?.kind).toBe('credentials')
    expect(listener).toHaveBeenCalledWith('unauthorized')
  })
})
