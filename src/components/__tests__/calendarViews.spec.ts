import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { expandEvent, parseEventObject, parseTask } from '@/api/ical'
import AgendaView from '@/components/calendar/AgendaView.vue'
import EventPopover from '@/components/calendar/EventPopover.vue'
import MonthView from '@/components/calendar/MonthView.vue'
import TaskPopover from '@/components/calendar/TaskPopover.vue'
import TasksPanel from '@/components/calendar/TasksPanel.vue'
import TimeGrid from '@/components/calendar/TimeGrid.vue'
import { addDays, eachDay, startOfDay, toDateKey } from '@/lib/dates'
import { markDragged } from '@/lib/dragGuard'
import { DAY_PX, HOUR_PX } from '@/lib/layout'
import { useAuthStore } from '@/stores/auth'
import { useCalendarsStore } from '@/stores/calendars'
import { useEventsStore } from '@/stores/events'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import {
  FakeClient,
  MY_TASKS,
  PERSONAL,
  WORK,
  eventIcs,
  todoIcs,
} from '@/stores/__tests__/fakeClient'
import { pickDate } from './pickers'

/** test-utils builds a MouseEvent for pointer* and cannot set `button`; dispatch a real PointerEvent. */
async function pointer(target: { element: Element }, type: string, init: PointerEventInit) {
  target.element.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerType: 'mouse',
      ...init,
    }),
  )
  await nextTick()
}

const WEEK = { start: new Date(2026, 9, 12), end: new Date(2026, 9, 19) }
/** Grid pixels for a number of minutes (the grid is HOUR_PX per hour). */
const px = (minutes: number) => (minutes * HOUR_PX) / 60
const colorFor = (url: string) => (url === WORK.url ? '#225688' : '#566c86')

function seeded() {
  const client = new FakeClient()
  const review = client.seed(
    WORK,
    'review',
    eventIcs('review', 'Design review', '20261014T080000Z', '20261014T093000Z'),
  )
  const standup = client.seed(
    WORK,
    'standup',
    eventIcs('standup', 'Daily Standup', '20261014T080000Z', '20261014T081000Z'),
  )
  const offsite = client.seed(
    WORK,
    'offsite',
    eventIcs('offsite', 'Offsite', '20261015', '20261017')
      .replace(/DTSTART:/, 'DTSTART;VALUE=DATE:')
      .replace(/DTEND:/, 'DTEND;VALUE=DATE:'),
  )
  const gym = client.seed(
    PERSONAL,
    'gym',
    eventIcs('gym', 'Gym', '20261016T060000Z', '20261016T070000Z'),
  )
  const todo = client.seed(
    MY_TASKS,
    'slides',
    todoIcs('slides', 'Prepare slides', 'DUE:20261014T100000Z\r\n'),
  )
  const done = client.seed(
    MY_TASKS,
    'done',
    todoIcs('done', 'Buy milk', 'STATUS:COMPLETED\r\nCOMPLETED:20261010T100000Z\r\n'),
  )
  const instances = [review, standup, offsite, gym].flatMap((o) =>
    expandEvent(parseEventObject(o), WEEK.start, WEEK.end),
  )
  const tasks = [parseTask(todo), parseTask(done)]
  return { client, instances, tasks }
}

describe('TimeGrid', () => {
  it('renders headers, all-day bar, positioned chips, overlap columns, tasks and emits', async () => {
    const { instances, tasks } = seeded()
    const wrapper = mount(TimeGrid, {
      props: { days: eachDay(WEEK), instances, tasks, colorFor },
      attachTo: document.body,
    })
    expect(
      wrapper.findAll('[data-testid="time-grid"] .sticky span.font-display').map((s) => s.text()),
    ).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    // All-day bar spans Thu+Fri.
    const bar = wrapper.find('[data-testid="allday-row"] [style*="grid-column: 4 / span 2"]')
    expect(bar.text()).toBe('Offsite')
    // Wednesday 10:00 local (08:00Z in Belgrade DST); review 90 min, minus the 2px gap.
    const wed = wrapper.find('[data-day="2026-10-14"]')
    const chips = wed.findAll('.absolute.z-10')
    const review = chips.find((c) => c.text().includes('Design review'))!
    expect(review.attributes('style')).toContain(`top: ${px(600)}px`)
    expect(review.attributes('style')).toContain(`height: ${px(90) - 2}px`)
    expect(review.attributes('style')).toContain('width: calc(50% - 4px)')
    const standup = chips.find((c) => c.text().includes('Daily Standup'))!
    expect(standup.attributes('style')).toContain('height: 14px')
    expect(standup.text()).toContain('10:00')
    expect(wed.text()).toContain('Prepare slides')
    expect(wrapper.find('[data-day="2026-10-16"]').text()).toContain('Gym')

    await review.find('button').trigger('click')
    expect(wrapper.emitted('selectEvent')![0]![0]).toMatchObject({ summary: 'Design review' })
    await wed.find('button[title="Prepare slides"]').trigger('click')
    expect(wrapper.emitted('selectTask')![0]![0]).toMatchObject({ summary: 'Prepare slides' })

    // Clicking empty space creates an event at the snapped slot.
    const col = wrapper.find('[data-day="2026-10-13"]')
    col.element.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      width: 100,
      height: DAY_PX,
      bottom: DAY_PX,
      right: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    await pointer(col, 'pointerdown', { clientX: 50, clientY: px(635) })
    await pointer(col, 'pointerup', { clientX: 50, clientY: px(635) })
    const [start, end, allDay] = wrapper.emitted('createAt')![0]!
    expect(start).toEqual(new Date(2026, 9, 13, 10, 30))
    expect(end).toEqual(new Date(2026, 9, 13, 11, 0)) // 30-minute default
    expect(allDay).toBe(false)
    wrapper.unmount()
  })

  it('lays a task over an event it overlaps, slightly narrower, like Google Calendar', async () => {
    const { instances, tasks } = seeded()
    // Due Wednesday 10:30, during "Design review" (10:00–11:30), after the 10-minute standup.
    const overlapping = parseTask({
      url: `${MY_TASKS.url}call.ics`,
      collectionUrl: MY_TASKS.url,
      etag: '"1"',
      data: todoIcs('call', 'Call Ana', 'DUE:20261014T083000Z\r\n'),
    })
    const wrapper = mount(TimeGrid, {
      props: { days: eachDay(WEEK), instances, tasks: [...tasks, overlapping], colorFor },
    })
    const wed = wrapper.find('[data-day="2026-10-14"]')
    const call = wed.find('.absolute.z-20')
    const review = wed.findAll('.absolute.z-10').find((c) => c.text().includes('Design review'))!
    // The task is a 30-minute block (minus the 2px gap) with its time, laid over the review and
    // indented 8px; the review keeps its width (half: the standup sits beside it).
    expect(call.text()).toBe('Call Ana, 10:30')
    expect(call.classes()).toContain('ring-white')
    expect(call.attributes('style')).toContain(`top: ${px(630)}px`)
    expect(call.attributes('style')).toContain(`height: ${px(30) - 2}px`)
    expect(call.attributes('style')).toContain('left: calc(0% + 10px)')
    expect(call.attributes('style')).toContain('width: calc(50% - 12px)')
    expect(review.attributes('style')).toContain('width: calc(50% - 4px)')
    // A task with nothing under it is a plain full-width chip.
    const slides = wed.findAll('.absolute.z-10').find((c) => c.text().startsWith('Prepare slides'))!
    expect(slides.attributes('style')).toContain('width: calc(100% - 4px)')
    wrapper.unmount()
  })

  it('shows travel time as a band above the event', () => {
    const { instances } = seeded()
    const withTravel = instances.map((i) =>
      i.summary === 'Design review' ? { ...i, travel: 30 } : i,
    )
    const wrapper = mount(TimeGrid, {
      props: { days: eachDay(WEEK), instances: withTravel, tasks: [], colorFor },
    })
    const band = wrapper.find('[data-day="2026-10-14"] [data-testid="travel-time"]')
    expect(band.text()).toBe('30 min')
    expect(band.attributes('style')).toContain(`height: ${px(30)}px`)
    // The chip starts 30 minutes earlier; the event itself sits below the band.
    const review = band.element.parentElement!
    expect(review.getAttribute('style')).toContain(`top: ${px(570)}px`)
    expect(review.querySelector('button')!.getAttribute('style')).toContain(`top: ${px(30)}px`)
    wrapper.unmount()
  })

  it('changes the travel time by dragging the top edge of its box', async () => {
    const { instances } = seeded()
    const withTravel = instances.map((i) =>
      i.summary === 'Design review' ? { ...i, travel: 30 } : i,
    )
    const wrapper = mount(TimeGrid, {
      props: { days: eachDay(WEEK), instances: withTravel, tasks: [], colorFor },
      attachTo: document.body,
    })
    const handle = wrapper.find('[data-day="2026-10-14"] [data-testid="travel-handle"]')
    // Review starts at 10:00; drag the top edge from 09:30 up to 09:15 (45 minutes).
    await pointer(handle, 'pointerdown', { clientX: 450, clientY: px(570) })
    await pointer(handle, 'pointermove', { clientX: 450, clientY: px(555) })
    // The box follows while dragging.
    expect(
      wrapper.find('[data-day="2026-10-14"] [data-testid="travel-time"]').attributes('style'),
    ).toContain(`height: ${px(45)}px`)
    await pointer(handle, 'pointerup', { clientX: 450, clientY: px(555) })
    const [instance, minutes] = wrapper.emitted('setTravel')![0]!
    expect(instance).toMatchObject({ summary: 'Design review' })
    expect(minutes).toBe(45)
    wrapper.unmount()
  })

  it('drags on empty space to pick a slot, drags chips to move them and resizes from the bottom edge', async () => {
    const { instances } = seeded()
    const wrapper = mount(TimeGrid, {
      props: { days: eachDay(WEEK), instances, tasks: [], colorFor },
      attachTo: document.body,
    })
    const cols = wrapper.findAll('[data-day]')
    cols.forEach((c, i) => {
      c.element.getBoundingClientRect = () => ({
        top: 0,
        left: i * 100,
        width: 100,
        height: DAY_PX,
        bottom: DAY_PX,
        right: (i + 1) * 100,
        x: i * 100,
        y: 0,
        toJSON: () => ({}),
      })
    })

    // Drag from 10:00 to 11:40 on Tuesday → 10:00–11:45 (15-minute snap).
    const tue = cols[1]!
    await pointer(tue, 'pointerdown', { clientX: 150, clientY: px(600) })
    await pointer(tue, 'pointermove', { clientX: 150, clientY: px(700) })
    expect(wrapper.find('[data-testid="drag-preview"]').text()).toContain('10:00–11:45')
    await pointer(tue, 'pointerup', { clientX: 150, clientY: px(700) })
    const [s1, e1] = wrapper.emitted('createAt')![0]!
    expect(s1).toEqual(new Date(2026, 9, 13, 10, 0))
    expect(e1).toEqual(new Date(2026, 9, 13, 11, 45))

    // Move "Design review" (Wed 10:00–11:30) to Thursday 13:00.
    const review = wrapper.find('[data-chip$="review.ics|"]')
    await pointer(review, 'pointerdown', { clientX: 250, clientY: px(610) })
    await pointer(review, 'pointermove', { clientX: 350, clientY: px(790) })
    expect(wrapper.find('[data-testid="drag-preview"]').text()).toContain('13:00–14:30')
    expect(wrapper.find('[data-chip$="review.ics|"]').classes()).toContain('opacity-40')
    await pointer(review, 'pointerup', { clientX: 350, clientY: px(790) })
    const [moved, ms, me] = wrapper.emitted('moveEvent')![0]!
    expect(moved).toMatchObject({ summary: 'Design review' })
    expect(ms).toEqual(new Date(2026, 9, 15, 13, 0))
    expect(me).toEqual(new Date(2026, 9, 15, 14, 30))
    // The click that follows a drag does not select.
    await review.find('button').trigger('click')
    expect(wrapper.emitted('selectEvent')).toBeUndefined()

    // Resize "Gym" (Fri 08:00–09:00) to end at 09:45.
    const gym = wrapper.find('[data-chip$="gym.ics|"]')
    await pointer(gym.find('[data-testid="resize-handle"]'), 'pointerdown', {
      clientX: 450,
      clientY: px(540),
    })
    await pointer(gym, 'pointermove', { clientX: 450, clientY: px(587) })
    await pointer(gym, 'pointerup', { clientX: 450, clientY: px(587) })
    const [, rs, re] = wrapper.emitted('moveEvent')![1]!
    expect(rs).toEqual(new Date(2026, 9, 16, 8, 0))
    expect(re).toEqual(new Date(2026, 9, 16, 9, 45))

    // A press without movement on a chip is still a click.
    const standup = wrapper.find('[data-chip$="standup.ics|"]')
    await new Promise((r) => setTimeout(r, 450))
    await pointer(standup, 'pointerdown', { clientX: 250, clientY: px(605) })
    await pointer(standup, 'pointerup', { clientX: 251, clientY: px(606) })
    await standup.find('button').trigger('click')
    expect(wrapper.emitted('selectEvent')![0]![0]).toMatchObject({ summary: 'Daily Standup' })
    wrapper.unmount()
  })

  it('copies an event or task with Alt + drag and leaves the original in place', async () => {
    markDragged(0)
    const { instances, tasks } = seeded()
    const wrapper = mount(TimeGrid, {
      props: { days: eachDay(WEEK), instances, tasks, colorFor },
      attachTo: document.body,
    })
    wrapper.findAll('[data-day]').forEach((c, i) => {
      c.element.getBoundingClientRect = () => ({
        top: 0,
        left: i * 100,
        width: 100,
        height: DAY_PX,
        bottom: DAY_PX,
        right: (i + 1) * 100,
        x: i * 100,
        y: 0,
        toJSON: () => ({}),
      })
    })
    // "Design review" (Wed 10:00–11:30) to Thursday 13:00 with Alt held.
    const review = wrapper.find('[data-chip$="review.ics|"]')
    await pointer(review, 'pointerdown', { clientX: 250, clientY: px(610) })
    await pointer(review, 'pointermove', { clientX: 350, clientY: px(790), altKey: true })
    expect(wrapper.find('[data-chip$="review.ics|"]').classes()).not.toContain('opacity-40')
    expect(wrapper.find('[data-testid="time-grid"]').classes()).toContain('cursor-copy')
    await pointer(review, 'pointerup', { clientX: 350, clientY: px(790), altKey: true })
    expect(wrapper.emitted('moveEvent')).toBeUndefined()
    const [copied, start, end] = wrapper.emitted('copyEvent')![0]!
    expect(copied).toMatchObject({ summary: 'Design review' })
    expect(start).toEqual(new Date(2026, 9, 15, 13, 0))
    expect(end).toEqual(new Date(2026, 9, 15, 14, 30))

    // A task chip the same way.
    const chip = wrapper.find('[data-task-chip$="slides.ics"]')
    await pointer(chip, 'pointerdown', { clientX: 250, clientY: px(725) })
    await pointer(chip, 'pointermove', { clientX: 350, clientY: px(905), altKey: true })
    await pointer(chip, 'pointerup', { clientX: 350, clientY: px(905), altKey: true })
    expect(wrapper.emitted('moveTask')).toBeUndefined()
    expect(wrapper.emitted('copyTask')![0]![1]).toEqual(new Date(2026, 9, 15, 15, 0))
    wrapper.unmount()
  })

  it('lengthens a task chip from its bottom edge', async () => {
    const { instances, tasks } = seeded()
    const wrapper = mount(TimeGrid, {
      props: { days: eachDay(WEEK), instances, tasks, colorFor },
      attachTo: document.body,
    })
    // "Prepare slides" is due Wednesday 12:00 and takes the default 30 minutes.
    const chip = () => wrapper.find('[data-task-chip$="slides.ics"]').element.parentElement!
    const handle = wrapper
      .find('[data-task-chip$="slides.ics"]')
      .element.parentElement!.querySelector('[data-testid="task-resize-handle"]')!
    handle.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, clientY: px(750) }),
    )
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: px(780) }))
    await nextTick()
    // The chip follows while dragging: 12:00 – 13:00.
    expect(chip().getAttribute('style')).toContain(`height: ${px(60) - 2}px`)
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: px(780) }))
    const [task, minutes] = wrapper.emitted('setTaskDuration')![0]!
    expect(task).toMatchObject({ summary: 'Prepare slides' })
    expect(minutes).toBe(60)
    wrapper.unmount()
  })

  it('drags a task chip to a new due date and time', async () => {
    const { instances, tasks } = seeded()
    const wrapper = mount(TimeGrid, {
      props: { days: eachDay(WEEK), instances, tasks, colorFor },
      attachTo: document.body,
    })
    const cols = wrapper.findAll('[data-day]')
    cols.forEach((c, i) => {
      c.element.getBoundingClientRect = () => ({
        top: 0,
        left: i * 100,
        width: 100,
        height: DAY_PX,
        bottom: DAY_PX,
        right: (i + 1) * 100,
        x: i * 100,
        y: 0,
        toJSON: () => ({}),
      })
    })
    // "Prepare slides" is due Wednesday 12:00; drag it to Thursday 15:00.
    const chip = wrapper.find('[data-task-chip$="slides.ics"]')
    await pointer(chip, 'pointerdown', { clientX: 250, clientY: px(725) })
    await pointer(chip, 'pointermove', { clientX: 350, clientY: px(905) })
    expect(wrapper.find('[data-testid="drag-preview"]').text()).toContain('Prepare slides')
    expect(wrapper.find('[data-testid="drag-preview"]').text()).toContain('15:00')
    await pointer(chip, 'pointerup', { clientX: 350, clientY: px(905) })
    const [task, due] = wrapper.emitted('moveTask')![0]!
    expect(task).toMatchObject({ summary: 'Prepare slides' })
    expect(due).toEqual(new Date(2026, 9, 15, 15, 0))
    await chip.trigger('click')
    expect(wrapper.emitted('selectTask')).toBeUndefined()
    wrapper.unmount()
  })

  it('leaves room below midnight that is not part of any day', async () => {
    const wrapper = mount(TimeGrid, {
      props: { days: eachDay(WEEK), instances: [], tasks: [], colorFor },
    })
    const room = wrapper.find('[data-testid="grid-overscroll"]')
    expect(room.exists()).toBe(true)
    expect(room.text()).toBe('00:00')
    // One empty cell per day, none of them a day column (no clicks, drops or chips there).
    expect(room.findAll('.border-l')).toHaveLength(7)
    expect(room.find('[data-day]').exists()).toBe(false)
    await room.trigger('pointerdown')
    expect(wrapper.emitted('createAt')).toBeUndefined()
    wrapper.unmount()
  })

  it("shows the current time line only in today's column", () => {
    const today = new Date()
    const wrapper = mount(TimeGrid, {
      props: { days: [today], instances: [], tasks: [], colorFor },
    })
    expect(wrapper.find('[data-testid="now-line"]').exists()).toBe(true)
    const other = mount(TimeGrid, {
      props: { days: [new Date(2000, 0, 1)], instances: [], tasks: [], colorFor },
    })
    expect(other.find('[data-testid="now-line"]').exists()).toBe(false)
  })

  it('shows "N pending tasks" under today\'s all-day events and drags one onto the grid', async () => {
    setActivePinia(createPinia())
    const today = startOfDay(new Date())
    const days = eachDay({ start: addDays(today, -1), end: addDays(today, 2) })
    const { instances } = seeded()
    const allDayToday = {
      ...instances.find((i) => i.summary === 'Offsite')!,
      start: today,
      end: addDays(today, 1),
    }
    const late = parseTask(
      new FakeClient().seed(
        MY_TASKS,
        'late',
        todoIcs('late', 'Late report', 'DUE:20200105T100000Z\r\n'),
      ),
    )
    const wrapper = mount(TimeGrid, {
      props: { days, instances: [allDayToday], tasks: [], colorFor, pendingTasks: [late] },
      attachTo: document.body,
    })
    // Today is the second column; its all-day event takes lane 1, so the item goes to lane 2.
    const item = wrapper.find('[data-testid="pending-tasks"]')
    expect(item.text()).toBe('1 pending task')
    expect(item.element.parentElement!.getAttribute('style')).toContain(
      'grid-column: 2; grid-row: 2',
    )

    await item.trigger('click')
    const popover = () => document.querySelector('[data-testid="pending-popover"]')
    expect(popover()!.textContent).toContain('Late report')
    expect(popover()!.textContent).toContain('Drag one onto the calendar')

    const rect = (left: number, width: number, height: number) => () => ({
      top: 0,
      left,
      width,
      height,
      bottom: height,
      right: left + width,
      x: left,
      y: 0,
      toJSON: () => ({}),
    })
    wrapper.element.getBoundingClientRect = rect(0, 300, 2000)
    wrapper.findAll('[data-day]').forEach((c, i) => {
      c.element.getBoundingClientRect = rect(i * 100, 100, DAY_PX)
    })
    const row = { element: popover()!.querySelector('li')! }
    await pointer(row, 'pointerdown', { clientX: 500, clientY: px(500) })
    // The row leaves the DOM with the popover; later events go to whatever is under the pointer.
    const body = { element: document.body }
    // Off the grid: the popover closes and a ghost follows the pointer.
    await pointer(body, 'pointermove', { clientX: 500, clientY: px(600) })
    expect(popover()).toBeNull()
    expect(document.querySelector('[data-testid="pending-drag-ghost"]')!.textContent).toContain(
      'Late report',
    )
    // Over today's column at 15:00 (plus half the 22px chip height).
    await pointer(body, 'pointermove', { clientX: 150, clientY: px(900) + 11 })
    expect(document.querySelector('[data-testid="pending-drag-ghost"]')).toBeNull()
    expect(wrapper.find('[data-testid="drag-preview"]').text()).toContain('Late report')
    expect(wrapper.find('[data-testid="drag-preview"]').text()).toContain('15:00')
    await pointer(body, 'pointerup', { clientX: 150, clientY: px(900) + 11 })
    const [task, due] = wrapper.emitted('moveTask')![0]!
    expect(task).toMatchObject({ summary: 'Late report' })
    expect(due).toEqual(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15))
    wrapper.unmount()
  })

  it('takes a task dragged in from the tasks panel and drops it at the time under the pointer', async () => {
    markDragged(0)
    const { instances, tasks } = seeded()
    const wrapper = mount(TimeGrid, {
      props: { days: eachDay(WEEK), instances, tasks: [], colorFor },
      attachTo: document.body,
    })
    const rect = (left: number, width: number, height: number) => () => ({
      top: 0,
      left,
      width,
      height,
      bottom: height,
      right: left + width,
      x: left,
      y: 0,
      toJSON: () => ({}),
    })
    wrapper.element.getBoundingClientRect = rect(0, 700, 2000)
    wrapper.findAll('[data-day]').forEach((c, i) => {
      c.element.getBoundingClientRect = rect(i * 100, 100, DAY_PX)
    })
    // The panel sits to the right of the grid.
    const slides = tasks.find((t) => t.summary === 'Prepare slides')!
    ;(
      wrapper.vm as unknown as { grabExternalTask: (t: unknown, e: PointerEvent) => void }
    ).grabExternalTask(slides, new PointerEvent('pointerdown', { clientX: 900, clientY: 300 }))
    const body = { element: document.body }
    await pointer(body, 'pointermove', { clientX: 900, clientY: 340 })
    expect(document.querySelector('[data-testid="pending-drag-ghost"]')!.textContent).toContain(
      'Prepare slides',
    )
    // Thursday at 09:00 (plus half the chip height).
    await pointer(body, 'pointermove', { clientX: 350, clientY: px(540) + 11 })
    expect(wrapper.find('[data-testid="drag-preview"]').text()).toContain('09:00')
    await pointer(body, 'pointerup', { clientX: 350, clientY: px(540) + 11 })
    const [task, due] = wrapper.emitted('moveTask')![0]!
    expect(task).toMatchObject({ summary: 'Prepare slides' })
    expect(due).toEqual(new Date(2026, 9, 15, 9, 0))
    wrapper.unmount()
  })

  it('opens a pending task for editing on a plain click and hides the item without pending tasks', async () => {
    setActivePinia(createPinia())
    markDragged(0) // the previous test ended with a real drag
    const today = startOfDay(new Date())
    const late = parseTask(
      new FakeClient().seed(
        MY_TASKS,
        'late',
        todoIcs('late', 'Late', 'DUE;VALUE=DATE:20200105\r\n'),
      ),
    )
    const wrapper = mount(TimeGrid, {
      props: { days: [today], instances: [], tasks: [], colorFor, pendingTasks: [late] },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="pending-tasks"]').trigger('click')
    const row = { element: document.querySelector('[data-testid="pending-popover"] li')! }
    await pointer(row, 'pointerdown', { clientX: 10, clientY: 10 })
    await pointer(row, 'pointerup', { clientX: 10, clientY: 10 })
    ;(row.element.querySelector('button') as HTMLButtonElement).click()
    await nextTick()
    expect(useUiStore().createDraft).toMatchObject({
      kind: 'task',
      edit: { objectUrl: late.objectUrl },
    })
    expect(document.querySelector('[data-testid="pending-popover"]')).toBeNull()
    expect(wrapper.emitted('moveTask')).toBeUndefined()

    await wrapper.setProps({ pendingTasks: [] })
    expect(wrapper.find('[data-testid="pending-tasks"]').exists()).toBe(false)
    const past = mount(TimeGrid, {
      props: {
        days: [addDays(today, -7)],
        instances: [],
        tasks: [],
        colorFor,
        pendingTasks: [late],
      },
    })
    expect(past.find('[data-testid="pending-tasks"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('MonthView', () => {
  it('renders weeks of days: bars for all-day events, lines for timed ones, and +N', async () => {
    const { instances, tasks } = seeded()
    const range = { start: new Date(2026, 8, 28), end: new Date(2026, 10, 9) }
    // More Wednesday items than fit: some go behind "+N".
    const extra = (n: number, h: number) => ({
      ...instances.find((i) => i.summary === 'Gym')!,
      objectUrl: `https://x/extra${n}.ics`,
      summary: `Extra ${n}`,
      start: new Date(2026, 9, 14, h),
      end: new Date(2026, 9, 14, h + 1),
    })
    const wrapper = mount(MonthView, {
      props: {
        range,
        month: 9,
        instances: [...instances, extra(1, 15), extra(2, 16), extra(3, 17)],
        tasks,
        colorFor,
      },
      attachTo: document.body,
    })
    expect(wrapper.findAll('[data-date]')).toHaveLength(42)
    expect(wrapper.findAll('[data-testid="month-week"]')).toHaveLength(6)
    const wed = wrapper.find('[data-date="2026-10-14"]')
    expect(wed.text()).toContain('Daily Standup')
    expect(wed.find('[data-testid="month-more"]').exists()).toBe(true)
    // The all-day / multi-day "Offsite" is a bar in its week, not a line in the cell.
    const week = wrapper.findAll('[data-testid="month-week"]')[2]!
    expect(week.text()).toContain('Offsite')
    expect(wrapper.find('[data-date="2026-10-01"]').text()).toContain('Oct')
    expect(wrapper.find('[data-date="2026-09-28"]').classes()).toContain('bg-gray-50/60')
    // "+N" opens the whole day in a card.
    await wed.find('[data-testid="month-more"]').trigger('click')
    expect(wrapper.emitted('showMore')![0]![0]).toEqual(new Date(2026, 9, 14))
    const card = document.querySelector('[data-testid="month-day-card"]')!
    expect(card.textContent).toContain('Extra 3')
    expect(card.textContent).toContain('Design review')
    await wrapper.find('[data-date="2026-10-20"]').trigger('click')
    expect(wrapper.emitted('createAt')![0]!.slice(0, 3)).toEqual([
      new Date(2026, 9, 20),
      new Date(2026, 9, 21),
      true,
    ])
    wrapper.unmount()
  })

  it("shows pending tasks in today's cell and keeps the line limit", async () => {
    setActivePinia(createPinia())
    const today = startOfDay(new Date())
    const range = { start: addDays(today, -14), end: addDays(today, 28) }
    const { instances } = seeded()
    const gym = instances.find((i) => i.summary === 'Gym')!
    const at = (h: number, n: number) => ({
      ...gym,
      objectUrl: `https://x/${n}.ics`,
      summary: `Item ${n}`,
      start: new Date(today.getFullYear(), today.getMonth(), today.getDate(), h),
      end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), h + 1),
    })
    const late = parseTask(
      new FakeClient().seed(
        MY_TASKS,
        'late',
        todoIcs('late', 'Late', 'DUE;VALUE=DATE:20200105\r\n'),
      ),
    )
    const wrapper = mount(MonthView, {
      props: {
        range,
        month: today.getMonth(),
        instances: [at(9, 1), at(10, 2), at(11, 3), at(12, 4)],
        tasks: [],
        colorFor,
        pendingTasks: [late],
      },
      attachTo: document.body,
    })
    const cell = wrapper.find(`[data-date="${toDateKey(today)}"]`)
    expect(cell.find('[data-testid="pending-tasks"]').text()).toBe('1 pending task')
    // Pending item + two lines + "+N" instead of three lines.
    expect(cell.text()).toContain('Item 1')
    expect(cell.text()).toContain('Item 2')
    expect(cell.text()).not.toContain('Item 3')
    expect(cell.find('[data-testid="month-more"]').text()).toBe('+2')
    await cell.find('[data-testid="pending-tasks"]').trigger('click')
    expect(wrapper.emitted('createAt')).toBeUndefined()
    const popover = document.querySelector('[data-testid="pending-popover"]')!
    expect(popover.textContent).toContain('Late')
    expect(popover.textContent).not.toContain('Drag one')
    wrapper.unmount()
  })
})

describe('AgendaView', () => {
  it('groups by day and shows an empty state', () => {
    const { instances, tasks } = seeded()
    const wrapper = mount(AgendaView, {
      props: { range: WEEK, instances, tasks, colorFor, nameFor: () => 'Work' },
    })
    expect(wrapper.text()).toContain('October 12 – 18, 2026')
    expect(wrapper.text()).toContain('6 items')
    const days = wrapper.findAll('li.flex.gap-x-4')
    expect(days.map((d) => d.find('time').attributes('datetime'))).toEqual([
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ])
    expect(days[0]!.text()).toContain('10:00 – 11:30')
    expect(days[0]!.text()).toContain('12:00')
    expect(days[1]!.text()).toContain('All day')
    const empty = mount(AgendaView, {
      props: { range: WEEK, instances: [], tasks: [], colorFor, nameFor: () => '' },
    })
    expect(empty.text()).toContain('Nothing planned')
  })
})

describe('TasksPanel and EventPopover', () => {
  let client: FakeClient
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    client = seeded().client
    useAuthStore()._setClient(client)
    await useCalendarsStore().load()
    await useTasksStore().ensureLoaded()
    await useEventsStore().ensureLoaded(WEEK)
  })

  it('lists open and completed tasks of the picked list and toggles completion', async () => {
    const wrapper = mount(TasksPanel)
    expect(wrapper.text()).toContain('My tasks')
    expect(wrapper.text()).toContain('Prepare slides')
    expect(wrapper.text()).toContain('Completed (1)')
    const box = wrapper.find('input[aria-label="Mark as completed: Prepare slides"]')
    ;(box.element as HTMLInputElement).checked = true
    await box.trigger('change')
    await flushPromises()
    expect(client.objects.get(`${MY_TASKS.url}slides.ics`)!.data).toContain('STATUS:COMPLETED')
    expect(wrapper.text()).toContain('Completed (2)')

    // "Add a task" adds inline, like the Tasks view, instead of opening the popup.
    await wrapper.find('button.text-accent').trigger('click')
    expect(useUiStore().createDraft).toBeNull()
    await wrapper.find('input[aria-label="New task title"]').setValue('Call the dentist')
    await pickDate(wrapper, 'New task due date', '2026-10-20')
    await wrapper.find('[data-testid="inline-add"]').trigger('submit')
    await flushPromises()
    const created = [...client.objects.values()].find((o) =>
      o.data.includes('SUMMARY:Call the dentist'),
    )!
    expect(created.collectionUrl).toBe(MY_TASKS.url)
    expect(created.data).toContain('DUE;VALUE=DATE:20261020')
    expect(wrapper.text()).toContain('Call the dentist')
    await wrapper.find('input[aria-label="New task title"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="inline-add"]').exists()).toBe(false)
  })

  it('lets its rows be dragged towards the calendar', async () => {
    const wrapper = mount(TasksPanel)
    const row = wrapper.find('li[data-task="slides"]')
    await pointer(row.find('p'), 'pointerdown', { clientX: 5, clientY: 5 })
    expect(wrapper.emitted('grab')![0]![0]).toMatchObject({ summary: 'Prepare slides' })
  })

  it('remembers the picked task list, also while it is hidden', async () => {
    const shopping = { ...MY_TASKS, url: MY_TASKS.url.replace('my-tasks', 'shopping') }
    client.collections.push({ ...shopping, displayName: 'Shopping', color: '#0ea5e9' })
    const calendars = useCalendarsStore()
    await calendars.load()
    const wrapper = mount(TasksPanel)
    const current = () => wrapper.find('button[aria-haspopup="listbox"]').text()
    expect(current()).toContain('My tasks')

    await wrapper.find('button[aria-haspopup="listbox"]').trigger('click')
    const option = wrapper.findAll('[role="option"]').find((o) => o.text().includes('Shopping'))!
    await option.trigger('click')
    expect(current()).toContain('Shopping')
    expect(useUiStore().tasksPanelList).toBe(shopping.url)

    // Hidden in the sidebar: the panel falls back without forgetting the choice.
    calendars.setVisible(shopping.url, false)
    await nextTick()
    expect(current()).toContain('My tasks')
    calendars.setVisible(shopping.url, true)
    await nextTick()
    expect(current()).toContain('Shopping')
    wrapper.unmount()

    // Survives a reload (layout in localStorage).
    await nextTick()
    setActivePinia(createPinia())
    expect(useUiStore().tasksPanelList).toBe(shopping.url)
  })

  it('shows task details from the calendar, completes, opens edit and deletes', async () => {
    const tasks = useTasksStore()
    const slides = tasks.get(`${MY_TASKS.url}slides.ics`)!
    const wrapper = mount(TaskPopover, {
      props: { task: slides, anchor: { x: 10, y: 10, width: 50, height: 20 } },
      attachTo: document.body,
    })
    expect(wrapper.find('h2').text()).toBe('Prepare slides')
    expect(wrapper.text()).toContain('My tasks')
    const button = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)!
    await button('Mark completed').trigger('click')
    await flushPromises()
    expect(client.objects.get(slides.objectUrl)!.data).toContain('STATUS:COMPLETED')
    expect(wrapper.emitted('close')).toHaveLength(1)

    await button('Edit').trigger('click')
    expect(useUiStore().createDraft).toMatchObject({
      kind: 'task',
      edit: { objectUrl: slides.objectUrl },
    })
    await button('Delete').trigger('click')
    expect(wrapper.text()).toContain('Delete this task?')
    await wrapper.find('[data-testid="delete-confirm"]').trigger('click')
    await flushPromises()
    expect(client.objects.has(slides.objectUrl)).toBe(false)
    wrapper.unmount()
  })

  it('shows event details, opens edit and deletes with scope', async () => {
    const events = useEventsStore()
    const instance = events.instancesFor(WEEK).find((i) => i.summary === 'Design review')!
    const wrapper = mount(EventPopover, {
      props: { instance, anchor: { x: 10, y: 10, width: 50, height: 20 } },
      attachTo: document.body,
    })
    expect(wrapper.text()).toContain('Design review')
    expect(wrapper.text()).toContain('Wednesday, October 14, 2026 · 10:00 – 11:30')
    expect(wrapper.text()).toContain('Work')
    await wrapper.find('[data-testid="edit-button"]').trigger('click')
    expect(useUiStore().createDraft).toMatchObject({
      kind: 'event',
      edit: { objectUrl: instance.objectUrl },
    })
    await wrapper.find('[data-testid="delete-button"]').trigger('click')
    expect(wrapper.text()).toContain('Delete this event?')
    await wrapper.find('[data-testid="delete-confirm"]').trigger('click')
    await flushPromises()
    expect(client.objects.has(instance.objectUrl)).toBe(false)
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })
})
