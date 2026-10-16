/**
 * Session state. Credentials live in memory and, so a reload does not log the user out, in
 * sessionStorage; with "remember me" they go to localStorage instead. Basic auth means the
 * password itself is what we have to keep, hence the explicit opt-in.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { type CalDavClient, createCalDavClient, defaultServerUrl } from '@/api/caldav'
import { DavError, NetworkError, UnauthorizedError } from '@/api/errors'
import { readJson, remove, writeJson } from '@/lib/storage'

const STORAGE_KEY = 'daisycal.session'

interface StoredSession {
  username: string
  /** Base64 so it is at least not plain text in DevTools' storage panel. */
  secret: string
  serverUrl: string
}

export type AuthStatus = 'anonymous' | 'authenticating' | 'authenticated'
export type LogoutReason = 'user' | 'expired' | null

export class LoginError extends Error {
  readonly kind: 'credentials' | 'network' | 'server'
  constructor(kind: LoginError['kind'], message: string) {
    super(message)
    this.name = 'LoginError'
    this.kind = kind
  }
}

function encode(s: string) {
  return btoa(unescape(encodeURIComponent(s)))
}
function decode(s: string) {
  try {
    return decodeURIComponent(escape(atob(s)))
  } catch {
    return ''
  }
}

export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus>('anonymous')
  const username = ref('')
  const serverUrl = ref('')
  const remember = ref(false)
  const lastLogoutReason = ref<LogoutReason>(null)
  const client = shallowRef<CalDavClient | null>(null)
  /** Listeners run on logout so other stores can drop their data and the sync loop can stop. */
  const logoutListeners = new Set<(reason: LogoutReason) => void>()

  const isAuthenticated = computed(() => status.value === 'authenticated' && client.value !== null)

  function requireClient(): CalDavClient {
    if (!client.value) throw new Error('Not logged in')
    return client.value
  }

  function persist(session: StoredSession | null) {
    remove('local', STORAGE_KEY)
    remove('session', STORAGE_KEY)
    if (session) writeJson(remember.value ? 'local' : 'session', STORAGE_KEY, session)
  }

  function onUnauthorized() {
    logout('expired')
  }

  async function connect(user: string, password: string, server: string): Promise<void> {
    status.value = 'authenticating'
    const next = createCalDavClient({ serverUrl: server, username: user, password, onUnauthorized })
    try {
      await next.login()
    } catch (err) {
      status.value = 'anonymous'
      if (err instanceof UnauthorizedError)
        throw new LoginError('credentials', 'Wrong username or password')
      if (err instanceof NetworkError)
        throw new LoginError('network', 'Cannot reach the calendar server')
      throw new LoginError('server', err instanceof DavError ? err.message : 'Login failed')
    }
    client.value = next
    username.value = user
    serverUrl.value = server
    status.value = 'authenticated'
    lastLogoutReason.value = null
    persist({ username: user, secret: encode(password), serverUrl: server })
  }

  /** Logs in with the given credentials; throws `LoginError` on failure. */
  async function login(
    user: string,
    password: string,
    options: { remember?: boolean; serverUrl?: string } = {},
  ) {
    remember.value = options.remember ?? false
    await connect(user.trim(), password, options.serverUrl ?? defaultServerUrl())
  }

  /** Restores a stored session on app start. Resolves to true when logged in. */
  async function restore(): Promise<boolean> {
    if (isAuthenticated.value) return true
    const local = readJson<StoredSession | null>('local', STORAGE_KEY, null)
    const stored = local ?? readJson<StoredSession | null>('session', STORAGE_KEY, null)
    if (!stored?.username || !stored.secret) return false
    remember.value = local !== null
    try {
      await connect(stored.username, decode(stored.secret), stored.serverUrl || defaultServerUrl())
      return true
    } catch (err) {
      if (err instanceof LoginError && err.kind === 'credentials') persist(null)
      return false
    }
  }

  function logout(reason: LogoutReason = 'user') {
    const wasAuthenticated = client.value !== null
    client.value = null
    status.value = 'anonymous'
    username.value = ''
    lastLogoutReason.value = reason
    persist(null)
    if (wasAuthenticated) for (const fn of logoutListeners) fn(reason)
  }

  function onLogout(fn: (reason: LogoutReason) => void): () => void {
    logoutListeners.add(fn)
    return () => logoutListeners.delete(fn)
  }

  /** Test hook: installs a ready client without talking to a server. */
  function _setClient(next: CalDavClient | null) {
    client.value = next
    status.value = next ? 'authenticated' : 'anonymous'
    username.value = next?.username ?? ''
    serverUrl.value = next?.serverUrl ?? ''
  }

  return {
    status,
    username,
    serverUrl,
    remember,
    lastLogoutReason,
    client,
    isAuthenticated,
    requireClient,
    login,
    restore,
    logout,
    onLogout,
    _setClient,
  }
})
