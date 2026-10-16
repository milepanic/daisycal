/**
 * Polls collection ctags and reports which collections changed, so the stores can refetch
 * only what the phone (or another client) touched. Checks on an interval and whenever the
 * tab regains focus/visibility.
 */
export interface CtagWatcherOptions {
  fetchCtags: () => Promise<Map<string, string>>
  /** Called with the URLs of collections whose ctag changed, plus added/removed ones. */
  onChange: (changedUrls: string[], ctags: Map<string, string>) => void
  onError?: (err: unknown) => void
  intervalMs?: number
  /** Known ctags to compare the first poll against. Omit to treat the first poll as baseline. */
  initial?: Map<string, string>
}

export interface CtagWatcher {
  start(): void
  stop(): void
  /** Runs one check now (used after local writes to pick up the new ctag without a refetch). */
  check(): Promise<void>
  /** Records ctags we already know about, e.g. right after a full load. */
  prime(ctags: Map<string, string>): void
}

export function createCtagWatcher(options: CtagWatcherOptions): CtagWatcher {
  const intervalMs = options.intervalMs ?? 60_000
  let known: Map<string, string> | null = options.initial ? new Map(options.initial) : null
  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight: Promise<void> | null = null

  function diff(next: Map<string, string>): string[] {
    if (!known) return []
    const changed = new Set<string>()
    for (const [url, ctag] of next) if (known.get(url) !== ctag) changed.add(url)
    for (const url of known.keys()) if (!next.has(url)) changed.add(url)
    return [...changed]
  }

  async function check() {
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        const next = await options.fetchCtags()
        const changed = diff(next)
        known = next
        if (changed.length > 0) options.onChange(changed, next)
      } catch (err) {
        options.onError?.(err)
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') void check()
  }
  const onFocus = () => void check()

  return {
    start() {
      if (timer) return
      timer = setInterval(() => void check(), intervalMs)
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
      if (typeof window !== 'undefined') window.addEventListener('focus', onFocus)
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', onVisible)
      if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus)
    },
    check,
    prime(ctags) {
      known = new Map(ctags)
    },
  }
}
