/** Subtasks (RELATED-TO;RELTYPE=PARENT): nesting for the task lists and progress counts. */
import type { Task } from '@/api/ical'

export interface NestedTask {
  task: Task
  /** 0 for top-level tasks, 1 for their subtasks, … */
  depth: number
}

/** How deep subtasks are indented at most (Apple Reminders has one level). */
const MAX_DEPTH = 3

/**
 * Puts every subtask right under its parent, keeping the given order within each level. A
 * subtask whose parent is not in the list (other list, completed, filtered out) stays top-level.
 */
export function nestTasks(tasks: Task[]): NestedTask[] {
  const byUid = new Set(tasks.map((t) => t.uid))
  const children = new Map<string, Task[]>()
  const roots: Task[] = []
  for (const t of tasks) {
    if (t.parentUid && t.parentUid !== t.uid && byUid.has(t.parentUid)) {
      children.set(t.parentUid, [...(children.get(t.parentUid) ?? []), t])
    } else roots.push(t)
  }
  const out: NestedTask[] = []
  const seen = new Set<string>()
  const walk = (t: Task, depth: number) => {
    if (seen.has(t.uid)) return // a loop in broken data
    seen.add(t.uid)
    out.push({ task: t, depth: Math.min(depth, MAX_DEPTH) })
    for (const c of children.get(t.uid) ?? []) walk(c, depth + 1)
  }
  for (const r of roots) walk(r, 0)
  // Anything only reachable through a loop still shows up.
  for (const t of tasks) if (!seen.has(t.uid)) out.push({ task: t, depth: 0 })
  return out
}

/** All subtasks of `uid`, at any depth. */
export function descendantsOf(uid: string, tasks: Iterable<Task>): Task[] {
  const list = [...tasks]
  const out: Task[] = []
  const queue = [uid]
  const seen = new Set([uid])
  while (queue.length) {
    const parent = queue.shift()!
    for (const t of list) {
      if (t.parentUid === parent && !seen.has(t.uid)) {
        seen.add(t.uid)
        out.push(t)
        queue.push(t.uid)
      }
    }
  }
  return out
}

/** Done / total of the direct subtasks, or null without any. */
export function subtaskProgress(
  uid: string,
  tasks: Iterable<Task>,
): { done: number; total: number } | null {
  let done = 0
  let total = 0
  for (const t of tasks) {
    if (t.parentUid !== uid) continue
    total++
    if (t.completed) done++
  }
  return total ? { done, total } : null
}
