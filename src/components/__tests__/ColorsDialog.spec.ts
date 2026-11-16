import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import ColorsDialog from '@/components/shell/ColorsDialog.vue'
import { BIRTHDAYS_COLOR, BIRTHDAYS_URL } from '@/lib/birthdays'
import { useAuthStore } from '@/stores/auth'
import { useBirthdaysStore } from '@/stores/birthdays'
import { useHistoryStore } from '@/stores/history'
import { useUiStore } from '@/stores/ui'
import { useCalendarsStore } from '@/stores/calendars'
import { FakeClient, MY_TASKS, PERSONAL, SERVER, WORK } from '@/stores/__tests__/fakeClient'

let client: FakeClient
const original = document.elementFromPoint

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  client = new FakeClient()
  useAuthStore()._setClient(client)
  await useCalendarsStore().load()
})
afterEach(() => {
  document.elementFromPoint = original
})

const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true })

describe('ColorsDialog', () => {
  it('swaps two colors by dragging one chip onto another, then applies', async () => {
    const wrapper = mount(ColorsDialog, { attachTo: document.body })
    const preview = (name: string) =>
      wrapper.findAll('[data-testid="color-preview"]').find((p) => p.text() === name)!
    const work = useCalendarsStore().colorFor(WORK.url)
    const personal = useCalendarsStore().colorFor(PERSONAL.url)

    // Hovering Personal's row while dragging Work's chip.
    const personalRow = wrapper.find(`[data-color-row="${PERSONAL.url}"]`).element as HTMLElement
    document.elementFromPoint = () => personalRow.firstElementChild
    preview('Work').element.dispatchEvent(pointer('pointerdown', 10, 10))
    window.dispatchEvent(pointer('pointermove', 10, 60))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="color-drag-ghost"]').text()).toBe('Work')
    // Previewed swapped while hovering.
    expect(preview('Work').attributes('style')).toContain(`--chip-color: ${personal}`)
    window.dispatchEvent(pointer('pointerup', 10, 60))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="color-drag-ghost"]').exists()).toBe(false)
    expect(preview('Work').attributes('style')).toContain(`--chip-color: ${personal}`)
    expect(preview('Personal').attributes('style')).toContain(`--chip-color: ${work}`)
    expect(wrapper.text()).toContain('2 changes')

    await wrapper.find('[data-testid="colors-apply"]').trigger('click')
    await new Promise((r) => setTimeout(r))
    expect(client.collections.find((c) => c.url === WORK.url)!.color).toBe(personal)
    expect(client.collections.find((c) => c.url === PERSONAL.url)!.color).toBe(work)
    expect(client.collections.find((c) => c.url === MY_TASKS.url)!.color).toBe(
      useCalendarsStore().colorFor(MY_TASKS.url),
    )
    wrapper.unmount()
  })

  it('a press without moving opens that row’s colors', async () => {
    const wrapper = mount(ColorsDialog, { attachTo: document.body })
    const chip = wrapper.findAll('[data-testid="color-preview"]')[0]!
    chip.element.dispatchEvent(pointer('pointerdown', 10, 10))
    window.dispatchEvent(pointer('pointerup', 10, 10))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-testid="color-choice"]').length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('colors Contact birthdays too (kept locally), and leaves it out when turned off', async () => {
    client.vcards.set(`${SERVER}daisy/contacts/`, [
      'BEGIN:VCARD\r\nVERSION:3.0\r\nUID:a\r\nFN:Ana\r\nBDAY:1990-03-15\r\nEND:VCARD\r\n',
    ])
    await useBirthdaysStore().load()
    const wrapper = mount(ColorsDialog, { attachTo: document.body })
    const row = () => wrapper.find(`[data-color-row="${BIRTHDAYS_URL}"]`)
    expect(row().exists()).toBe(true)
    // The first theme hands it a color like any calendar.
    await wrapper.findAll('[data-testid="palette"]')[1]!.trigger('click')
    await wrapper.find('[data-testid="colors-apply"]').trigger('click')
    await new Promise((r) => setTimeout(r))
    const ui = useUiStore()
    expect(ui.birthdaysColor).not.toBeNull()
    expect(useBirthdaysStore().color).toBe(ui.birthdaysColor)
    expect(client.setCollectionColor).toHaveBeenCalled()
    // One undo puts back both the server colors and the birthdays color.
    await useHistoryStore().undo()
    expect(useBirthdaysStore().color).toBe(BIRTHDAYS_COLOR)
    expect(useCalendarsStore().colorFor(WORK.url)).toBe('#225688')
    wrapper.unmount()

    ui.contactBirthdays = false
    expect(useBirthdaysStore().collection).toBeNull()
    const again = mount(ColorsDialog, { attachTo: document.body })
    expect(again.find(`[data-color-row="${BIRTHDAYS_URL}"]`).exists()).toBe(false)
    again.unmount()
  })
})
