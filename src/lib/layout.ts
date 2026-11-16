/**
 * Pure layout helpers for the calendar views. All inputs are expanded `EventInstance`s and
 * `Task`s; outputs are plain numbers the components turn into CSS.
 */
import type { EventInstance, Task } from '@/api/ical'
import { DAY_MS, type DateRange, addDays, eachDay, isSameDay, startOfDay, toDateKey } from './dates'

/**
 * One hour of the time grid in pixels (48px, as in Google Calendar). The hour lines in
 * TimeGrid's background repeat at the same size; keep the two in step.
 */
export const HOUR_PX = 48
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
  /** Cascade indent and level (see `TimedLayout`). */
  offsetPx: number
  shrinkPx: number
  depth: number
  stack: number
  /** True when the chip is clipped at the top/bottom of this day (spans midnight). */
  continuesBefore: boolean
  continuesAfter: boolean
  compact: boolean
  /** Top part of the chip that is Apple travel time before the start (pixels, 0 = none). */
  travelPx: number
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

/** How long a timed task occupies in the grid (Google Calendar shows tasks as 30-minute blocks). */
export const TASK_SLOT_MIN = 30

/** Height of a chip's title and time at its top: nothing may be drawn over it. */
export const EVENT_HEADER_PX = 36
/** A task chip shows its title on a single line. */
export const TASK_HEADER_PX = 20
/** How far a chip laid over an earlier one is indented, so the one below stays visible. */
export const CASCADE_INSET_PX = 8
/** Side by side, a chip reaches this far into the next column, under the chip there. */
const SIDE_OVERLAP = 0.7
/** Side by side, the last chip stops this short of the right edge (Google Calendar). */
export const SIDE_END_GAP_PX = 4

/** Anything laid out in a day column: an event, or a task from its due time on. */
export interface TimedItem<T> {
  item: T
  start: Date
  end: Date
  /** Where the chip's own content starts, when something is drawn above it (travel time). */
  contentStart?: Date
  /** Height of the title area at the top of a tall chip (default EVENT_HEADER_PX). */
  headerPx?: number
}

export interface TimedLayout<T> {
  item: T
  top: number
  height: number
  /** Fractions of the column width... */
  left: number
  width: number
  /** ...then moved right by `offsetPx` and narrowed by `shrinkPx` (cascade indent). */
  offsetPx: number
  shrinkPx: number
  /** Cascade level: chips with a higher one are drawn over those below them. */
  depth: number
  /** Drawing order (higher on top): by cascade level, then by column within it. */
  stack: number
  continuesBefore: boolean
  continuesAfter: boolean
  compact: boolean
}

/**
 * Places the timed items of one day the way Google Calendar does. Nothing may cover the title
 * and time at the top of a chip:
 *  - items starting within each other's title area are put side by side: each starts at its
 *    column, reaches a bit under the next one (drawn over it, so its title stays visible),
 *    and the last stops short of the right edge, leaving room to click the day;
 *  - an item starting below the title of an earlier one is drawn over its lower part instead,
 *    indented by CASCADE_INSET_PX, across the width from that item to the right edge.
 */
export function layoutTimed<T>(entries: TimedItem<T>[], day: Date): TimedLayout<T>[] {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  const toPx = (t: number) => ((t - dayStart.getTime()) / 60_000) * (HOUR_PX / 60)
  const items = entries
    .filter((e) => e.start < dayEnd && e.end > dayStart)
    .map((e) => {
      const start = Math.max(e.start.getTime(), dayStart.getTime())
      const end = Math.min(e.end.getTime(), dayEnd.getTime())
      const top = toPx(start)
      const height = Math.max(toPx(end) - top, MIN_EVENT_PX)
      const bottom = top + height
      const contentTop = Math.min(bottom, Math.max(top, toPx((e.contentStart ?? e.start).getTime())))
      const body = bottom - contentTop
      // A short chip is a single line: its title runs over its whole height.
      const header = body < COMPACT_PX ? body : Math.min(body, e.headerPx ?? EVENT_HEADER_PX)
      return {
        item: e.item,
        top,
        height,
        bottom,
        headerEnd: contentTop + header,
        continuesBefore: e.start < dayStart,
        continuesAfter: e.end > dayEnd,
      }
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom)

  // Groups of items starting within each other's title area. Sorted by start, every item
  // starts below the titles of all earlier groups, so only the last group can grow.
  const groups: (typeof items)[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last?.some((o) => item.top < o.headerEnd)) last.push(item)
    else groups.push([item])
  }

  const out: TimedLayout<T>[] = []
  const placed: { top: number; bottom: number; left: number; inset: number; depth: number }[] = []
  for (const group of groups) {
    // Earlier chips this group is drawn over (below their titles).
    const under = placed.filter((p) => group.some((m) => p.top < m.bottom && p.bottom > m.top))
    const regionLeft = under.length ? Math.min(...under.map((p) => p.left)) : 0
    const inset = under.length ? Math.max(...under.map((p) => p.inset)) + CASCADE_INSET_PX : 0
    const depth = under.length ? Math.max(...under.map((p) => p.depth)) + 1 : 0

    // Side by side within the group: first free column, stretched over free ones to the right.
    const columns: number[] = [] // bottom of the last item in each column
    const colOf = new Map<(typeof group)[number], number>()
    for (const item of group) {
      let col = columns.findIndex((bottom) => bottom <= item.top)
      if (col === -1) {
        col = columns.length
        columns.push(item.bottom)
      } else columns[col] = item.bottom
      colOf.set(item, col)
    }
    const n = columns.length
    for (const item of group) {
      const col = colOf.get(item)!
      let span = 1
      while (col + span < n) {
        const blocked = group.some(
          (other) =>
            colOf.get(other) === col + span && other.top < item.bottom && other.bottom > item.top,
        )
        if (blocked) break
        span++
      }
      const from = col / n
      const last = col + span === n
      const share = last ? span / n : Math.min((span + SIDE_OVERLAP) / n, 1 - from)
      const left = regionLeft + from * (1 - regionLeft)
      out.push({
        item: item.item,
        top: item.top,
        height: item.height,
        left,
        width: share * (1 - regionLeft),
        offsetPx: inset * (1 - from),
        shrinkPx: inset * share + (last && n > 1 ? SIDE_END_GAP_PX : 0),
        depth,
        stack: depth * 4 + Math.min(col, 3),
        continuesBefore: item.continuesBefore,
        continuesAfter: item.continuesAfter,
        compact: item.height < COMPACT_PX,
      })
      placed.push({ top: item.top, bottom: item.bottom, left, inset, depth })
    }
  }
  return out
}

/** Layout entry of a timed event: travel time (iPhone) counts as part of it, above the start. */
function eventEntry(instance: EventInstance): TimedItem<EventInstance> {
  return {
    item: instance,
    start: instance.travel
      ? new Date(instance.start.getTime() - instance.travel * 60_000)
      : instance.start,
    end: instance.end,
    contentStart: instance.start,
  }
}

/** Turns a laid-out event entry into its placement (travel part, compact by the event alone). */
function eventPlacement(
  { item, ...rest }: TimedLayout<EventInstance>,
  day: Date,
): TimedPlacement {
  const dayStart = startOfDay(day)
  const startPx = minutesSinceMidnight(item.start, day) * (HOUR_PX / 60)
  const travelPx = item.travel && item.start > dayStart ? Math.max(0, startPx - rest.top) : 0
  return {
    ...rest,
    instance: item,
    // Travel time reaching into the previous day does not make the event continue from it.
    continuesBefore: item.start < dayStart,
    travelPx,
    compact: rest.height - travelPx < COMPACT_PX,
  }
}

/**
 * Timed events of one day (see `layoutTimed`); all-day and day-long events are skipped. Travel
 * time (iPhone) is drawn as part of the chip above the start, so it counts for overlaps too.
 */
export function layoutDay(instances: EventInstance[], day: Date): TimedPlacement[] {
  return layoutTimed(instances.filter((i) => !isAllDayRow(i)).map(eventEntry), day).map((p) =>
    eventPlacement(p, day),
  )
}

/**
 * Events and timed tasks of one day, laid out together (see `layoutTimed`): a task starting
 * next to an event's title sits beside it, one starting lower down is drawn over its body.
 */
export function layoutDayWithTasks<T extends Task>(
  instances: EventInstance[],
  tasks: T[],
  day: Date,
): { events: TimedPlacement[]; tasks: TimedLayout<T>[] } {
  const isTask = new Set<unknown>(tasks)
  const placed = layoutTimed<EventInstance | T>(
    [
      ...instances.filter((i) => !isAllDayRow(i)).map(eventEntry),
      ...tasks.map((t) => ({ ...taskEntry(t), headerPx: TASK_HEADER_PX })),
    ],
    day,
  )
  const events: TimedPlacement[] = []
  const taskPlacements: TimedLayout<T>[] = []
  for (const p of placed) {
    if (isTask.has(p.item)) taskPlacements.push(p as TimedLayout<T>)
    else events.push(eventPlacement(p as TimedLayout<EventInstance>, day))
  }
  return { events, tasks: taskPlacements }
}

/**
 * A timed task as a layout entry: from its due time, its duration (TASK_SLOT_MIN by default)
 * long, kept within its day.
 */
export function taskEntry<T extends Task>(task: T): TimedItem<T> {
  const due = task.due!
  const end = Math.min(
    due.getTime() + (task.duration ?? TASK_SLOT_MIN) * 60_000,
    addDays(startOfDay(due), 1).getTime(),
  )
  return { item: task, start: due, end: new Date(end) }
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
