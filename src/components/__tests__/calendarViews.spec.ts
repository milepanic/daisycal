import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { expandEvent, parseEventObject, parseTask } from '@/api/ical'
import AgendaView from '@/components/calendar/AgendaView.vue'
import EventPopover from '@/components/calendar/EventPopover.vue'
import MonthView from '@/components/calendar/MonthView.vue'
import TasksPanel from '@/components/calendar/TasksPanel.vue'
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
      wrapper.findAll('[data-testid="time-grid"] .sticky span.text-sm').map((s) => s.text()),
    ).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    // All-day bar spans Thu+Fri.
    const bar = wrapper.find('[data-testid="allday-row"] [style*="grid-column: 4 / span 2"]')
    expect(bar.text()).toBe('Offsite')
    // Wednesday 10:00 local (08:00Z in Belgrade DST) → top 600px; review 90 min → 90px.
    const wed = wrapper.find('[data-day="2026-10-14"]')
    const chips = wed.findAll('.absolute.z-10')
    const review = chips.find((c) => c.text().includes('Design review'))!
    expect(review.attributes('style')).toContain('top: 600px')
    expect(review.attributes('style')).toContain('height: 90px')
    expect(review.attributes('style')).toContain('width: calc(50% - 4px)')
    const standup = chips.find((c) => c.text().includes('Daily Standup'))!
    expect(standup.attributes('style')).toContain('height: 16px')
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
      height: 1440,
      bottom: 1440,
      right: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    await col.trigger('click', { clientY: 635 })
    const [start, end, allDay] = wrapper.emitted('createAt')![0]!
    expect(start).toEqual(new Date(2026, 9, 13, 10, 30))
    expect(end).toEqual(new Date(2026, 9, 13, 11, 30))
    expect(allDay).toBe(false)
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
})

describe('MonthView', () => {
  it('renders 42 cells with chips and the +N more link', async () => {
    const { instances, tasks } = seeded()
    const range = { start: new Date(2026, 8, 28), end: new Date(2026, 10, 9) }
    // A fourth Wednesday item pushes the cell over the 3-row limit.
    const extra = {
      ...instances.find((i) => i.summary === 'Gym')!,
      objectUrl: 'https://x/extra.ics',
      start: new Date(2026, 9, 14, 15),
      end: new Date(2026, 9, 14, 16),
    }
    const wrapper = mount(MonthView, {
      props: { range, month: 9, instances: [...instances, extra], tasks, colorFor },
    })
    expect(wrapper.findAll('[data-date]')).toHaveLength(42)
    const wed = wrapper.find('[data-date="2026-10-14"]')
    expect(wed.text()).toContain('Design review')
    expect(wed.text()).toContain('Daily Standup')
    expect(wed.text()).not.toContain('Prepare slides')
    expect(wed.text()).toContain('+2 more')
    expect(wrapper.find('[data-date="2026-10-15"]').text()).toContain('Offsite')
    expect(wrapper.find('[data-date="2026-10-01"]').text()).toContain('Oct')
    expect(wrapper.find('[data-date="2026-09-28"]').classes()).toContain('bg-gray-50/60')
    await wed.find('button.text-gray-500').trigger('click')
    expect(wrapper.emitted('showMore')![0]![0]).toEqual(new Date(2026, 9, 14))
    await wrapper.find('[data-date="2026-10-20"]').trigger('click')
    expect(wrapper.emitted('createAt')![0]!.slice(0, 3)).toEqual([
      new Date(2026, 9, 20),
      new Date(2026, 9, 21),
      true,
    ])
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
    expect(empty.text()).toContain('Nothing scheduled')
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
    await wrapper.find('button.text-accent').trigger('click')
    expect(useUiStore().createDraft).toMatchObject({ kind: 'task', collectionUrl: MY_TASKS.url })
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
    await wrapper.find('button.bg-gray-900').trigger('click') // Edit
    expect(useUiStore().createDraft).toMatchObject({
      kind: 'event',
      edit: { objectUrl: instance.objectUrl },
    })
    await wrapper.find('button.text-red-600').trigger('click') // Delete
    expect(wrapper.text()).toContain('Delete this event?')
    await wrapper.find('button.bg-red-600').trigger('click')
    await flushPromises()
    expect(client.objects.has(instance.objectUrl)).toBe(false)
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })
})
