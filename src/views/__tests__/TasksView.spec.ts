import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TasksView from '@/views/TasksView.vue'
import { useAuthStore } from '@/stores/auth'
import { useCalendarsStore } from '@/stores/calendars'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import { FakeClient, MY_TASKS, PERSONAL, todoIcs } from '@/stores/__tests__/fakeClient'

const SHOPPING = {
  ...MY_TASKS,
  url: `${PERSONAL.url.replace('personal', 'shopping')}`,
  displayName: 'Shopping',
  color: '#0ea5e9',
}
let client: FakeClient

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.useFakeTimers({ now: new Date(2026, 9, 14, 12), toFake: ['Date'] })
  client = new FakeClient()
  client.collections = [...client.collections, SHOPPING]
  client.seed(
    MY_TASKS,
    'late',
    todoIcs('late', 'Send invoice', 'DUE:20261005T150000Z\r\nPRIORITY:1\r\n'),
  )
  client.seed(MY_TASKS, 'today', todoIcs('today', 'Prepare slides', 'DUE:20261014T100000Z\r\n'))
  client.seed(
    MY_TASKS,
    'later',
    todoIcs('later', 'Water the plants', 'DUE;VALUE=DATE:20261018\r\n'),
  )
  client.seed(MY_TASKS, 'none', todoIcs('none', 'Plan Q4 goals'))
  client.seed(
    MY_TASKS,
    'done',
    todoIcs('done', 'Book dentist', 'STATUS:COMPLETED\r\nCOMPLETED:20261006T090000Z\r\n'),
  )
  client.seed(SHOPPING, 'ink', todoIcs('ink', 'Order printer ink'))
  useAuthStore()._setClient(client)
  await useCalendarsStore().load()
})

async function mountView() {
  const wrapper = mount(TasksView, {
    global: { stubs: { TasksToolbar: true } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('TasksView', () => {
  it('renders one column per visible list, sorted rows, badges and the completed section', async () => {
    const wrapper = await mountView()
    const columns = wrapper.findAll('section[data-list]')
    expect(columns.map((c) => c.find('h2').text())).toEqual(['My tasks', 'Shopping'])
    const mine = columns[0]!
    const titles = mine.findAll('li[data-task] button span.truncate').map((s) => s.text())
    expect(titles).toEqual([
      'Send invoice',
      'Prepare slides',
      'Water the plants',
      'Plan Q4 goals',
      'Book dentist',
    ])
    expect(mine.find('li[data-task="late"]').text()).toContain('Mon, Oct 5, 17:00')
    expect(mine.find('li[data-task="late"] span.bg-red-50').exists()).toBe(true)
    expect(mine.find('li[data-task="late"] svg.text-red-500').exists()).toBe(true) // high priority flag
    expect(mine.find('li[data-task="today"] span.text-accent').text()).toBe('Today, 12:00')
    expect(mine.find('li[data-task="later"] span.bg-gray-100').text()).toBe('Sun, Oct 18')
    expect(mine.find('details summary').text()).toContain('Completed (1)')
    expect(mine.find('li[data-task="done"]').text()).toContain('Completed Tue, Oct 6')

    useCalendarsStore().setVisible(SHOPPING.url, false)
    await flushPromises()
    expect(wrapper.findAll('section[data-list]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('toggles completion, hides the completed section with the toolbar switch', async () => {
    const wrapper = await mountView()
    const mine = wrapper.find('section[data-list]')
    const box = mine.find('input[aria-label="Mark as completed: Plan Q4 goals"]')
    ;(box.element as HTMLInputElement).checked = true
    await box.trigger('change')
    await flushPromises()
    expect(client.objects.get(`${MY_TASKS.url}none.ics`)!.data).toContain('PERCENT-COMPLETE:100')
    expect(mine.find('details summary').text()).toContain('Completed (2)')

    const undo = mine.find('input[aria-label="Mark as not completed: Book dentist"]')
    ;(undo.element as HTMLInputElement).checked = false
    await undo.trigger('change')
    await flushPromises()
    expect(client.objects.get(`${MY_TASKS.url}done.ics`)!.data).toContain('STATUS:NEEDS-ACTION')
    expect(mine.find('details summary').text()).toContain('Completed (1)')

    useUiStore().showCompletedTasks = false
    await flushPromises()
    expect(mine.find('details').exists()).toBe(false)
    wrapper.unmount()
  })

  it('adds a task inline with Enter, cancels with Esc, opens edit on click', async () => {
    const wrapper = await mountView()
    const shopping = wrapper.findAll('section[data-list]')[1]!
    await shopping.find('button.text-accent').trigger('click')
    const input = shopping.find('input[aria-label="New task title"]')
    expect(input.exists()).toBe(true)
    await input.setValue('Pick up package')
    await shopping.find('form').trigger('submit')
    await flushPromises()
    const created = [...client.objects.values()].find((o) =>
      o.data.includes('SUMMARY:Pick up package'),
    )!
    expect(created.collectionUrl).toBe(SHOPPING.url)
    expect(created.data).not.toContain('DUE')

    // With a date and a 24h time picked inline.
    await shopping.find('input[aria-label="New task title"]').setValue('Return library books')
    await shopping.find('input[aria-label="New task due date"]').setValue('2026-10-20')
    await shopping
      .findAll('button')
      .find((b) => b.text() === 'Add time')!
      .trigger('click')
    await shopping.find('select[aria-label="New task due time"]').setValue('18:30')
    await shopping.find('form').trigger('submit')
    await flushPromises()
    const timed = [...client.objects.values()].find((o) =>
      o.data.includes('SUMMARY:Return library books'),
    )!
    expect(timed.data).toContain('DUE;TZID=Europe/Belgrade:20261020T183000')
    expect(shopping.text()).toContain('Pick up package')
    expect(shopping.find('input[aria-label="New task title"]').exists()).toBe(true) // stays open for the next one

    await shopping.find('input[aria-label="New task title"]').trigger('keydown', { key: 'Escape' })
    expect(shopping.find('input[aria-label="New task title"]').exists()).toBe(false)

    await shopping.find('li[data-task="ink"] button').trigger('click')
    expect(useUiStore().createDraft).toMatchObject({
      kind: 'task',
      edit: { objectUrl: `${SHOPPING.url}ink.ics` },
    })

    await shopping.find('button[title="New task with details"]').trigger('click')
    expect(useUiStore().createDraft).toMatchObject({ kind: 'task', collectionUrl: SHOPPING.url })
    expect(useUiStore().createDraft?.edit).toBeUndefined()
    wrapper.unmount()
  })

  it('shows the empty state when nothing is visible', async () => {
    const calendars = useCalendarsStore()
    calendars.setVisible(MY_TASKS.url, false)
    calendars.setVisible(SHOPPING.url, false)
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('No task lists are visible')
    expect(useTasksStore().all.size).toBeGreaterThan(0)
    wrapper.unmount()
  })
})
