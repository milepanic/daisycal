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
