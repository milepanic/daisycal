/** Search over events and tasks: diacritic- and case-insensitive, every word must match. */
import type { EventInstance, Task } from '@/api/ical'
import { startOfDay } from './dates'

/** "Ćevapi Đurđevdan" → "cevapi djurdjevdan": what both the query and the text are compared as. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/** True when every word of the query appears somewhere in the fields. */
export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return false
  const haystack = normalize(fields.filter(Boolean).join(' \n '))
  return words.every((w) => haystack.includes(w))
}

/**
 * Matching events, one per event: a repeating event shows its next occurrence (or the latest
 * one when all are past). Upcoming first, soonest first; then past ones, most recent first.
 */
export function searchEvents(
  instances: EventInstance[],
  query: string,
  now = new Date(),
): EventInstance[] {
  const today = startOfDay(now)
  const best = new Map<string, EventInstance>()
  for (const i of instances) {
    if (!matches(query, i.summary, i.location, i.description)) continue
    const current = best.get(i.objectUrl)
    if (!current) {
      best.set(i.objectUrl, i)
      continue
    }
    const upcoming = i.end > today
    const currentUpcoming = current.end > today
    if (upcoming && (!currentUpcoming || i.start < current.start)) best.set(i.objectUrl, i)
    else if (!upcoming && !currentUpcoming && i.start > current.start) best.set(i.objectUrl, i)
  }
  const list = [...best.values()]
  const upcoming = list.filter((i) => i.end > today).sort((a, b) => +a.start - +b.start)
  const past = list.filter((i) => i.end <= today).sort((a, b) => +b.start - +a.start)
  return [...upcoming, ...past]
}

/** Matching tasks: open ones first (by due date, undated last), then completed ones. */
export function searchTasks(tasks: Iterable<Task>, query: string): Task[] {
  const due = (t: Task) => t.due?.getTime() ?? Number.POSITIVE_INFINITY
  return [...tasks]
    .filter((t) => matches(query, t.summary, t.description))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || due(a) - due(b))
}
