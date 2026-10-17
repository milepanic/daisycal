/** Toasts for failed writes (with optional retry) and the "server unreachable" banner. */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { NetworkError, UnauthorizedError } from '@/api/errors'

export interface Toast {
  id: number
  message: string
  kind: 'error' | 'info' | 'success'
  retry?: () => void | Promise<unknown>
  /** ms; 0 keeps it until dismissed */
  timeout: number
}

export const useNotificationsStore = defineStore('notifications', () => {
  const toasts = ref<Toast[]>([])
  /** Set while the server cannot be reached (poll failed or a write got a NetworkError). */
  const offline = ref(false)
  let nextId = 1
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
  }

  function push(message: string, options: Partial<Omit<Toast, 'id' | 'message'>> = {}): number {
    const id = nextId++
    const toast: Toast = {
      id,
      message,
      kind: options.kind ?? 'error',
      retry: options.retry,
      timeout: options.timeout ?? (options.retry ? 0 : 6000),
    }
    toasts.value = [...toasts.value, toast]
    if (toast.timeout > 0)
      timers.set(
        id,
        setTimeout(() => dismiss(id), toast.timeout),
      )
    return id
  }

  /** Reports a failed write: marks the server offline for network failures and shows a toast with Retry. */
  function reportError(
    err: unknown,
    context: string,
    retry?: () => void | Promise<unknown>,
  ): number | null {
    if (err instanceof UnauthorizedError) return null // the auth store already redirects to login
    if (err instanceof NetworkError) offline.value = true
    const detail =
      err instanceof NetworkError
        ? 'the server is unreachable'
        : err instanceof Error
          ? err.message
          : String(err)
    return push(`${context}: ${detail}`, {
      kind: 'error',
      retry: retry
        ? async () => {
            await retry()
            offline.value = false
          }
        : undefined,
    })
  }

  function setOffline(value: boolean) {
    offline.value = value
  }

  function clear() {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    toasts.value = []
  }

  const hasToasts = computed(() => toasts.value.length > 0)

  return { toasts, offline, hasToasts, push, dismiss, reportError, setOffline, clear }
})
