/** Collections (calendars and task lists) with per-collection visibility persisted locally. */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import type { Collection } from '@/api/collections'
import { readJson, writeJson } from '@/lib/storage'
import { useAuthStore } from './auth'
import { useHistoryStore } from './history'

const HIDDEN_KEY = 'daisycal.hiddenCollections'
/** Used when a collection has no calendar-color. */
export const FALLBACK_COLOR = '#566c86'

export const useCalendarsStore = defineStore('calendars', () => {
  const auth = useAuthStore()
  const collections = ref<Collection[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const error = ref<string | null>(null)
  const hidden = ref<Set<string>>(new Set(readJson<string[]>('local', HIDDEN_KEY, [])))

  watch(hidden, (set) => writeJson('local', HIDDEN_KEY, [...set]), { deep: true, flush: 'sync' })

  const calendars = computed(() => collections.value.filter((c) => c.kind === 'calendar'))
  const taskLists = computed(() => collections.value.filter((c) => c.kind === 'tasks'))
  const visibleCalendars = computed(() => calendars.value.filter((c) => !hidden.value.has(c.url)))
  const visibleTaskLists = computed(() => taskLists.value.filter((c) => !hidden.value.has(c.url)))
  const byUrl = computed(() => new Map(collections.value.map((c) => [c.url, c])))

  function get(url: string): Collection | undefined {
    return byUrl.value.get(url)
  }
  function colorFor(url: string): string {
    return byUrl.value.get(url)?.color ?? FALLBACK_COLOR
  }
  function isVisible(url: string): boolean {
    return !hidden.value.has(url)
  }
  function setVisible(url: string, visible: boolean) {
    const next = new Set(hidden.value)
    if (visible) next.delete(url)
    else next.add(url)
    hidden.value = next
  }
  function toggleVisible(url: string) {
    setVisible(url, !isVisible(url))
  }

  let inFlight: Promise<void> | null = null
  async function load(): Promise<void> {
    if (inFlight) return inFlight
    status.value = 'loading'
    error.value = null
    inFlight = auth
      .requireClient()
      .listCollections()
      .then((list) => {
        collections.value = list
        status.value = 'ready'
      })
      .catch((err: unknown) => {
        status.value = 'error'
        error.value = err instanceof Error ? err.message : String(err)
        throw err
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  /** Applies fresh ctags (from the sync loop) without a full reload. */
  function updateCtags(ctags: Map<string, string>) {
    collections.value = collections.value.map((c) =>
      ctags.has(c.url) && ctags.get(c.url) !== c.ctag ? { ...c, ctag: ctags.get(c.url)! } : c,
    )
  }

  /**
   * Writes new colors (url → `#rrggbb`) to the server, one collection at a time, and records
   * one undo step that puts the old ones back. Collections already in that color are skipped.
   * Returns how many changed; on a failure the ones written so far stay (and can be undone).
   */
  async function setColors(colors: Map<string, string>): Promise<number> {
    const client = auth.requireClient()
    const previous = new Map<string, string>()
    try {
      for (const [url, color] of colors) {
        const c = get(url)
        if (!c || c.color?.toLowerCase() === color.toLowerCase()) continue
        await client.setCollectionColor(c, color)
        previous.set(url, c.color ?? FALLBACK_COLOR)
        collections.value = collections.value.map((x) => (x.url === url ? { ...x, color } : x))
      }
    } finally {
      if (previous.size) {
        const n = previous.size
        useHistoryStore().record(
          `Changed ${n} ${n === 1 ? 'color' : 'colors'}`,
          `colors:${[...previous.keys()].join(',')}`,
          () => setColorsQuietly(previous),
        )
      }
    }
    return previous.size
  }
  async function setColorsQuietly(colors: Map<string, string>) {
    const client = auth.requireClient()
    for (const [url, color] of colors) {
      const c = get(url)
      if (!c) continue
      await client.setCollectionColor(c, color)
      collections.value = collections.value.map((x) => (x.url === url ? { ...x, color } : x))
    }
  }

  function reset() {
    collections.value = []
    status.value = 'idle'
    error.value = null
  }

  auth.onDisconnect(reset)

  return {
    collections,
    status,
    error,
    hidden,
    calendars,
    taskLists,
    visibleCalendars,
    visibleTaskLists,
    get,
    colorFor,
    isVisible,
    setVisible,
    toggleVisible,
    load,
    setColors,
    updateCtags,
    reset,
  }
})
