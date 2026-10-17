import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { expandEvent } from '@/api/ical'
import CreatePopup from '@/components/create/CreatePopup.vue'
import TimeGrid from '@/components/calendar/TimeGrid.vue'
import ToastStack from '@/components/ui/ToastStack.vue'
import { eachDay } from '@/lib/dates'
import { useAuthStore } from '@/stores/auth'
import { useCalendarsStore } from '@/stores/calendars'
import { useEventsStore } from '@/stores/events'
import { useNotificationsStore } from '@/stores/notifications'
import { useUiStore } from '@/stores/ui'
import { FakeClient, WORK, eventIcs } from '@/stores/__tests__/fakeClient'

const WEEK = { start: new Date(2026, 9, 12), end: new Date(2026, 9, 19) }

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  const client = new FakeClient()
  client.seed(WORK, 'a', eventIcs('a', 'Monday 9', '20261012T070000Z', '20261012T080000Z'))
  client.seed(WORK, 'b', eventIcs('b', 'Monday 14', '20261012T120000Z', '20261012T130000Z'))
  client.seed(WORK, 'c', eventIcs('c', 'Tuesday 13', '20261013T110000Z', '20261013T120000Z'))
  useAuthStore()._setClient(client)
  await useCalendarsStore().load()
  await useEventsStore().ensureLoaded(WEEK)
})

describe('keyboard navigation in the time grid', () => {
  it('moves between chips with arrows and creates from a focused column', async () => {
    const events = useEventsStore()
    const docs = [...events.docs.values()]
    const instances = docs.flatMap((d) => expandEvent(d, WEEK.start, WEEK.end))
    const wrapper = mount(TimeGrid, {
      props: { days: eachDay(WEEK), instances, tasks: [], colorFor: () => '#225688' },
      attachTo: document.body,
    })
    const chip = (title: string) => wrapper.find(`button[title="${title}"]`)
    ;(chip('Monday 9').element as HTMLElement).focus()
    await chip('Monday 9').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('title')).toBe('Monday 14')
    await chip('Monday 14').trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement?.getAttribute('title')).toBe('Tuesday 13')
    await chip('Tuesday 13').trigger('keydown', { key: 'ArrowRight' })
    // Wednesday has no chips: the column itself takes focus and Enter creates at 09:00.
    const wed = wrapper.find('[data-day="2026-10-14"]')
    expect(document.activeElement).toBe(wed.element)
    expect(wed.attributes('role')).toBe('gridcell')
    await wed.trigger('keydown', { key: 'Enter' })
    const [start] = wrapper.emitted('createAt')![0]!
    expect(start).toEqual(new Date(2026, 9, 14, 9))
    wrapper.unmount()
  })
})

describe('focus management in the create popup', () => {
  it('focuses the title, traps Tab and restores focus on close', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    useUiStore().openCreate({ kind: 'event' })
    const wrapper = mount(CreatePopup, { attachTo: document.body })
    await flushPromises()
    expect(document.activeElement?.id).toBe('create-name')
    const focusables = wrapper.findAll('button, input, select, textarea')
    const last = focusables[focusables.length - 1]!.element as HTMLElement
    last.focus()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    expect(wrapper.element.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(last)
    wrapper.unmount()
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })
})

describe('ToastStack', () => {
  it('renders toasts, retries and dismisses', async () => {
    const n = useNotificationsStore()
    let attempts = 0
    n.reportError(new Error('boom'), 'Could not save', async () => {
      attempts++
      if (attempts === 1) throw new Error('still failing')
    })
    const wrapper = mount(ToastStack)
    expect(wrapper.find('[role="alert"]').text()).toContain('Could not save: boom')
    await wrapper.find('button').trigger('click') // Retry (fails once)
    await flushPromises()
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    await wrapper.find('button').trigger('click') // Retry (succeeds)
    await flushPromises()
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
    n.push('info', { kind: 'info', timeout: 0 })
    await flushPromises()
    await wrapper.find('button').trigger('click') // Dismiss
    expect(n.hasToasts).toBe(false)
  })
})
