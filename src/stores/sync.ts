/**
 * Keeps the caches in step with the server: polls collection ctags (interval + tab focus) and
 * refreshes only the collections that changed, so edits made on the phone show up without a
 * full reload. Also notices collections being added or removed.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { type CtagWatcher, createCtagWatcher } from '@/api/ctagWatcher'
import { useAuthStore } from './auth'
import { useCalendarsStore } from './calendars'
import { useEventsStore } from './events'
import { useTasksStore } from './tasks'

export const DEFAULT_SYNC_INTERVAL_MS = 60_000

export const useSyncStore = defineStore('sync', () => {
  const auth = useAuthStore()
  const calendars = useCalendarsStore()
  const events = useEventsStore()
  const tasks = useTasksStore()

  const running = ref(false)
  const lastSyncAt = ref<Date | null>(null)
  const lastError = ref<string | null>(null)
  let watcher: CtagWatcher | null = null

  async function handleChange(changedUrls: string[], ctags: Map<string, string>) {
    const known = new Set(calendars.collections.map((c) => c.url))
    const structural =
      changedUrls.some((u) => !known.has(u)) || [...known].some((u) => !ctags.has(u))
    if (structural) await calendars.load().catch(() => undefined)
    calendars.updateCtags(ctags)
    const eventUrls = changedUrls.filter((u) => calendars.get(u)?.kind === 'calendar')
    const taskUrls = changedUrls.filter((u) => calendars.get(u)?.kind === 'tasks')
    await Promise.all([
      eventUrls.length ? events.refresh(eventUrls) : Promise.resolve(),
      taskUrls.length ? tasks.refresh(taskUrls) : Promise.resolve(),
    ])
  }

  function start(intervalMs = DEFAULT_SYNC_INTERVAL_MS) {
    if (watcher) return
    const client = auth.requireClient()
    watcher = createCtagWatcher({
      intervalMs,
      initial: new Map(calendars.collections.filter((c) => c.ctag).map((c) => [c.url, c.ctag!])),
      fetchCtags: () => client.fetchCtags(),
      onChange: (urls, ctags) => {
        lastError.value = null
        void handleChange(urls, ctags)
      },
      onError: (err) => {
        lastError.value = err instanceof Error ? err.message : String(err)
      },
    })
    watcher.start()
    running.value = true
  }

  function stop() {
    watcher?.stop()
    watcher = null
    running.value = false
  }

  /** One immediate check (e.g. after the user hits "refresh"). */
  async function syncNow() {
    if (!watcher) return
    await watcher.check()
    lastSyncAt.value = new Date()
  }

  auth.onLogout(stop)

  return { running, lastSyncAt, lastError, start, stop, syncNow }
})
