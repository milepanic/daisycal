/**
 * Undo for writes (Google Calendar style): every change to an event or task is recorded with a
 * way back, and a toast offers "Undo" for a few seconds; Ctrl+Z / Cmd+Z undoes the latest one.
 * The stores record their own writes, so dragging, the popups, checkboxes and deletes all get
 * it without extra code.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useAuthStore } from './auth'
import { useNotificationsStore } from './notifications'

interface UndoEntry {
  id: number
  label: string
  /** Same object, recorded moments apart (move + edit from one Save): undone together. */
  key: string
  at: number
  undo: () => Promise<unknown>
  toastId: number | null
}

/** How many changes Ctrl+Z can walk back. */
const LIMIT = 20
/** Writes to the same object within this window count as one change. */
const MERGE_MS = 1500
const TOAST_MS = 7000

export const useHistoryStore = defineStore('history', () => {
  const notifications = useNotificationsStore()
  const entries = ref<UndoEntry[]>([])
  /** True while an undo runs: the writes it makes are not recorded again. */
  const undoing = ref(false)
  let nextId = 1

  function showToast(entry: UndoEntry) {
    if (entry.toastId != null) notifications.dismiss(entry.toastId)
    entry.toastId = notifications.push(entry.label, {
      kind: 'info',
      timeout: TOAST_MS,
      action: { label: 'Undo', run: () => undo(entry.id) },
    })
  }

  /** While set, records join this key (one change made of several writes). */
  let groupKey: string | null = null

  /** Runs `fn` so that everything it records is one undo step (e.g. a task and its subtasks). */
  async function group<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const outer = groupKey
    groupKey = outer ?? key
    try {
      return await fn()
    } finally {
      groupKey = outer
    }
  }

  /** Records a change. `undo` must put things back as they were before it. */
  function record(label: string, entryKey: string, undoFn: () => Promise<unknown>) {
    if (undoing.value) return
    const key = groupKey ?? entryKey
    const now = Date.now()
    const last = entries.value[entries.value.length - 1]
    if (last && last.key === key && (now - last.at < MERGE_MS || groupKey)) {
      const previous = last.undo
      last.undo = async () => {
        await undoFn()
        await previous()
      }
      last.label = label
      last.at = now
      showToast(last)
      return
    }
    const entry: UndoEntry = { id: nextId++, label, key, at: now, undo: undoFn, toastId: null }
    entries.value = [...entries.value, entry].slice(-LIMIT)
    showToast(entry)
  }

  async function undo(id?: number) {
    const entry =
      id == null ? entries.value[entries.value.length - 1] : entries.value.find((e) => e.id === id)
    if (!entry || undoing.value) return
    entries.value = entries.value.filter((e) => e !== entry)
    if (entry.toastId != null) notifications.dismiss(entry.toastId)
    undoing.value = true
    try {
      await entry.undo()
    } catch (err) {
      notifications.reportError(err, `Could not undo "${entry.label}"`)
    } finally {
      undoing.value = false
    }
  }

  const canUndo = () => entries.value.length > 0

  function clear() {
    entries.value = []
  }
  useAuthStore().onDisconnect(clear)

  return { entries, undoing, record, group, undo, canUndo, clear }
})
