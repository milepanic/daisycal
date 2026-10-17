import type { Task } from '@/api/ical'
import { isSameDay, startOfDay } from './dates'
import { formatShortDateTime, formatTime } from './format'

export interface DueBadge {
  label: string
  cls: string
}

/** Due badge for a task row: red when overdue, accent when due today, gray otherwise. */
export function dueBadge(task: Task, now = new Date()): DueBadge | null {
  if (!task.due) return null
  const today = startOfDay(now)
  const isToday = isSameDay(task.due, today)
  const label = isToday
    ? task.dueAllDay
      ? 'Today'
      : `Today, ${formatTime(task.due)}`
    : formatShortDateTime(task.due, !task.dueAllDay)
  if (!task.completed && task.due < (task.dueAllDay ? today : now))
    return { label, cls: 'bg-red-50 text-red-600' }
  if (!task.completed && isToday) return { label, cls: 'bg-accent/10 text-accent' }
  return { label, cls: 'bg-gray-100 text-gray-600' }
}
