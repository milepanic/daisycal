import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ConflictError, NetworkError } from '@/api/errors'
import { taskToForm } from '@/api/ical'
import { useAuthStore } from '../auth'
import { useCalendarsStore } from '../calendars'
import { compareTasks, useTasksStore } from '../tasks'
import { useUiStore } from '../ui'
import { FakeClient, MY_TASKS, todoIcs } from './fakeClient'

let client: FakeClient

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  client = new FakeClient()
  client.seed(MY_TASKS, 'a', todoIcs('a', 'Undated low', 'PRIORITY:9\r\n'))
  client.seed(MY_TASKS, 'b', todoIcs('b', 'Due later', 'DUE:20261020T100000Z\r\n'))
  client.seed(
    MY_TASKS,
    'c',
    todoIcs('c', 'Due soon high', 'DUE:20261016T100000Z\r\nPRIORITY:1\r\n'),
  )
  client.seed(
    MY_TASKS,
    'd',
    todoIcs('d', 'Done', 'STATUS:COMPLETED\r\nCOMPLETED:20261010T100000Z\r\n'),
  )
  useAuthStore()._setClient(client)
  await useCalendarsStore().load()
})

describe('tasks store', () => {
  it('loads lists once, sorts and filters completed', async () => {
    const tasks = useTasksStore()
    await tasks.ensureLoaded()
    expect(client.fetchTasks).toHaveBeenCalledTimes(1)
    expect(tasks.tasksFor(MY_TASKS.url).map((t) => t.summary)).toEqual([
      'Due soon high',
      'Due later',
      'Undated low',
      'Done',
    ])
    expect(tasks.tasksFor(MY_TASKS.url, { includeCompleted: false }).map((t) => t.summary)).toEqual(
      ['Due soon high', 'Due later', 'Undated low'],
    )
    useUiStore().showCompletedTasks = false
    expect(tasks.tasksFor(MY_TASKS.url)).toHaveLength(3)
    expect(tasks.openTasks).toHaveLength(3)
    expect(
      tasks
        .tasksDueIn({ start: new Date(2026, 9, 16), end: new Date(2026, 9, 17) })
        .map((t) => t.summary),
    ).toEqual(['Due soon high'])
    await tasks.ensureLoaded()
    expect(client.fetchTasks).toHaveBeenCalledTimes(1)
  })

  it('creates, updates, completes and deletes optimistically', async () => {
    const tasks = useTasksStore()
    await tasks.ensureLoaded()
    const pending = tasks.createTask(MY_TASKS, {
      summary: 'Fresh',
      description: '',
      due: null,
      dueAllDay: false,
      priority: null,
      alarm: null,
    })
    expect(tasks.tasksFor(MY_TASKS.url).map((t) => t.summary)).toContain('Fresh')
    const fresh = await pending
    expect(fresh.etag).toMatch(/^"e/)

    const updated = await tasks.updateTask(fresh, {
      ...taskToForm(fresh),
      summary: 'Fresh (edited)',
      priority: 'medium',
    })
    expect(updated.summary).toBe('Fresh (edited)')
    expect(updated.priority).toBe('medium')
    expect(tasks.get(fresh.objectUrl)?.summary).toBe('Fresh (edited)')

    const done = await tasks.setCompleted(updated, true)
    expect(done.completed).toBe(true)
    expect(client.objects.get(fresh.objectUrl)!.data).toContain('STATUS:COMPLETED')
    const undone = await tasks.setCompleted(done, false)
    expect(undone.completed).toBe(false)

    await tasks.deleteTask(undone)
    expect(tasks.get(fresh.objectUrl)).toBeUndefined()
    expect(client.objects.has(fresh.objectUrl)).toBe(false)
  })

  it('rolls back failed writes and reloads on conflict', async () => {
    const tasks = useTasksStore()
    await tasks.ensureLoaded()
    const t = tasks.tasksFor(MY_TASKS.url).find((x) => x.summary === 'Due later')!

    client.failNext = { op: 'update', error: new NetworkError('x') }
    await expect(tasks.setCompleted(t, true)).rejects.toBeInstanceOf(NetworkError)
    expect(tasks.get(t.objectUrl)?.completed).toBe(false)

    const server = client.objects.get(t.objectUrl)!
    client.objects.set(t.objectUrl, {
      ...server,
      etag: '"phone"',
      data: server.data.replace('SUMMARY:Due later', 'SUMMARY:Due later (phone)'),
    })
    await expect(tasks.updateTask(t, { ...taskToForm(t), summary: 'web' })).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(tasks.get(t.objectUrl)?.summary).toBe('Due later (phone)')

    client.failNext = { op: 'delete', error: new NetworkError('x') }
    await expect(tasks.deleteTask(tasks.get(t.objectUrl)!)).rejects.toBeInstanceOf(NetworkError)
    expect(tasks.get(t.objectUrl)).toBeDefined()
  })

  it('refresh replaces the list content and logout clears everything', async () => {
    const tasks = useTasksStore()
    await tasks.ensureLoaded()
    client.objects.delete(`${MY_TASKS.url}a.ics`)
    client.seed(MY_TASKS, 'e', todoIcs('e', 'From phone'))
    await tasks.refresh([MY_TASKS.url])
    const names = tasks.tasksFor(MY_TASKS.url).map((t) => t.summary)
    expect(names).toContain('From phone')
    expect(names).not.toContain('Undated low')
    useAuthStore().disconnect()
    expect(tasks.all.size).toBe(0)
    expect(tasks.isLoading()).toBe(false)
  })

  it('compareTasks orders by completion, due, priority, sort order, title', () => {
    const base = {
      uid: '',
      objectUrl: '',
      collectionUrl: '',
      etag: '',
      description: '',
      dueAllDay: false,
      completedAt: null,
      percent: 0,
      priorityValue: 0,
      alarm: null,
      created: null,
      parentUid: null,
    }
    const mk = (
      summary: string,
      extra: Partial<
        typeof base & {
          due: Date | null
          completed: boolean
          priority: 'high' | 'medium' | 'low' | null
          sortOrder: number | null
        }
      >,
    ) =>
      ({
        ...base,
        summary,
        due: null,
        completed: false,
        priority: null,
        sortOrder: null,
        ...extra,
      }) as never
    const sorted = [
      mk('z', { completed: true }),
      mk('b', {}),
      mk('a', { priority: 'low' }),
      mk('c', { due: new Date(2026, 0, 2) }),
      mk('d', { due: new Date(2026, 0, 1), priority: 'high' }),
      mk('e', { due: new Date(2026, 0, 1), priority: 'medium' }),
    ].sort(compareTasks)
    expect(sorted.map((t: { summary: string }) => t.summary)).toEqual([
      'd',
      'e',
      'c',
      'a',
      'b',
      'z',
    ])
  })
})
