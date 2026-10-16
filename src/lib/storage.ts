/** Safe JSON access to Web Storage: every call is guarded, missing/invalid values yield the fallback. */

type StorageKind = 'local' | 'session'

function storage(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function readJson<T>(kind: StorageKind, key: string, fallback: T): T {
  try {
    const raw = storage(kind)?.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeJson(kind: StorageKind, key: string, value: unknown): void {
  try {
    storage(kind)?.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / private mode: ignore */
  }
}

export function remove(kind: StorageKind, key: string): void {
  try {
    storage(kind)?.removeItem(key)
  } catch {
    /* ignore */
  }
}
