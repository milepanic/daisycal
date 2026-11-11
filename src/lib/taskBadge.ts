import type { Task } from '@/api/ical'
import { isSameDay, startOfDay } from './dates'
import { WEEKDAYS_LONG, formatTime } from './format'
import { formatPickerDate } from './timeInput'

export interface DueBadge {
  label: string
  cls: string
}

/**
 * Relative due date, as in Google Tasks: "Yesterday", "Today", "Tomorrow", the weekday for the
 * rest of the coming week ("Friday"), otherwise "Wed, Nov 18" (with the year when it differs).
 * A time is appended for timed tasks: "Today, 18:00".
 */
export function dueLabel(due: Date, allDay: boolean, now = new Date()): string {
  const today = startOfDay(now)
  const days = Math.round((startOfDay(due).getTime() - today.getTime()) / 86_400_000)
  const day =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : days === -1
          ? 'Yesterday'
          : days > 1 && days < 7
            ? WEEKDAYS_LONG[due.getDay()]!
            : formatPickerDate(due, { short: true, now })
  return allDay ? day : `${day}, ${formatTime(due)}`
}

/** Due badge for a task row: red when overdue, accent when due today, gray otherwise. */
export function dueBadge(task: Task, now = new Date()): DueBadge | null {
  if (!task.due) return null
  const today = startOfDay(now)
  const label = dueLabel(task.due, task.dueAllDay, now)
  if (!task.completed && task.due < (task.dueAllDay ? today : now))
    return { label, cls: 'text-red-600 ring-red-200' }
  if (!task.completed && isSameDay(task.due, today))
    return { label, cls: 'text-accent ring-accent/30' }
  return { label, cls: 'text-gray-600 ring-gray-200' }
}
