import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import CreatePopup from '@/components/create/CreatePopup.vue'
import TimeGrid from '@/components/calendar/TimeGrid.vue'
import { eachDay } from '@/lib/dates'
import { HOUR_PX } from '@/lib/layout'
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
import { pickDate, timeValue, typeTime } from './pickers'

const WEEK = { start: new Date(2026, 9, 12), end: new Date(2026, 9, 19) }
let client: FakeClient

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  client = new FakeClient()
  client.seed(
    WORK,
    'standup',
    eventIcs(
      'standup',
      'Standup',
      '20261012T073000Z',
      '20261012T074500Z',
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR\r\n',
    ),
  )
  client.seed(WORK, 'review', eventIcs('review', 'Review', '20261014T120000Z', '20261014T130000Z'))
  client.seed(MY_TASKS, 'milk', todoIcs('milk', 'Buy milk', 'DUE:20261015T150000Z\r\n'))
  useAuthStore()._setClient(client)
  const ui = useUiStore()
  ui.setDate(new Date(2026, 9, 14))
  await useCalendarsStore().load()
  await useEventsStore().ensureLoaded(WEEK)
  await useTasksStore().ensureLoaded()
})

/** Mounts the popup; unless `collapsed`, the date/time line is clicked open like a user would. */
async function open(
  draft: Parameters<ReturnType<typeof useUiStore>['openCreate']>[0],
  { collapsed = false } = {},
) {
  useUiStore().openCreate(draft)
  const wrapper = mount(CreatePopup, { attachTo: document.body })
  await flushPromises()
  if (!collapsed) await wrapper.find('[data-testid="when-summary"]').trigger('click')
  return wrapper
}

describe('CreatePopup', () => {
  it('validates, previews the draft in the grid and creates an event', async () => {
    const ui = useUiStore()
    const wrapper = await open({
      kind: 'event',
      start: new Date(2026, 9, 13, 10),
      end: new Date(2026, 9, 13, 11),
    })
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('New event')
    expect(wrapper.find('#event-calendar').attributes('data-value')).toBe(WORK.url)

    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').text()).toBe('Add a title')

    await wrapper.find('#create-name').setValue('Coffee')

    // The grid shows the draft chip with the live title.
    const grid = mount(TimeGrid, {
      props: {
        days: eachDay(WEEK),
        instances: [],
        tasks: [],
        colorFor: () => '#225688',
        draft: ui.createDraft,
        draftColor: '#225688',
      },
    })
    expect(grid.find('[data-testid="draft-chip"]').text()).toContain('Coffee')
    // 10:00–11:00 in grid pixels (not minutes): placed where the slot was clicked.
    const chipStyle = grid.find('[data-testid="draft-chip"]').attributes('style')
    expect(chipStyle).toContain(`top: ${(600 * HOUR_PX) / 60}px`)
    expect(chipStyle).toContain(`height: ${HOUR_PX - 2}px`)

    await typeTime(wrapper, 'End time', '11:30')
    await wrapper.find('#event-location').setValue('Cafe')
    await wrapper.find('#event-repeat').trigger('click')
    await wrapper.find('[role="option"][data-value="weekdays"]').trigger('mousedown')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Add notification')!
      .trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(ui.createDraft).toBeNull()
    const created = [...client.objects.values()].find((o) => o.data.includes('SUMMARY:Coffee'))!
    expect(created.collectionUrl).toBe(WORK.url)
    expect(created.data).toContain('DTSTART;TZID=Europe/Belgrade:20261013T100000')
    expect(created.data).toContain('DTEND;TZID=Europe/Belgrade:20261013T113000')
    expect(created.data).toContain('LOCATION:Cafe')
    expect(created.data).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    expect(created.data).toContain('TRIGGER:-PT30M')
    expect(
      useEventsStore()
        .instancesFor(WEEK)
        .filter((i) => i.summary === 'Coffee'),
    ).toHaveLength(4)
    wrapper.unmount()
  })

  it('keeps the 30-minute default for a slot away from the form default start', async () => {
    const wrapper = await open({
      kind: 'event',
      start: new Date(2026, 9, 13, 14),
      end: new Date(2026, 9, 13, 14, 30),
    })
    expect(timeValue(wrapper, 'Start time')).toBe('14:00')
    expect(timeValue(wrapper, 'End time')).toBe('14:30')
    // Moving the start still keeps the length.
    await typeTime(wrapper, 'Start time', '15:00')
    expect(timeValue(wrapper, 'End time')).toBe('15:30')
    wrapper.unmount()
  })

  it('starts with the date and time as one line, like Google Calendar', async () => {
    const event = await open(
      { kind: 'event', start: new Date(2026, 9, 13, 18), end: new Date(2026, 9, 13, 18, 30) },
      { collapsed: true },
    )
    const line = event.find('[data-testid="when-summary"]')
    expect(line.text().replace(/\s+/g, ' ')).toBe(
      'Tuesday, October 13 · 18:00 – 18:30Does not repeat',
    )
    expect(event.find('input[aria-label="Start time"]').exists()).toBe(false)
    await line.trigger('click')
    expect(event.find('[data-testid="when-summary"]').exists()).toBe(false)
    expect(timeValue(event, 'Start time')).toBe('18:00')
    event.unmount()

    const late = await open(
      { kind: 'event', start: new Date(2026, 9, 13, 22), end: new Date(2026, 9, 14, 1) },
      { collapsed: true },
    )
    expect(late.find('[data-testid="when-summary"] span').text()).toBe(
      'Tuesday, October 13, 22:00 – Wednesday, October 14, 01:00',
    )
    late.unmount()

    const task = await open({ kind: 'task', start: new Date(2026, 9, 20, 9) }, { collapsed: true })
    expect(task.find('[data-testid="when-summary"]').text()).toBe('Tuesday, October 20 · 09:00')
    task.unmount()
  })

  it('types times loosely, lists end times with durations and crosses midnight', async () => {
    const wrapper = await open({
      kind: 'event',
      start: new Date(2026, 9, 13, 10),
      end: new Date(2026, 9, 13, 11),
    })
    await wrapper.find('#create-name').setValue('Late show')
    expect(wrapper.find('button[aria-label^="Start date:"]').text()).toBe('Tuesday, October 13')
    // "2130" reads as 21:30; the end moves along and keeps the hour.
    await typeTime(wrapper, 'Start time', '2130')
    expect(timeValue(wrapper, 'Start time')).toBe('21:30')
    expect(timeValue(wrapper, 'End time')).toBe('22:30')

    // The end list starts at the start and shows durations.
    await wrapper.find('input[aria-label="End time"]').trigger('focus')
    const options = wrapper.findAll('[role="listbox"][aria-label="End time"] [role="option"]')
    const text = (i: number) => options[i]!.text().replace(/\s+/g, ' ')
    expect([text(0), text(1), text(4), text(6)]).toEqual([
      '21:30 (0 mins)',
      '21:45 (15 mins)',
      '22:30 (1 hr)',
      '23:00 (1.5 hrs)',
    ])
    // Picking 01:00 ends the event the next day, and the end date shows up.
    await options.find((o) => o.text().startsWith('01:00'))!.trigger('mousedown')
    expect(timeValue(wrapper, 'End time')).toBe('01:00')
    expect(wrapper.find('button[aria-label^="End date:"]').text()).toBe('Wed, Oct 14')

    // With two dates in the row both use the short form; ending the same day shows one long date.
    expect(wrapper.find('button[aria-label^="Start date:"]').text()).toBe('Tue, Oct 13')
    await typeTime(wrapper, 'End time', '23:00')
    expect(wrapper.find('button[aria-label^="Start date:"]').text()).toBe('Tuesday, October 13')
    expect(wrapper.find('button[aria-label^="End date:"]').exists()).toBe(false)
    await typeTime(wrapper, 'End time', '1')
    // Moving the start date carries the end along.
    await pickDate(wrapper, 'Start date', '2026-10-15')
    expect(wrapper.find('button[aria-label^="End date:"]').text()).toBe('Fri, Oct 16')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const created = [...client.objects.values()].find((o) => o.data.includes('SUMMARY:Late show'))!
    expect(created.data).toContain('DTSTART;TZID=Europe/Belgrade:20261015T213000')
    expect(created.data).toContain('DTEND;TZID=Europe/Belgrade:20261016T010000')
    wrapper.unmount()
  })

  it('makes a multi-day timed event through the end date', async () => {
    const wrapper = await open({
      kind: 'event',
      start: new Date(2026, 9, 13, 9),
      end: new Date(2026, 9, 13, 10),
    })
    await wrapper.find('#create-name').setValue('Conference')
    // Ending before the start moves the end to the next day; its date can then be changed.
    await typeTime(wrapper, 'End time', '8')
    await pickDate(wrapper, 'End date', '2026-10-15')
    await typeTime(wrapper, 'End time', '5pm')
    // Past the first day the end list is a plain clock, not durations.
    await wrapper.find('input[aria-label="End time"]').trigger('focus')
    expect(wrapper.find('[role="listbox"][aria-label="End time"]').text()).not.toContain('(')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const created = [...client.objects.values()].find((o) => o.data.includes('SUMMARY:Conference'))!
    expect(created.data).toContain('DTSTART;TZID=Europe/Belgrade:20261013T090000')
    expect(created.data).toContain('DTEND;TZID=Europe/Belgrade:20261015T170000')
    wrapper.unmount()
  })

  it('changes nothing outside the popup while editing, until Save', async () => {
    const ui = useUiStore()
    const events = useEventsStore()
    const review = events.instancesFor(WEEK).find((i) => i.summary === 'Review')!
    const saved = client.objects.get(review.objectUrl)!.data
    const wrapper = await open({
      kind: 'event',
      edit: { objectUrl: review.objectUrl, recurrenceId: null },
    })
    const draftBefore = { ...ui.createDraft }
    await wrapper.find('#create-name').setValue('Review (moved)')
    await typeTime(wrapper, 'Start time', '16:00')
    await pickDate(wrapper, 'Start date', '2026-10-16')
    // No live preview: the draft, the store and the server still hold the saved event.
    expect(ui.createDraft).toEqual(draftBefore)
    expect(events.instancesFor(WEEK).find((i) => i.objectUrl === review.objectUrl)!.summary).toBe(
      'Review',
    )
    expect(client.objects.get(review.objectUrl)!.data).toBe(saved)
    // Cancel throws the changes away.
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Cancel')!
      .trigger('click')
    expect(ui.createDraft).toBeNull()
    expect(client.objects.get(review.objectUrl)!.data).toBe(saved)
    wrapper.unmount()
  })

  it('sets, keeps and removes Apple travel time on an event', async () => {
    const events = useEventsStore()
    const review = events.instancesFor(WEEK).find((i) => i.summary === 'Review')!
    const wrapper = await open({
      kind: 'event',
      edit: { objectUrl: review.objectUrl, recurrenceId: null },
    })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Add travel time')!
      .trigger('click')
    expect(wrapper.find('#event-travel').attributes('data-value')).toBe('30')
    await wrapper.find('#event-travel').trigger('click')
    await wrapper.find('[role="option"][data-value="60"]').trigger('mousedown')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const saved = () => client.objects.get(review.objectUrl)!.data
    expect(saved()).toContain('X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT1H')
    wrapper.unmount()

    // The edit popup reads it back; removing it drops the property.
    const again = await open({
      kind: 'event',
      edit: { objectUrl: review.objectUrl, recurrenceId: null },
    })
    expect(again.find('#event-travel').attributes('data-value')).toBe('60')
    await again
      .findAll('button')
      .find((b) => b.text() === 'Remove travel time')!
      .trigger('click')
    await flushPromises()
    expect(again.find('#event-travel').exists()).toBe(false)
    await again.find('form').trigger('submit')
    await flushPromises()
    expect(saved()).not.toContain('X-APPLE-TRAVEL')
    again.unmount()
  })

  it('takes a custom travel time in minutes', async () => {
    const events = useEventsStore()
    const review = events.instancesFor(WEEK).find((i) => i.summary === 'Review')!
    const wrapper = await open({
      kind: 'event',
      edit: { objectUrl: review.objectUrl, recurrenceId: null },
    })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Add travel time')!
      .trigger('click')
    expect(wrapper.find('[data-testid="travel-minutes"]').exists()).toBe(false)
    await wrapper.find('#event-travel').trigger('click')
    await wrapper.find('[role="option"][data-value="custom"]').trigger('mousedown')
    await wrapper.find('[data-testid="travel-minutes"]').setValue('45')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(client.objects.get(review.objectUrl)!.data).toContain(
      'X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT45M',
    )
    wrapper.unmount()

    // Read back: an odd value shows as custom with its minutes.
    const again = await open({
      kind: 'event',
      edit: { objectUrl: review.objectUrl, recurrenceId: null },
    })
    expect(again.find('#event-travel').attributes('data-value')).toBe('custom')
    expect((again.find('[data-testid="travel-minutes"]').element as HTMLInputElement).value).toBe(
      '45',
    )
    again.unmount()
  })

  it('duplicates an event and a task: a filled-in form that saves a new object', async () => {
    const events = useEventsStore()
    const review = events.instancesFor(WEEK).find((i) => i.summary === 'Review')!
    const before = client.objects.get(review.objectUrl)!.data
    const wrapper = await open({
      kind: 'event',
      copyOf: { objectUrl: review.objectUrl, recurrenceId: null },
    })
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('New event')
    expect((wrapper.find('#create-name').element as HTMLInputElement).value).toBe('Review')
    expect(timeValue(wrapper, 'Start time')).toBe(review.start.toTimeString().slice(0, 5))
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const reviews = [...client.objects.values()].filter((o) => o.data.includes('SUMMARY:Review'))
    expect(reviews).toHaveLength(2)
    expect(client.objects.get(review.objectUrl)!.data).toBe(before)
    wrapper.unmount()

    const milk = useTasksStore().get(`${MY_TASKS.url}milk.ics`)!
    const copy = await open({
      kind: 'task',
      copyOf: { objectUrl: milk.objectUrl, recurrenceId: null },
    })
    expect(timeValue(copy, 'Due time')).toBe('17:00')
    await copy.find('form').trigger('submit')
    await flushPromises()
    expect(
      [...client.objects.values()].filter((o) => o.data.includes('SUMMARY:Buy milk')),
    ).toHaveLength(2)
    copy.unmount()
  })

  it('sets and clears a task due date with the picker', async () => {
    const wrapper = await open({ kind: 'task' })
    await wrapper.find('#create-name').setValue('Plan trip')
    expect(wrapper.find('[data-testid="due-shortcuts"]').exists()).toBe(false)
    await pickDate(wrapper, 'Due date', '2026-12-24')
    expect(wrapper.find('button[aria-label^="Due date:"]').text()).toBe('Thursday, December 24')
    // The picker has no quick picks and no "No date".
    await wrapper.find('button[aria-label^="Due date:"]').trigger('click')
    expect(wrapper.find('[data-testid="date-picker"]').text()).not.toMatch(/Today|No date/)
    await wrapper.find('button[aria-label^="Due date:"]').trigger('click')
    // The "x" removes the time first, then the date.
    const clear = () =>
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Remove time' || b.text() === 'Remove due date')!
    expect(clear().text()).toBe('Remove time')
    await clear().trigger('click')
    expect(wrapper.find('input[aria-label="Due time"]').exists()).toBe(false)
    expect(clear().text()).toBe('Remove due date')
    await clear().trigger('click')
    expect(wrapper.find('button[aria-label^="Due date:"]').text()).toBe('No due date')
    await pickDate(wrapper, 'Due date', '2026-12-24')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Add time')!
      .trigger('click')
    await typeTime(wrapper, 'Due time', '18.15')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const created = [...client.objects.values()].find((o) => o.data.includes('SUMMARY:Plan trip'))!
    expect(created.data).toContain('DUE;TZID=Europe/Belgrade:20261224T181500')
    wrapper.unmount()
  })

  it('changes an existing event into a task and a task into an event, one undo step each', async () => {
    const events = useEventsStore()
    const review = events.instancesFor(WEEK).find((i) => i.summary === 'Review')!
    const wrapper = await open({
      kind: 'event',
      edit: { objectUrl: review.objectUrl, recurrenceId: null },
    })
    await wrapper.find('input[type="radio"][value="task"]').setValue()
    expect(wrapper.find('#task-list').attributes('data-value')).toBe(MY_TASKS.url)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(client.objects.has(review.objectUrl)).toBe(false)
    const task = [...client.objects.values()].find((o) => o.data.includes('SUMMARY:Review'))!
    expect(task.data).toContain('BEGIN:VTODO')
    expect(task.collectionUrl).toBe(MY_TASKS.url)
    wrapper.unmount()

    // And back: the task becomes an event at its due time.
    const tasks = useTasksStore()
    const asTask = tasks.tasksFor(MY_TASKS.url).find((t) => t.summary === 'Review')!
    const again = await open({
      kind: 'task',
      edit: { objectUrl: asTask.objectUrl, recurrenceId: null },
    })
    await again.find('input[type="radio"][value="event"]').setValue()
    await again.find('form').trigger('submit')
    await flushPromises()
    expect(client.objects.has(asTask.objectUrl)).toBe(false)
    const event = [...client.objects.values()].find((o) => o.data.includes('SUMMARY:Review'))!
    expect(event.data).toContain('BEGIN:VEVENT')
    again.unmount()
  })

  it('does not offer a repeating event as a task', async () => {
    const events = useEventsStore()
    const mon = events.instancesFor(WEEK).find((i) => i.summary === 'Standup')!
    const wrapper = await open({
      kind: 'event',
      edit: { objectUrl: mon.objectUrl, recurrenceId: mon.recurrenceId!.toString() },
    })
    expect(
      (wrapper.find('input[type="radio"][value="task"]').element as HTMLInputElement).disabled,
    ).toBe(true)
    wrapper.unmount()
  })

  it('starts new events and tasks in the default calendar and list from the settings', async () => {
    const ui = useUiStore()
    ui.defaultCalendar = PERSONAL.url
    const wrapper = await open({ kind: 'event', start: new Date(2026, 9, 13, 10) })
    expect(wrapper.find('#event-calendar').attributes('data-value')).toBe(PERSONAL.url)
    // A default that is gone falls back to the first calendar.
    wrapper.unmount()
    ui.defaultCalendar = 'https://gone/'
    const again = await open({ kind: 'event', start: new Date(2026, 9, 13, 10) })
    expect(again.find('#event-calendar').attributes('data-value')).toBe(WORK.url)
    again.unmount()
  })

  it('creates an all-day task via the type switcher', async () => {
    const wrapper = await open({
      kind: 'event',
      start: new Date(2026, 9, 13, 10),
      end: new Date(2026, 9, 13, 11),
    })
    await wrapper.find('input[type="radio"][value="task"]').setValue()
    expect(wrapper.find('#task-list').exists()).toBe(true)
    expect(wrapper.find('#task-list').attributes('data-value')).toBe(MY_TASKS.url)
    await wrapper.find('#create-name').setValue('Call plumber')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Remove time')!
      .trigger('click')
    await wrapper.find('#task-priority').trigger('click')
    await wrapper.find('[role="option"][data-value="high"]').trigger('mousedown')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const created = [...client.objects.values()].find((o) =>
      o.data.includes('SUMMARY:Call plumber'),
    )!
    expect(created.collectionUrl).toBe(MY_TASKS.url)
    expect(created.data).toContain('DUE;VALUE=DATE:20261013')
    expect(created.data).toContain('PRIORITY:1')
    wrapper.unmount()
  })

  it('edits one occurrence of a recurring event and moves an event to another calendar', async () => {
    const events = useEventsStore()
    const wed = events
      .instancesFor(WEEK)
      .find((i) => i.summary === 'Standup' && i.start.getDay() === 3)!
    const wrapper = await open({
      kind: 'event',
      edit: { objectUrl: wed.objectUrl, recurrenceId: wed.recurrenceId!.toString() },
    })
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('Edit event')
    expect((wrapper.find('#create-name').element as HTMLInputElement).value).toBe('Standup')
    expect(wrapper.find('[data-testid="scope"]').exists()).toBe(true)
    await wrapper.find('input[type="radio"][value="this"]').setValue()
    await wrapper.find('#create-name').setValue('Standup (demo)')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const names = events
      .instancesFor(WEEK)
      .filter((i) => i.uid === 'standup')
      .map((i) => i.summary)
    expect(names).toEqual(['Standup', 'Standup (demo)', 'Standup'])
    expect(client.objects.get(wed.objectUrl)!.data).toContain('RECURRENCE-ID')
    wrapper.unmount()

    const review = events.instancesFor(WEEK).find((i) => i.summary === 'Review')!
    const w2 = await open({
      kind: 'event',
      edit: { objectUrl: review.objectUrl, recurrenceId: null },
    })
    // The calendar picker: open it and pick Personal.
    await w2.find('#event-calendar').trigger('click')
    await w2.find(`[role="option"][data-value="${PERSONAL.url}"]`).trigger('mousedown')
    expect(w2.find('#event-calendar').attributes('data-value')).toBe(PERSONAL.url)
    await w2.find('#create-name').setValue('Review (personal)')
    await w2.find('form').trigger('submit')
    await flushPromises()
    expect(client.objects.has(review.objectUrl)).toBe(false)
    const moved = [...client.objects.values()].find((o) =>
      o.data.includes('SUMMARY:Review (personal)'),
    )!
    expect(moved.collectionUrl).toBe(PERSONAL.url)
    expect(events.instancesFor(WEEK).find((i) => i.uid === 'review')?.collectionUrl).toBe(
      PERSONAL.url,
    )
    w2.unmount()
  })

  it('shows the conflict dialog and saves again on top of the server copy', async () => {
    const events = useEventsStore()
    const review = events.instancesFor(WEEK).find((i) => i.summary === 'Review')!
    const wrapper = await open({
      kind: 'event',
      edit: { objectUrl: review.objectUrl, recurrenceId: null },
    })
    const server = client.objects.get(review.objectUrl)!
    client.objects.set(review.objectUrl, {
      ...server,
      etag: '"phone"',
      data: server.data
        .replace('SUMMARY:Review', 'SUMMARY:Review (phone)')
        .replace('DTSTART:20261014T120000Z', 'DTSTART:20261014T140000Z')
        .replace('DTEND:20261014T130000Z', 'DTEND:20261014T150000Z'),
    })
    await wrapper.find('#event-location').setValue('Room 4')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="conflict"]').exists()).toBe(true)
    expect(useUiStore().createDraft).not.toBeNull()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(useUiStore().createDraft).toBeNull()
    const saved = client.objects.get(review.objectUrl)!.data
    expect(saved).toContain('LOCATION:Room 4')
    // Our form still held the old title/time, so they win over the phone's; etag chain is intact.
    expect(saved).toContain('SUMMARY:Review\r\n')
    wrapper.unmount()
  })

  it('edits and deletes a task, and deletes a whole series', async () => {
    const tasks = useTasksStore()
    const milk = tasks.get(`${MY_TASKS.url}milk.ics`)!
    const wrapper = await open({
      kind: 'task',
      edit: { objectUrl: milk.objectUrl, recurrenceId: null },
    })
    expect((wrapper.find('#create-name').element as HTMLInputElement).value).toBe('Buy milk')
    expect(timeValue(wrapper, 'Due time')).toBe('17:00')
    await wrapper.find('#create-name').setValue('Buy oat milk')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(tasks.get(milk.objectUrl)?.summary).toBe('Buy oat milk')
    wrapper.unmount()

    const w2 = await open({ kind: 'task', edit: { objectUrl: milk.objectUrl, recurrenceId: null } })
    await w2.find('[data-testid="delete-button"]').trigger('click')
    expect(w2.find('[data-testid="confirm-delete"]').text()).toContain('Delete this task?')
    await w2.find('[data-testid="delete-confirm"]').trigger('click')
    await flushPromises()
    expect(client.objects.has(milk.objectUrl)).toBe(false)
    w2.unmount()

    const events = useEventsStore()
    const mon = events.instancesFor(WEEK).find((i) => i.summary === 'Standup')!
    const w3 = await open({
      kind: 'event',
      edit: { objectUrl: mon.objectUrl, recurrenceId: mon.recurrenceId!.toString() },
    })
    await w3.find('[data-testid="delete-button"]').trigger('click')
    expect(w3.find('[data-testid="confirm-delete"]').text()).toContain('repeating')
    await w3.find('[data-testid="delete-confirm"]').trigger('click') // All occurrences
    await flushPromises()
    expect(client.objects.has(mon.objectUrl)).toBe(false)
    expect(events.instancesFor(WEEK).some((i) => i.uid === 'standup')).toBe(false)
    w3.unmount()
  })

  it('closes with X, Cancel and a click outside', async () => {
    const ui = useUiStore()
    const wrapper = await open({ kind: 'event' })
    await wrapper.find('button[title="Close"]').trigger('click')
    expect(ui.createDraft).toBeNull()
    wrapper.unmount()

    const w2 = await open({ kind: 'event' })
    await w2
      .findAll('button')
      .find((b) => b.text() === 'Cancel')!
      .trigger('click')
    expect(ui.createDraft).toBeNull()
    w2.unmount()

    const w3 = await open({ kind: 'event' })
    await new Promise((r) => setTimeout(r, 0))
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(ui.createDraft).toBeNull()
    w3.unmount()
  })
})
