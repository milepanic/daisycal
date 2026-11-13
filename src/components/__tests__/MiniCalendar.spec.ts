import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MiniCalendar from '@/components/sidebar/MiniCalendar.vue'

describe('MiniCalendar', () => {
  it('renders a 6-week grid starting on Monday, marks today and emits the picked date', async () => {
    const wrapper = mount(MiniCalendar, { props: { selected: new Date(2026, 9, 9) } })
    expect(wrapper.find('h2').text()).toBe('October 2026')
    const letters = wrapper
      .findAll('.grid.grid-cols-7')[0]!
      .findAll('div')
      .map((d) => d.text())
    expect(letters).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
    const days = wrapper.findAll('time')
    expect(days).toHaveLength(42)
    expect(days[0]!.attributes('datetime')).toBe('2026-09-28')
    expect(days[41]!.attributes('datetime')).toBe('2026-11-08')
    const selected = wrapper.find('[aria-pressed="true"] time')
    expect(selected.attributes('datetime')).toBe('2026-10-09')

    await days[15]!.element.parentElement!.click()
    expect(wrapper.emitted('select')![0]![0]).toEqual(new Date(2026, 9, 13))
  })

  it('navigates months and follows the selected prop', async () => {
    const wrapper = mount(MiniCalendar, { props: { selected: new Date(2026, 9, 9), weekStart: 0 } })
    expect(wrapper.findAll('.grid.grid-cols-7')[0]!.findAll('div')[0]!.text()).toBe('S')
    await wrapper.find('button[class*="p-1"]').trigger('click') // previous month
    expect(wrapper.find('h2').text()).toBe('September 2026')
    await wrapper.setProps({ selected: new Date(2027, 0, 1) })
    expect(wrapper.find('h2').text()).toBe('January 2027')
  })
})

describe('MiniCalendar drag', () => {
  it('picks the days dragged across and shades them while dragging', async () => {
    const wrapper = mount(MiniCalendar, {
      props: { selected: new Date(2026, 10, 13) },
      attachTo: document.body,
    })
    const day = (key: string) => wrapper.find(`time[datetime="${key}"]`).element.parentElement!
    day('2026-11-03').dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, pointerType: 'mouse' }),
    )
    for (const key of ['2026-11-04', '2026-11-10', '2026-11-17'])
      day(key).parentElement!.dispatchEvent(new PointerEvent('pointerenter'))
    await wrapper.vm.$nextTick()
    expect(day('2026-11-10').parentElement!.className).toContain('bg-gray-200')
    expect(day('2026-11-22').parentElement!.className).toContain('bg-gray-200')
    expect(day('2026-11-23').parentElement!.className).not.toContain('bg-gray-200')
    document.dispatchEvent(new PointerEvent('pointerup'))
    // 15 days (Tue Nov 3 – Tue Nov 17) snap to the three whole weeks Mon Nov 2 – Sun Nov 22.
    expect(wrapper.emitted('selectRange')![0]).toEqual([new Date(2026, 10, 2), 21])
    wrapper.unmount()
  })
})

describe('MiniCalendar dots', () => {
  it('draws the calendar colors of a day under its number and reports the weeks shown', () => {
    const wrapper = mount(MiniCalendar, {
      props: {
        selected: new Date(2026, 10, 13),
        dots: (key: string) => (key === '2026-11-10' ? ['#ff0000', '#00ff00'] : []),
      },
    })
    const day = wrapper.find('time[datetime="2026-11-10"]').element.parentElement!
    expect(day.querySelectorAll('[data-testid="day-dots"] span')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="day-dots"]')).toHaveLength(1)
    // November 2026 starting on Monday: Oct 26 – Dec 7.
    expect(wrapper.emitted('visibleRange')![0]![0]).toEqual({
      start: new Date(2026, 9, 26),
      end: new Date(2026, 11, 7),
    })
  })
})
