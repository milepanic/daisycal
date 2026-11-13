import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { taskToForm } from '@/api/ical'
import { useAuthStore } from '../auth'
import { useCalendarsStore } from '../calendars'
import { useHistoryStore } from '../history'
import { useNotificationsStore } from '../notifications'
import { useTasksStore } from '../tasks'
import { FakeClient, MY_TASKS, todoIcs } from './fakeClient'

let client: FakeClient
const SHOPPING = {
  ...MY_TASKS,
  url: MY_TASKS.url.replace('my-tasks', 'shopping'),
  displayName: 'Shopping',
}

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  client = new FakeClient()
  client.collections = [...client.collections, SHOPPING]
  // A task written by another client: its file name is not its UID.
  client.objects.set(`${MY_TASKS.url}FROM-PHONE.ics`, {
    url: `${MY_TASKS.url}FROM-PHONE.ics`,
    collectionUrl: MY_TASKS.url,
    etag: '"p1"',
    data: todoIcs('phone-uid', 'Call bank', 'DUE:20261015T150000Z\r\n'),
  })
  useAuthStore()._setClient(client)
  await useCalendarsStore().load()
  await useTasksStore().ensureLoaded()
})

const task = () => useTasksStore().get(`${MY_TASKS.url}FROM-PHONE.ics`)

describe('undo', () => {
  it('reverts an edit and a completion, latest first, with a toast for each', async () => {
    const tasks = useTasksStore()
    const history = useHistoryStore()
    await tasks.updateTask(task()!, { ...taskToForm(task()!), summary: 'Call the bank' })
    await new Promise((r) => setTimeout(r, 0))
    history.entries[0]!.at -= 5000 // a separate change, not merged with the next one
    await tasks.setCompleted(task()!, true)
    expect(useNotificationsStore().toasts.map((t) => t.message)).toContain(
      'Completed "Call the bank"',
    )

    await history.undo()
    expect(task()!.completed).toBe(false)
    expect(task()!.summary).toBe('Call the bank')
    await history.undo()
    expect(task()!.summary).toBe('Call bank')
    expect(client.objects.get(`${MY_TASKS.url}FROM-PHONE.ics`)!.data).toContain('SUMMARY:Call bank')
    // Undoing records nothing new.
    expect(history.canUndo()).toBe(false)
  })

  it('brings a deleted task back at its old URL', async () => {
    await useTasksStore().deleteTask(task()!)
    expect(client.objects.has(`${MY_TASKS.url}FROM-PHONE.ics`)).toBe(false)
    const toast = useNotificationsStore().toasts.find((t) => t.message === 'Deleted "Call bank"')!
    await toast.action!.run()
    await flushPromises()
    expect(client.objects.get(`${MY_TASKS.url}FROM-PHONE.ics`)!.data).toContain('UID:phone-uid')
    expect(task()!.summary).toBe('Call bank')
    expect(useNotificationsStore().toasts.some((t) => t.message.startsWith('Deleted'))).toBe(false)
  })

  it('undoes a move to another list together with the edit saved with it', async () => {
    const tasks = useTasksStore()
    const moved = await tasks.moveTask(task()!, SHOPPING)
    await tasks.updateTask(moved, { ...taskToForm(moved), summary: 'Call bank (moved)' })
    // One Save = one entry.
    expect(useHistoryStore().entries).toHaveLength(1)
    await useHistoryStore().undo()
    expect([...client.objects.keys()].filter((u) => u.includes('shopping'))).toEqual([])
    expect(task()!.summary).toBe('Call bank')
    expect(task()!.collectionUrl).toBe(MY_TASKS.url)
  })

  it('removes a copy again', async () => {
    const copy = await useTasksStore().createTask(MY_TASKS, taskToForm(task()!), {
      undoLabel: 'Copied "Call bank"',
    })
    expect(client.objects.has(copy.objectUrl)).toBe(true)
    await useHistoryStore().undo()
    expect(client.objects.has(copy.objectUrl)).toBe(false)
    expect(useTasksStore().get(copy.objectUrl)).toBeUndefined()
    expect(task()).toBeDefined()
  })

  it('completes and deletes a task with its subtasks, undone in one step', async () => {
    const tasks = useTasksStore()
    client.seed(MY_TASKS, 'sub1', todoIcs('sub1', 'Find card', 'RELATED-TO:phone-uid\r\n'))
    client.seed(
      MY_TASKS,
      'sub2',
      todoIcs('sub2', 'Write PIN', 'RELATED-TO;RELTYPE=PARENT:phone-uid\r\n'),
    )
    await tasks.refresh([MY_TASKS.url])
    const sub = (id: string) => tasks.get(`${MY_TASKS.url}${id}.ics`)
    await tasks.setCompleted(task()!, true)
    expect([task()!.completed, sub('sub1')!.completed, sub('sub2')!.completed]).toEqual([
      true,
      true,
      true,
    ])
    expect(useHistoryStore().entries).toHaveLength(1)
    await useHistoryStore().undo()
    expect([task()!.completed, sub('sub1')!.completed, sub('sub2')!.completed]).toEqual([
      false,
      false,
      false,
    ])

    await tasks.deleteTask(task()!)
    expect([task(), sub('sub1'), sub('sub2')]).toEqual([undefined, undefined, undefined])
    await useHistoryStore().undo()
    expect([task(), sub('sub1'), sub('sub2')].map((x) => x?.summary)).toEqual([
      'Call bank',
      'Find card',
      'Write PIN',
    ])
  })

  it('reports a failed undo and forgets everything on logout', async () => {
    const tasks = useTasksStore()
    await tasks.setCompleted(task()!, true)
    client.failNext = { op: 'update', error: new Error('boom') }
    await useHistoryStore().undo()
    expect(useNotificationsStore().toasts.map((t) => t.message)).toContain(
      'Could not undo "Completed "Call bank"": boom',
    )
    await tasks.setCompleted(task()!, false)
    useAuthStore().disconnect()
    expect(useHistoryStore().canUndo()).toBe(false)
  })
})
