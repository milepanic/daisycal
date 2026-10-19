/**
 * Event cache. Documents (parsed .ics) are fetched per collection and per month and kept by
 * object URL; views ask for expanded instances over any range. Writes are optimistic: the
 * local document changes first, the server call follows, and a failure rolls back.
 */
import { defineStore } from 'pinia'
import { computed, markRaw, shallowRef, triggerRef } from 'vue'

import type { CalendarObject } from '@/api/caldav'
import type { Collection } from '@/api/collections'
import { ConflictError, NotFoundError } from '@/api/errors'
import {
  type EditScope,
  type EventDocument,
  type EventForm,
  type EventInstance,
  buildEventIcs,
  excludeOccurrenceIcs,
  expandEvent,
  parseEventObject,
  updateEventIcs,
} from '@/api/ical'
import { type DateRange, monthKeysIn, monthRange } from '@/lib/dates'
import { useAuthStore } from './auth'
import { useCalendarsStore } from './calendars'

type ChunkStatus = 'loading' | 'ready' | 'error'

interface Chunk {
  collectionUrl: string
  monthKey: string
  status: ChunkStatus
  urls: Set<string>
  error: string | null
  promise: Promise<void> | null
}

const chunkKey = (collectionUrl: string, monthKey: string) => `${collectionUrl}|${monthKey}`

export const useEventsStore = defineStore('events', () => {
  const auth = useAuthStore()
  const calendars = useCalendarsStore()

  /** All known documents by object URL. */
  const docs = shallowRef(new Map<string, EventDocument>())
  const chunks = shallowRef(new Map<string, Chunk>())

  function bump() {
    triggerRef(docs)
    triggerRef(chunks)
  }

  function setDoc(doc: EventDocument) {
    docs.value.set(doc.object.url, markRaw(doc))
    for (const chunk of chunks.value.values()) {
      if (chunk.collectionUrl === doc.object.collectionUrl) chunk.urls.add(doc.object.url)
    }
    bump()
  }

  function dropDoc(url: string) {
    docs.value.delete(url)
    for (const chunk of chunks.value.values()) chunk.urls.delete(url)
    bump()
  }

  async function fetchChunk(collection: Collection, monthKey: string): Promise<void> {
    const key = chunkKey(collection.url, monthKey)
    const existing = chunks.value.get(key)
    if (existing?.promise) return existing.promise
    const chunk: Chunk = existing ?? {
      collectionUrl: collection.url,
      monthKey,
      status: 'loading',
      urls: new Set(),
      error: null,
      promise: null,
    }
    chunk.status = 'loading'
    chunk.error = null
    chunks.value.set(key, chunk)
    bump()
    chunk.promise = auth
      .requireClient()
      .fetchEvents(collection, monthRange(monthKey))
      .then((objects) => {
        const urls = new Set<string>()
        for (const object of objects) {
          try {
            const doc = parseEventObject(object)
            docs.value.set(object.url, markRaw(doc))
            urls.add(object.url)
          } catch (err) {
            console.warn('Skipping unparseable event', object.url, err)
          }
        }
        // Objects the server no longer returns for this month are dropped from the chunk;
        // the document itself stays while any other chunk still references it.
        chunk.urls = urls
        chunk.status = 'ready'
        pruneOrphans()
      })
      .catch((err: unknown) => {
        chunk.status = 'error'
        chunk.error = err instanceof Error ? err.message : String(err)
      })
      .finally(() => {
        chunk.promise = null
        bump()
      })
    return chunk.promise
  }

  function pruneOrphans() {
    const referenced = new Set<string>()
    for (const chunk of chunks.value.values()) for (const url of chunk.urls) referenced.add(url)
    for (const url of docs.value.keys()) if (!referenced.has(url)) docs.value.delete(url)
  }

  /** Loads every calendar's documents for the months covering the range (idempotent). */
  async function ensureLoaded(range: DateRange): Promise<void> {
    const months = monthKeysIn(range)
    const jobs: Promise<void>[] = []
    for (const collection of calendars.calendars) {
      for (const monthKey of months) {
        const chunk = chunks.value.get(chunkKey(collection.url, monthKey))
        if (!chunk || chunk.status === 'error') jobs.push(fetchChunk(collection, monthKey))
        else if (chunk.promise) jobs.push(chunk.promise)
      }
    }
    await Promise.all(jobs)
  }

  /** Re-fetches already loaded months of the given collections (after a ctag change). */
  async function refresh(collectionUrls?: string[]): Promise<void> {
    const wanted = collectionUrls ? new Set(collectionUrls) : null
    const jobs: Promise<void>[] = []
    for (const chunk of chunks.value.values()) {
      if (wanted && !wanted.has(chunk.collectionUrl)) continue
      const collection = calendars.get(chunk.collectionUrl)
      if (collection) jobs.push(fetchChunk(collection, chunk.monthKey))
    }
    await Promise.all(jobs)
  }

  /** Forgets everything (or one collection); the next `ensureLoaded` refetches. */
  function invalidate(collectionUrl?: string) {
    for (const [key, chunk] of chunks.value) {
      if (!collectionUrl || chunk.collectionUrl === collectionUrl) chunks.value.delete(key)
    }
    pruneOrphans()
    bump()
  }

  function isLoading(range: DateRange): boolean {
    const months = monthKeysIn(range)
    return calendars.calendars.some((c) =>
      months.some((m) => chunks.value.get(chunkKey(c.url, m))?.status === 'loading'),
    )
  }

  function loadError(range: DateRange): string | null {
    for (const c of calendars.calendars) {
      for (const m of monthKeysIn(range)) {
        const chunk = chunks.value.get(chunkKey(c.url, m))
        if (chunk?.status === 'error') return chunk.error
      }
    }
    return null
  }

  /** Expanded occurrences of visible calendars within the range, sorted by start. */
  function instancesFor(
    range: DateRange,
    options: { includeHidden?: boolean } = {},
  ): EventInstance[] {
    const months = new Set(monthKeysIn(range))
    const urls = new Set<string>()
    for (const chunk of chunks.value.values()) {
      if (!months.has(chunk.monthKey)) continue
      if (!options.includeHidden && !calendars.isVisible(chunk.collectionUrl)) continue
      for (const url of chunk.urls) urls.add(url)
    }
    const out: EventInstance[] = []
    for (const url of urls) {
      const doc = docs.value.get(url)
      if (doc) out.push(...expandEvent(doc, range.start, range.end))
    }
    return out.sort(
      (a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
    )
  }

  function getDocument(objectUrl: string): EventDocument | undefined {
    return docs.value.get(objectUrl)
  }

  const count = computed(() => docs.value.size)

  // --- writes ------------------------------------------------------------------------------

  function toDoc(object: CalendarObject): EventDocument {
    return markRaw(parseEventObject(object))
  }

  async function createEvent(collection: Collection, form: EventForm): Promise<EventDocument> {
    const { uid, ics } = buildEventIcs(form)
    const url = new URL(`${encodeURIComponent(uid)}.ics`, collection.url).href
    const optimistic = toDoc({ url, collectionUrl: collection.url, etag: '', data: ics })
    setDoc(optimistic)
    try {
      const saved = await auth.requireClient().createObject(collection, ics, uid)
      const doc = toDoc(saved)
      setDoc(doc)
      return doc
    } catch (err) {
      dropDoc(url)
      throw err
    }
  }

  /** Writes a new .ics for an existing object. On 412 the server copy is re-read and the error re-thrown. */
  async function writeDocument(previous: EventDocument, ics: string): Promise<EventDocument> {
    const url = previous.object.url
    const optimistic = toDoc({ ...previous.object, data: ics })
    setDoc(optimistic)
    try {
      const saved = await auth.requireClient().updateObject(previous.object, ics)
      const doc = toDoc(saved)
      setDoc(doc)
      return doc
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

  async function updateEvent(
    instance: EventInstance,
    form: EventForm,
    scope: EditScope = 'all',
  ): Promise<EventDocument> {
    const doc = docs.value.get(instance.objectUrl)
    if (!doc) throw new NotFoundError(instance.objectUrl)
    // Work on a copy so a failed write leaves the cached document untouched.
    const copy = toDoc({ ...doc.object })
    const ics = updateEventIcs(copy, form, instance, scope)
    return writeDocument(doc, ics)
  }

  async function deleteEvent(instance: EventInstance, scope: EditScope = 'all'): Promise<void> {
    const doc = docs.value.get(instance.objectUrl)
    if (!doc) return
    if (scope === 'this' && instance.isRecurring && instance.recurrenceId) {
      const copy = toDoc({ ...doc.object })
      await writeDocument(doc, excludeOccurrenceIcs(copy, instance))
      return
    }
    dropDoc(doc.object.url)
    try {
      await auth.requireClient().deleteObject(doc.object)
    } catch (err) {
      if (err instanceof NotFoundError) return
      setDoc(doc)
      if (err instanceof ConflictError) await reloadObject(doc.object.collectionUrl, doc.object.url)
      throw err
    }
  }

  /** Moves an event to another calendar: create there with the same UID, then delete here. */
  async function moveEvent(instance: EventInstance, target: Collection): Promise<EventDocument> {
    const doc = docs.value.get(instance.objectUrl)
    if (!doc) throw new NotFoundError(instance.objectUrl)
    if (doc.object.collectionUrl === target.url) return doc
    const client = auth.requireClient()
    const saved = await client.createObject(target, doc.object.data, doc.uid)
    const moved = toDoc(saved)
    setDoc(moved)
    dropDoc(doc.object.url)
    try {
      await client.deleteObject(doc.object)
    } catch (err) {
      if (!(err instanceof NotFoundError)) {
        setDoc(doc)
        throw err
      }
    }
    return moved
  }

  function reset() {
    docs.value = new Map()
    chunks.value = new Map()
  }

  auth.onDisconnect(reset)

  return {
    docs,
    chunks,
    count,
    ensureLoaded,
    refresh,
    invalidate,
    isLoading,
    loadError,
    instancesFor,
    getDocument,
    createEvent,
    updateEvent,
    deleteEvent,
    moveEvent,
    reset,
  }
})
