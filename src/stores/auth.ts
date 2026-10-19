/**
 * Connection state. There is no login screen: the reverse proxy (nginx in production, Vite in
 * development) adds the Basic-auth header for Radicale, so the app just discovers the account
 * on start. A 401 means the proxy credentials were rejected and is shown as an error screen.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { type CalDavClient, createCalDavClient, defaultServerUrl } from '@/api/caldav'
import { DavError, NetworkError, UnauthorizedError } from '@/api/errors'

export type AuthStatus = 'idle' | 'connecting' | 'connected' | 'error'
export type DisconnectReason = 'unauthorized' | 'manual' | null

export class ConnectError extends Error {
  readonly kind: 'credentials' | 'network' | 'server'
  constructor(kind: ConnectError['kind'], message: string) {
    super(message)
    this.name = 'ConnectError'
    this.kind = kind
  }
}

export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus>('idle')
  const username = ref('')
  const serverUrl = ref('')
  const error = ref<ConnectError | null>(null)
  const client = shallowRef<CalDavClient | null>(null)
  /** Listeners run on disconnect so other stores drop their data and the sync loop stops. */
  const listeners = new Set<(reason: DisconnectReason) => void>()
  let inFlight: Promise<boolean> | null = null

  const isAuthenticated = computed(() => status.value === 'connected' && client.value !== null)

  function requireClient(): CalDavClient {
    if (!client.value) throw new Error('Not connected')
    return client.value
  }

  function onUnauthorized() {
    disconnect('unauthorized')
    error.value = new ConnectError(
      'credentials',
      'The calendar server rejected the configured credentials',
    )
    status.value = 'error'
  }

  /** Discovers the account through the proxy. Resolves to true when connected. */
  function connect(options: { serverUrl?: string } = {}): Promise<boolean> {
    if (isAuthenticated.value) return Promise.resolve(true)
    if (inFlight) return inFlight
    status.value = 'connecting'
    error.value = null
    const server = options.serverUrl ?? defaultServerUrl()
    const next = createCalDavClient({ serverUrl: server, onUnauthorized })
    inFlight = next
      .login()
      .then(() => {
        client.value = next
        username.value = next.username
        serverUrl.value = server
        status.value = 'connected'
        return true
      })
      .catch((err: unknown) => {
        status.value = 'error'
        error.value =
          err instanceof UnauthorizedError
            ? new ConnectError(
                'credentials',
                'The calendar server rejected the configured credentials',
              )
            : err instanceof NetworkError
              ? new ConnectError('network', 'Cannot reach the calendar server')
              : new ConnectError(
                  'server',
                  err instanceof DavError ? err.message : 'Could not connect',
                )
        return false
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  function disconnect(reason: DisconnectReason = 'manual') {
    const was = client.value !== null
    client.value = null
    status.value = 'idle'
    username.value = ''
    if (was) for (const fn of listeners) fn(reason)
  }

  function onDisconnect(fn: (reason: DisconnectReason) => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  /** Test hook: installs a ready client without talking to a server. */
  function _setClient(next: CalDavClient | null) {
    client.value = next
    status.value = next ? 'connected' : 'idle'
    username.value = next?.username ?? ''
    serverUrl.value = next?.serverUrl ?? ''
    error.value = null
  }

  return {
    status,
    username,
    serverUrl,
    error,
    client,
    isAuthenticated,
    requireClient,
    connect,
    disconnect,
    onDisconnect,
    _setClient,
  }
})
