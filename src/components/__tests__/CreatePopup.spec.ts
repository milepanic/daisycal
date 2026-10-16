import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import CreatePopup from '@/components/create/CreatePopup.vue'
import TimeGrid from '@/components/calendar/TimeGrid.vue'
import { eachDay } from '@/lib/dates'
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

async function open(draft: Parameters<ReturnType<typeof useUiStore>['openCreate']>[0]) {
  useUiStore().openCreate(draft)
  const wrapper = mount(CreatePopup, { attachTo: document.body })
  await flushPromises()
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
    expect((wrapper.find('#event-calendar').element as HTMLSelectElement).value).toBe(WORK.url)

    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').text()).toBe('Add a title')

    await wrapper.find('#create-name').setValue('Coffee')
    await wrapper.find('[aria-label="End time"]').setValue('09:00')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').text()).toBe('End must be after the start')

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
    expect(grid.find('[data-testid="draft-chip"]').attributes('style')).toContain('top: 600px')

    await wrapper.find('[aria-label="End time"]').setValue('11:30')
    await wrapper.find('#event-location').setValue('Cafe')
    await wrapper.find('#event-repeat').setValue('weekdays')
    await wrapper
      .find('button.text-gray-600.hover\\:bg-gray-100.hover\\:text-gray-900.inline-flex')
      .trigger('click') // Add notification
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

  it('creates an all-day task via the type switcher', async () => {
    const wrapper = await open({
      kind: 'event',
      start: new Date(2026, 9, 13, 10),
      end: new Date(2026, 9, 13, 11),
    })
    await wrapper.find('input[type="radio"][value="task"]').setValue()
    expect(wrapper.find('#task-list').exists()).toBe(true)
    expect((wrapper.find('#task-list').element as HTMLSelectElement).value).toBe(MY_TASKS.url)
    await wrapper.find('#create-name').setValue('Call plumber')
    await wrapper.find('button[class*="text-gray-400"][class*="size-8"]').trigger('click') // Remove time
    await wrapper.find('#task-priority').setValue('high')
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
    await w2.find('#event-calendar').setValue(PERSONAL.url)
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
    expect((wrapper.find('[aria-label="Due time"]').element as HTMLInputElement).value).toBe(
      '17:00',
    )
    await wrapper.find('#create-name').setValue('Buy oat milk')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(tasks.get(milk.objectUrl)?.summary).toBe('Buy oat milk')
    wrapper.unmount()

    const w2 = await open({ kind: 'task', edit: { objectUrl: milk.objectUrl, recurrenceId: null } })
    await w2.find('button.text-red-600').trigger('click')
    expect(w2.find('[data-testid="confirm-delete"]').text()).toContain('Delete this task?')
    await w2.find('button.bg-red-600').trigger('click')
    await flushPromises()
    expect(client.objects.has(milk.objectUrl)).toBe(false)
    w2.unmount()

    const events = useEventsStore()
    const mon = events.instancesFor(WEEK).find((i) => i.summary === 'Standup')!
    const w3 = await open({
      kind: 'event',
      edit: { objectUrl: mon.objectUrl, recurrenceId: mon.recurrenceId!.toString() },
    })
    await w3.find('button.text-red-600').trigger('click')
    expect(w3.find('[data-testid="confirm-delete"]').text()).toContain('repeating')
    await w3.find('button.bg-red-600').trigger('click') // All occurrences
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
