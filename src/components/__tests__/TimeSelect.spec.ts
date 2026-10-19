import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import EventChip from '@/components/calendar/EventChip.vue'
import TimeSelect from '@/components/ui/TimeSelect.vue'

describe('TimeSelect', () => {
  it('offers 24h times in 15-minute steps, keeps off-grid values and emits changes', async () => {
    const wrapper = mount(TimeSelect, { props: { modelValue: '10:20', label: 'Start time' } })
    const options = wrapper.findAll('option').map((o) => o.text())
    expect(options).toHaveLength(97)
    expect(options[0]).toBe('00:00')
    expect(options).toContain('13:45')
    expect(options).toContain('23:45')
    expect(options).toContain('10:20')
    expect(options.some((o) => /AM|PM/i.test(o))).toBe(false)
    expect((wrapper.element as HTMLSelectElement).value).toBe('10:20')
    await wrapper.setValue('17:00')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['17:00'])
  })
})

describe('EventChip', () => {
  it('top-aligns the title of timed chips', () => {
    const instance = {
      uid: 'u',
      objectUrl: 'o',
      collectionUrl: 'c',
      etag: '"e"',
      summary: 'Design review',
      description: '',
      location: '',
      start: new Date(2026, 9, 14, 10),
      end: new Date(2026, 9, 14, 11, 30),
      allDay: false,
      tzid: null,
      recurrenceId: null,
      isException: false,
      isRecurring: false,
      repeat: null,
      alarm: null,
      status: null,
    }
    const wrapper = mount(EventChip, { props: { instance, color: '#225688', variant: 'timed' } })
    expect(wrapper.classes()).toContain('flex-col')
    expect(wrapper.classes()).toContain('justify-start')
    expect(wrapper.text()).toContain('10:00')
  })
})
