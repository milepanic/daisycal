/**
 * Pure layout helpers for the calendar views. All inputs are expanded `EventInstance`s and
 * `Task`s; outputs are plain numbers the components turn into CSS.
 */
import type { EventInstance, Task } from '@/api/ical'
import { DAY_MS, type DateRange, addDays, eachDay, isSameDay, startOfDay, toDateKey } from './dates'

/** One hour of the time grid in pixels (the mockup uses 60px rows). */
export const HOUR_PX = 60
export const DAY_PX = 24 * HOUR_PX
/** Shortest chip in the grid (the mockup's 10-minute standup is `h-4`). */
export const MIN_EVENT_PX = 16
/** Length of a new event until the user picks something else (minutes). */
export const DEFAULT_NEW_EVENT_MIN = 30
/** Chips shorter than this render as a single line. */
export const COMPACT_PX = 40
/** Timed events this long or longer go to the all-day row. */
const LONG_EVENT_MS = DAY_MS

export interface TimedPlacement {
  instance: EventInstance
  /** Pixels from the top of the day column. */
  top: number
  height: number
  /** Fractions of the column width. */
  left: number
  width: number
  /** True when the chip is clipped at the top/bottom of this day (spans midnight). */
  continuesBefore: boolean
  continuesAfter: boolean
  compact: boolean
}

export interface SpanPlacement<T> {
  item: T
  /** First column index (0-based) and number of columns covered. */
  startCol: number
  span: number
  /** Row within the all-day area. */
  lane: number
  continuesBefore: boolean
  continuesAfter: boolean
}

/** Events shown in the all-day row: all-day ones and timed ones lasting a day or more. */
export function isAllDayRow(instance: EventInstance): boolean {
  return instance.allDay || instance.end.getTime() - instance.start.getTime() >= LONG_EVENT_MS
}

export function minutesSinceMidnight(d: Date, day: Date): number {
  return (d.getTime() - startOfDay(day).getTime()) / 60_000
}

/**
 * Places the timed events of one day. Overlapping events share the width Google-Calendar
 * style: events are clustered, assigned to the first free column, and each chip stretches
 * right over columns nothing else occupies.
 */
export function layoutDay(instances: EventInstance[], day: Date): TimedPlacement[] {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  const items = instances
    .filter((i) => !isAllDayRow(i) && i.start < dayEnd && i.end > dayStart)
    .map((instance) => {
      const start = Math.max(instance.start.getTime(), dayStart.getTime())
      const end = Math.min(instance.end.getTime(), dayEnd.getTime())
      const top = ((start - dayStart.getTime()) / 60_000) * (HOUR_PX / 60)
      const height = Math.max(((end - start) / 60_000) * (HOUR_PX / 60), MIN_EVENT_PX)
      return {
        instance,
        top,
        height,
        bottom: top + height,
        continuesBefore: instance.start < dayStart,
        continuesAfter: instance.end > dayEnd,
      }
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom)

  const out: TimedPlacement[] = []
  let i = 0
  while (i < items.length) {
    // Build a cluster of transitively overlapping items.
    let clusterEnd = items[i]!.bottom
    let j = i + 1
    while (j < items.length && items[j]!.top < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, items[j]!.bottom)
      j++
    }
    const cluster = items.slice(i, j)
    const columns: number[] = [] // bottom of the last item in each column
    const colOf = new Map<(typeof cluster)[number], number>()
    for (const item of cluster) {
      let col = columns.findIndex((bottom) => bottom <= item.top)
      if (col === -1) {
        col = columns.length
        columns.push(item.bottom)
      } else columns[col] = item.bottom
      colOf.set(item, col)
    }
    const n = columns.length
    for (const item of cluster) {
      const col = colOf.get(item)!
      // Stretch over following columns that have nothing overlapping this item.
      let span = 1
      while (col + span < n) {
        const blocked = cluster.some(
          (other) =>
            colOf.get(other) === col + span && other.top < item.bottom && other.bottom > item.top,
        )
        if (blocked) break
        span++
      }
      out.push({
        instance: item.instance,
        top: item.top,
        height: item.height,
        left: col / n,
        width: span / n,
        continuesBefore: item.continuesBefore,
        continuesAfter: item.continuesAfter,
        compact: item.height < COMPACT_PX,
      })
    }
    i = j
  }
  return out
}

/** Column index of a date within the day list, or -1. */
function colOf(days: Date[], d: Date): number {
  return days.findIndex((day) => isSameDay(day, d))
}

/**
 * Lays out spanning items (all-day events, long events) over the day columns, packing them
 * into the fewest lanes. `getRange` returns the half-open [start, end) of an item.
 */
export function layoutSpans<T>(
  items: T[],
  days: Date[],
  getRange: (item: T) => { start: Date; end: Date },
): SpanPlacement<T>[] {
  if (days.length === 0) return []
  const first = startOfDay(days[0]!)
  const last = addDays(startOfDay(days[days.length - 1]!), 1)
  const placed: SpanPlacement<T>[] = []
  const lanes: number[][] = [] // per lane, occupied columns

  const candidates = items
    .map((item) => {
      const { start, end } = getRange(item)
      if (start >= last || end <= first) return null
      const s = start < first ? 0 : colOf(days, start)
      const lastDay = new Date(end.getTime() - 1)
      const e = end > last ? days.length - 1 : colOf(days, lastDay)
      if (s === -1 || e === -1) return null
      return {
        item,
        startCol: s,
        span: e - s + 1,
        continuesBefore: start < first,
        continuesAfter: end > last,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => a.startCol - b.startCol || b.span - a.span)

  for (const c of candidates) {
    const cols = Array.from({ length: c.span }, (_, k) => c.startCol + k)
    let lane = lanes.findIndex((occupied) => cols.every((col) => !occupied.includes(col)))
    if (lane === -1) {
      lane = lanes.length
      lanes.push([])
    }
    lanes[lane]!.push(...cols)
    placed.push({ ...c, lane })
  }
  return placed
}

export interface MonthCellItem {
  kind: 'event' | 'task'
  event?: EventInstance
  task?: Task
  /** All-day / spanning chips show no time. */
  allDay: boolean
}

export interface MonthCell {
  date: Date
  key: string
  inMonth: boolean
  isToday: boolean
  items: MonthCellItem[]
  /** Items shown before the "+N more" link. */
  visible: MonthCellItem[]
  hiddenCount: number
}

/** Month grid cells. `maxRows` is how many chip rows fit; the last one becomes "+N more". */
export function buildMonthCells(
  range: DateRange,
  month: number,
  instances: EventInstance[],
  tasks: Task[],
  maxRows = 3,
  today = new Date(),
): MonthCell[] {
  return eachDay(range).map((date) => {
    const dayStart = startOfDay(date)
    const dayEnd = addDays(dayStart, 1)
    const items: MonthCellItem[] = []
    const spanning = instances.filter((i) => isAllDayRow(i) && i.start < dayEnd && i.end > dayStart)
    const timed = instances.filter((i) => !isAllDayRow(i) && i.start < dayEnd && i.end > dayStart)
    for (const event of spanning) items.push({ kind: 'event', event, allDay: true })
    for (const event of timed) items.push({ kind: 'event', event, allDay: false })
    for (const task of tasks) {
      if (task.due && task.due >= dayStart && task.due < dayEnd)
        items.push({ kind: 'task', task, allDay: task.dueAllDay })
    }
    const hiddenCount = items.length > maxRows ? items.length - (maxRows - 1) : 0
    return {
      date,
      key: toDateKey(date),
      inMonth: date.getMonth() === month,
      isToday: isSameDay(date, today),
      items,
      visible: hiddenCount ? items.slice(0, maxRows - 1) : items,
      hiddenCount,
    }
  })
}

export interface AgendaEntry {
  kind: 'event' | 'task'
  event?: EventInstance
  task?: Task
  /** "All day", "09:00 – 10:00", "17:00" or "" */
  timeLabel: string
  sortKey: number
}

export interface AgendaDay {
  date: Date
  key: string
  isToday: boolean
  entries: AgendaEntry[]
}

const pad = (n: number) => String(n).padStart(2, '0')
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Agenda groups: one per day that has something; events clipped to the day, tasks by due. */
export function buildAgendaDays(
  range: DateRange,
  instances: EventInstance[],
  tasks: Task[],
  today = new Date(),
): AgendaDay[] {
  const out: AgendaDay[] = []
  for (const date of eachDay(range)) {
    const dayStart = startOfDay(date)
    const dayEnd = addDays(dayStart, 1)
    const entries: AgendaEntry[] = []
    for (const event of instances) {
      if (!(event.start < dayEnd && event.end > dayStart)) continue
      if (isAllDayRow(event))
        entries.push({ kind: 'event', event, timeLabel: 'All day', sortKey: -1 })
      else {
        const s = event.start < dayStart ? dayStart : event.start
        const e = event.end > dayEnd ? dayEnd : event.end
        const endLabel = e.getTime() === dayEnd.getTime() ? '24:00' : hm(e)
        entries.push({
          kind: 'event',
          event,
          timeLabel: `${hm(s)} – ${endLabel}`,
          sortKey: s.getTime(),
        })
      }
    }
    for (const task of tasks) {
      if (!task.due || task.due < dayStart || task.due >= dayEnd) continue
      entries.push({
        kind: 'task',
        task,
        timeLabel: task.dueAllDay ? '' : hm(task.due),
        sortKey: task.dueAllDay ? -0.5 : task.due.getTime(),
      })
    }
    if (entries.length === 0) continue
    entries.sort((a, b) => a.sortKey - b.sortKey)
    out.push({ date, key: toDateKey(date), isToday: isSameDay(date, today), entries })
  }
  return out
}

/** Snaps a y offset in the grid to a start time on `day` (30-minute steps). */
export function slotFromOffset(day: Date, offsetY: number, stepMinutes = 30): Date {
  const minutes = Math.max(0, Math.min(24 * 60 - stepMinutes, Math.floor(offsetY / (HOUR_PX / 60))))
  const snapped = Math.floor(minutes / stepMinutes) * stepMinutes
  const d = startOfDay(day)
  d.setMinutes(snapped)
  return d
}
