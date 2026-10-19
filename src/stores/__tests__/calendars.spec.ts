import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '../auth'
import { useCalendarsStore } from '../calendars'
import { FakeClient, MY_TASKS, PERSONAL, WORK } from './fakeClient'

let client: FakeClient

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  client = new FakeClient()
  useAuthStore()._setClient(client)
})

describe('calendars store', () => {
  it('loads and splits collections, resolves colors', async () => {
    const store = useCalendarsStore()
    await store.load()
    expect(store.status).toBe('ready')
    expect(store.calendars.map((c) => c.displayName)).toEqual(['Work', 'Personal'])
    expect(store.taskLists.map((c) => c.displayName)).toEqual(['My tasks'])
    expect(store.colorFor(WORK.url)).toBe('#225688')
    expect(store.colorFor('nope')).toBe('#566c86')
    expect(store.get(MY_TASKS.url)?.kind).toBe('tasks')
  })

  it('persists visibility across stores', async () => {
    const store = useCalendarsStore()
    await store.load()
    store.toggleVisible(PERSONAL.url)
    expect(store.isVisible(PERSONAL.url)).toBe(false)
    expect(store.visibleCalendars.map((c) => c.url)).toEqual([WORK.url])
    expect(JSON.parse(localStorage.getItem('daisycal.hiddenCollections')!)).toEqual([PERSONAL.url])

    setActivePinia(createPinia())
    useAuthStore()._setClient(client)
    const again = useCalendarsStore()
    expect(again.isVisible(PERSONAL.url)).toBe(false)
    again.setVisible(PERSONAL.url, true)
    expect(again.hidden.size).toBe(0)
  })

  it('updates ctags in place and resets on logout', async () => {
    const auth = useAuthStore()
    const store = useCalendarsStore()
    await store.load()
    store.updateCtags(new Map([[WORK.url, '"new"']]))
    expect(store.get(WORK.url)?.ctag).toBe('"new"')
    auth.disconnect()
    expect(store.collections).toEqual([])
    expect(store.status).toBe('idle')
  })

  it('records errors', async () => {
    const store = useCalendarsStore()
    client.listCollections.mockRejectedValueOnce(new Error('boom'))
    await expect(store.load()).rejects.toThrow('boom')
    expect(store.status).toBe('error')
    expect(store.error).toBe('boom')
  })
})
