import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCalDavClient } from '@/api/caldav'
import { LoginError, useAuthStore } from '../auth'

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
      <current-user-principal><href>/dav/daisy/</href></current-user-principal>
      <C:calendar-home-set><href>/dav/daisy/</href></C:calendar-home-set>
    </prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`,
    { status: 207, headers: { 'content-type': 'application/xml' } },
  )
}) as typeof fetch
const badFetch = (async () => new Response(null, { status: 401 })) as typeof fetch
const downFetch = (async () => {
  throw new TypeError('Failed to fetch')
}) as typeof fetch

function useFetch(fetchImpl: typeof fetch) {
  vi.mocked(createCalDavClient).mockImplementation((opts) =>
    original({ ...opts, fetch: fetchImpl }),
  )
}
let original: typeof createCalDavClient

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  sessionStorage.clear()
  original = (await vi.importActual<typeof import('@/api/caldav')>('@/api/caldav'))
    .createCalDavClient
})

describe('auth store', () => {
  it('logs in, stores the session in sessionStorage by default and restores it', async () => {
    useFetch(okFetch)
    const auth = useAuthStore()
    await auth.login('daisy', 'secret')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.username).toBe('daisy')
    expect(sessionStorage.getItem('daisycal.session')).toContain('daisy')
    expect(localStorage.getItem('daisycal.session')).toBeNull()

    setActivePinia(createPinia())
    const fresh = useAuthStore()
    expect(fresh.isAuthenticated).toBe(false)
    await expect(fresh.restore()).resolves.toBe(true)
    expect(fresh.username).toBe('daisy')
  })

  it('uses localStorage with remember me', async () => {
    useFetch(okFetch)
    const auth = useAuthStore()
    await auth.login('daisy', 'secret', { remember: true })
    expect(localStorage.getItem('daisycal.session')).toContain('daisy')
    expect(sessionStorage.getItem('daisycal.session')).toBeNull()
    expect(JSON.parse(localStorage.getItem('daisycal.session')!).secret).not.toBe('secret')
  })

  it('maps failures to LoginError kinds and stays anonymous', async () => {
    const auth = useAuthStore()
    useFetch(badFetch)
    await expect(auth.login('daisy', 'nope')).rejects.toMatchObject({ kind: 'credentials' })
    useFetch(downFetch)
    await expect(auth.login('daisy', 'nope')).rejects.toBeInstanceOf(LoginError)
    await expect(auth.login('daisy', 'nope')).rejects.toMatchObject({ kind: 'network' })
    expect(auth.status).toBe('anonymous')
    expect(sessionStorage.getItem('daisycal.session')).toBeNull()
  })

  it('logout clears the session and notifies listeners; a 401 later logs out as expired', async () => {
    let requests = 0
    useFetch((async (input, init) => {
      requests++
      return requests > 2 ? new Response(null, { status: 401 }) : okFetch(input, init)
    }) as typeof fetch)
    const auth = useAuthStore()
    const listener = vi.fn<(reason: string | null) => void>()
    auth.onLogout(listener)
    await auth.login('daisy', 'secret')
    await expect(auth.requireClient().listCollections()).rejects.toThrow('Not authorized')
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.lastLogoutReason).toBe('expired')
    expect(listener).toHaveBeenCalledWith('expired')
    expect(sessionStorage.getItem('daisycal.session')).toBeNull()
    expect(() => auth.requireClient()).toThrow('Not logged in')
  })

  it('restore drops a stored session the server rejects', async () => {
    sessionStorage.setItem(
      'daisycal.session',
      JSON.stringify({ username: 'daisy', secret: btoa('old'), serverUrl: '' }),
    )
    useFetch(badFetch)
    const auth = useAuthStore()
    await expect(auth.restore()).resolves.toBe(false)
    expect(sessionStorage.getItem('daisycal.session')).toBeNull()
  })
})
