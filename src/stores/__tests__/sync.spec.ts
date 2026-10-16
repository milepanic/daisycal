import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '../auth'
import { useCalendarsStore } from '../calendars'
import { useEventsStore } from '../events'
import { useSyncStore } from '../sync'
import { useTasksStore } from '../tasks'
import { FakeClient, MY_TASKS, PERSONAL, WORK, eventIcs, todoIcs } from './fakeClient'

let client: FakeClient
const OCT = { start: new Date(2026, 9, 12), end: new Date(2026, 9, 19) }

beforeEach(async () => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  localStorage.clear()
  client = new FakeClient()
  client.seed(WORK, 'review', eventIcs('review', 'Review', '20261014T120000Z', '20261014T130000Z'))
  client.seed(MY_TASKS, 'a', todoIcs('a', 'Task A'))
  useAuthStore()._setClient(client)
  await useCalendarsStore().load()
})
afterEach(() => vi.useRealTimers())

describe('sync store', () => {
  it('refreshes only the collections whose ctag changed', async () => {
    const events = useEventsStore()
    const tasks = useTasksStore()
    const sync = useSyncStore()
    await events.ensureLoaded(OCT)
    await tasks.ensureLoaded()
    sync.start(1000)
    expect(sync.running).toBe(true)
    const eventFetches = client.fetchEvents.mock.calls.length
    const taskFetches = client.fetchTasks.mock.calls.length

    // Nothing changed: a poll fetches ctags only.
    await vi.advanceTimersByTimeAsync(1000)
    expect(client.fetchEvents).toHaveBeenCalledTimes(eventFetches)

    // The phone adds a task.
    client.seed(MY_TASKS, 'b', todoIcs('b', 'From phone'))
    client.touch(MY_TASKS.url)
    await vi.advanceTimersByTimeAsync(1000)
    expect(client.fetchTasks).toHaveBeenCalledTimes(taskFetches + 1)
    expect(client.fetchEvents).toHaveBeenCalledTimes(eventFetches)
    expect(tasks.tasksFor(MY_TASKS.url).map((t) => t.summary)).toContain('From phone')
    expect(useCalendarsStore().get(MY_TASKS.url)?.ctag).toContain(':1"')

    // The phone edits an event in Work; Personal untouched.
    client.touch(WORK.url)
    await vi.advanceTimersByTimeAsync(1000)
    expect(client.fetchEvents.mock.calls.slice(eventFetches).map((c) => c[0].displayName)).toEqual([
      'Work',
    ])

    sync.stop()
    client.touch(PERSONAL.url)
    await vi.advanceTimersByTimeAsync(3000)
    expect(client.fetchEvents).toHaveBeenCalledTimes(eventFetches + 1)
  })

  it('reloads the collection list when a collection appears or disappears', async () => {
    const calendars = useCalendarsStore()
    const sync = useSyncStore()
    sync.start(1000)
    const listCalls = client.listCollections.mock.calls.length
    client.collections = [
      ...client.collections,
      { ...PERSONAL, url: `${PERSONAL.url}../new/`, displayName: 'New' },
    ]
    await vi.advanceTimersByTimeAsync(1000)
    expect(client.listCollections).toHaveBeenCalledTimes(listCalls + 1)
    expect(calendars.collections.map((c) => c.displayName)).toContain('New')
  })

  it('records poll errors and stops on logout', async () => {
    const sync = useSyncStore()
    sync.start(1000)
    client.fetchCtags.mockRejectedValueOnce(new Error('offline'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(sync.lastError).toBe('offline')
    useAuthStore().logout()
    expect(sync.running).toBe(false)
  })
})
