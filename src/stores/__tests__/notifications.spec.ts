import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConflictError, NetworkError, UnauthorizedError } from '@/api/errors'
import { useNotificationsStore } from '../notifications'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('notifications store', () => {
  it('auto-dismisses plain toasts and keeps ones with retry', () => {
    const n = useNotificationsStore()
    n.push('saved', { kind: 'success' })
    n.push('failed', { retry: () => undefined })
    expect(n.toasts).toHaveLength(2)
    vi.advanceTimersByTime(7000)
    expect(n.toasts.map((t) => t.message)).toEqual(['failed'])
    n.dismiss(n.toasts[0]!.id)
    expect(n.hasToasts).toBe(false)
  })

  it('reportError marks the server offline for network failures and clears it on a successful retry', async () => {
    const n = useNotificationsStore()
    const retry = vi.fn<() => Promise<void>>().mockResolvedValue()
    n.reportError(new NetworkError('u'), 'Could not save', retry)
    expect(n.offline).toBe(true)
    expect(n.toasts[0]!.message).toBe('Could not save: the server is unreachable')
    await n.toasts[0]!.retry!()
    expect(retry).toHaveBeenCalledOnce()
    expect(n.offline).toBe(false)

    n.reportError(new ConflictError('u'), 'Could not save')
    expect(n.offline).toBe(false)
    expect(n.toasts[n.toasts.length - 1]!.message).toContain('modified on the server')
    expect(n.reportError(new UnauthorizedError('u'), 'x')).toBeNull()
  })
})
