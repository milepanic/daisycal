/** Task lists (VTODO collections) with optimistic create/update/complete/delete. */
import { defineStore } from 'pinia'
import { computed, markRaw, shallowRef, triggerRef } from 'vue'

import type { CalendarObject } from '@/api/caldav'
import type { Collection } from '@/api/collections'
import { ConflictError, NotFoundError } from '@/api/errors'
import {
  type Task,
  type TaskDocument,
  type TaskForm,
  buildTaskIcs,
  parseTaskObject,
  taskFromDocument,
  toggleTaskIcs,
  updateTaskIcs,
} from '@/api/ical'
import type { DateRange } from '@/lib/dates'
import { useAuthStore } from './auth'
import { useCalendarsStore } from './calendars'
import { useUiStore } from './ui'

type ListStatus = 'loading' | 'ready' | 'error'

interface ListState {
  status: ListStatus
  error: string | null
  promise: Promise<void> | null
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const

/** Open tasks first; by due date (undated last), then priority, then title. Completed by completion date desc. */
export function compareTasks(a: Task, b: Task): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1
  if (a.completed) return (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
  const ad = a.due?.getTime() ?? Number.POSITIVE_INFINITY
  const bd = b.due?.getTime() ?? Number.POSITIVE_INFINITY
  if (ad !== bd) return ad - bd
  const ap = a.priority ? PRIORITY_RANK[a.priority] : 3
  const bp = b.priority ? PRIORITY_RANK[b.priority] : 3
  if (ap !== bp) return ap - bp
  if (a.sortOrder !== null && b.sortOrder !== null && a.sortOrder !== b.sortOrder)
    return a.sortOrder - b.sortOrder
  return a.summary.localeCompare(b.summary)
}

export const useTasksStore = defineStore('tasks', () => {
  const auth = useAuthStore()
  const calendars = useCalendarsStore()
  const ui = useUiStore()

  const docs = shallowRef(new Map<string, TaskDocument>())
  const lists = shallowRef(new Map<string, ListState>())

  function bump() {
    triggerRef(docs)
    triggerRef(lists)
  }

  function toDoc(object: CalendarObject): TaskDocument {
    return markRaw(parseTaskObject(object))
  }

  async function fetchList(collection: Collection): Promise<void> {
    const existing = lists.value.get(collection.url)
    if (existing?.promise) return existing.promise
    const state: ListState = existing ?? { status: 'loading', error: null, promise: null }
    state.status = 'loading'
    state.error = null
    lists.value.set(collection.url, state)
    bump()
    state.promise = auth
      .requireClient()
      .fetchTasks(collection)
      .then((objects) => {
        for (const [url, doc] of docs.value) {
          if (doc.object.collectionUrl === collection.url) docs.value.delete(url)
        }
        for (const object of objects) {
          try {
            docs.value.set(object.url, toDoc(object))
          } catch (err) {
            console.warn('Skipping unparseable task', object.url, err)
          }
        }
        state.status = 'ready'
      })
      .catch((err: unknown) => {
        state.status = 'error'
        state.error = err instanceof Error ? err.message : String(err)
      })
      .finally(() => {
        state.promise = null
        bump()
      })
    return state.promise
  }

  /** Loads all task lists (or the given ones) once. */
  async function ensureLoaded(collectionUrls?: string[]): Promise<void> {
    const targets = collectionUrls
      ? collectionUrls.map((u) => calendars.get(u)).filter((c): c is Collection => !!c)
      : calendars.taskLists
    await Promise.all(
      targets.map((c) => {
        const state = lists.value.get(c.url)
        if (!state || state.status === 'error') return fetchList(c)
        return state.promise ?? Promise.resolve()
      }),
    )
  }

  async function refresh(collectionUrls?: string[]): Promise<void> {
    const targets = (collectionUrls ?? [...lists.value.keys()])
      .filter((u) => lists.value.has(u))
      .map((u) => calendars.get(u))
      .filter((c): c is Collection => !!c)
    await Promise.all(targets.map((c) => fetchList(c)))
  }

  function invalidate(collectionUrl?: string) {
    for (const url of lists.value.keys()) {
      if (!collectionUrl || url === collectionUrl) lists.value.delete(url)
    }
    for (const [url, doc] of docs.value) {
      if (!collectionUrl || doc.object.collectionUrl === collectionUrl) docs.value.delete(url)
    }
    bump()
  }

  function isLoading(collectionUrl?: string): boolean {
    for (const [url, state] of lists.value) {
      if ((!collectionUrl || url === collectionUrl) && state.status === 'loading') return true
    }
    return false
  }

  function listError(collectionUrl: string): string | null {
    return lists.value.get(collectionUrl)?.error ?? null
  }

  /** All parsed tasks, keyed by object URL. */
  const all = computed(() => {
    const out = new Map<string, Task>()
    for (const [url, doc] of docs.value) out.set(url, taskFromDocument(doc))
    return out
  })

  function tasksFor(collectionUrl: string, options: { includeCompleted?: boolean } = {}): Task[] {
    const includeCompleted = options.includeCompleted ?? ui.showCompletedTasks
    const out: Task[] = []
    for (const task of all.value.values()) {
      if (task.collectionUrl !== collectionUrl) continue
      if (!includeCompleted && task.completed) continue
      out.push(task)
    }
    return out.sort(compareTasks)
  }

  /** Tasks of visible lists. */
  const visibleTasks = computed(() => {
    const out: Task[] = []
    for (const task of all.value.values())
      if (calendars.isVisible(task.collectionUrl)) out.push(task)
    return out.sort(compareTasks)
  })

  const openTasks = computed(() => visibleTasks.value.filter((t) => !t.completed))

  /** Open tasks of visible lists due within the range (for the calendar grid / tasks panel). */
  function tasksDueIn(range: DateRange): Task[] {
    return openTasks.value.filter((t) => t.due && t.due >= range.start && t.due < range.end)
  }

  function get(objectUrl: string): Task | undefined {
    return all.value.get(objectUrl)
  }

  // --- writes ------------------------------------------------------------------------------

  function setDoc(doc: TaskDocument) {
    docs.value.set(doc.object.url, doc)
    bump()
  }
  function dropDoc(url: string) {
    docs.value.delete(url)
    bump()
  }

  async function createTask(collection: Collection, form: TaskForm): Promise<Task> {
    const { uid, ics } = buildTaskIcs(form)
    const url = new URL(`${encodeURIComponent(uid)}.ics`, collection.url).href
    setDoc(toDoc({ url, collectionUrl: collection.url, etag: '', data: ics }))
    try {
      const saved = await auth.requireClient().createObject(collection, ics, uid)
      const doc = toDoc(saved)
      setDoc(doc)
      return taskFromDocument(doc)
    } catch (err) {
      dropDoc(url)
      throw err
    }
  }

  async function writeDocument(previous: TaskDocument, ics: string): Promise<Task> {
    const url = previous.object.url
    setDoc(toDoc({ ...previous.object, data: ics }))
    try {
      const saved = await auth.requireClient().updateObject(previous.object, ics)
      const doc = toDoc(saved)
      setDoc(doc)
      return taskFromDocument(doc)
    } catch (err) {
      setDoc(previous)
      if (err instanceof ConflictError) await reloadObject(previous.object.collectionUrl, url)
      if (err instanceof NotFoundError) dropDoc(url)
      throw err
    }
  }

  async function reloadObject(collectionUrl: string, url: string) {
    const collection = calendars.get(collectionUrl)
    if (!collection) return
    try {
      const [fresh] = await auth.requireClient().fetchObjects(collection, [url])
      if (fresh) setDoc(toDoc(fresh))
      else dropDoc(url)
    } catch {
      /* keep what we have */
    }
  }

  async function updateTask(task: Task, form: TaskForm): Promise<Task> {
    const doc = docs.value.get(task.objectUrl)
    if (!doc) throw new NotFoundError(task.objectUrl)
    const copy = toDoc({ ...doc.object })
    return writeDocument(doc, updateTaskIcs(copy, form))
  }

  async function setCompleted(task: Task, completed: boolean): Promise<Task> {
    const doc = docs.value.get(task.objectUrl)
    if (!doc) throw new NotFoundError(task.objectUrl)
    const copy = toDoc({ ...doc.object })
    return writeDocument(doc, toggleTaskIcs(copy, completed))
  }

  async function deleteTask(task: Task): Promise<void> {
    const doc = docs.value.get(task.objectUrl)
    if (!doc) return
    dropDoc(task.objectUrl)
    try {
      await auth.requireClient().deleteObject(doc.object)
    } catch (err) {
      if (err instanceof NotFoundError) return
      setDoc(doc)
      if (err instanceof ConflictError) await reloadObject(doc.object.collectionUrl, doc.object.url)
      throw err
    }
  }

  function reset() {
    docs.value = new Map()
    lists.value = new Map()
  }

  auth.onLogout(reset)

  return {
    docs,
    lists,
    all,
    visibleTasks,
    openTasks,
    ensureLoaded,
    refresh,
    invalidate,
    isLoading,
    listError,
    tasksFor,
    tasksDueIn,
    get,
    createTask,
    updateTask,
    setCompleted,
    deleteTask,
    reset,
  }
})
