import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import EventChip from '@/components/calendar/EventChip.vue'
import TimeInput from '@/components/ui/TimeInput.vue'
import { dateShortcuts, formatDuration, parseTime } from '@/lib/timeInput'

describe('parseTime / formatDuration / dateShortcuts', () => {
  it('reads loosely typed 24h and am/pm times', () => {
    const cases: Record<string, string | null> = {
      '14:30': '14:30',
      '14.30': '14:30',
      '1430': '14:30',
      '930': '09:30',
      '9': '09:00',
      '14h': '14:00',
      '2pm': '14:00',
      '2:30 PM': '14:30',
      '12am': '00:00',
      '12pm': '12:00',
      '24:00': null,
      '9:75': null,
      '13pm': null,
      abc: null,
      '': null,
    }
    for (const [text, want] of Object.entries(cases))
      expect([text, parseTime(text)]).toEqual([text, want])
  })

  it('formats durations', () => {
    expect([0, 45, 60, 90, 135, 1425].map(formatDuration)).toEqual([
      '0 mins',
      '45 mins',
      '1 hr',
      '1.5 hrs',
      '2.25 hrs',
      '23.75 hrs',
    ])
  })

  it('picks today, tomorrow, the coming weekend and next week', () => {
    const keys = (d: Date) => dateShortcuts(d).map((s) => s.date.getDate())
    // Wed Nov 11 2026 → 11, 12, Sat 14, Mon 16.
    expect(keys(new Date(2026, 10, 11, 15))).toEqual([11, 12, 14, 16])
    // On a Sunday "this weekend" is today.
    expect(keys(new Date(2026, 10, 15))).toEqual([15, 16, 15, 16])
  })
})

describe('TimeInput', () => {
  it('lists 15-minute steps, keeps off-grid values and commits typed or picked times', async () => {
    const wrapper = mount(TimeInput, { props: { modelValue: '10:20', label: 'Start time' } })
    const input = wrapper.find('input')
    await input.trigger('focus')
    const options = wrapper.findAll('[role="option"]').map((o) => o.text())
    expect(options).toHaveLength(97)
    expect(options[0]).toBe('00:00')
    expect(options).toContain('10:20')
    expect(options.some((o) => /AM|PM/i.test(o))).toBe(false)
    // The list opens on the current value.
    expect(input.attributes('aria-activedescendant')).toMatch(/-42$/)

    await input.setValue('7pm')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['19:00'])

    // Nonsense is dropped on blur.
    await wrapper.setProps({ modelValue: '19:00' })
    await input.setValue('later')
    await input.trigger('blur')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect((input.element as HTMLInputElement).value).toBe('19:00')

    // Arrows walk the list, Escape restores the value.
    await input.trigger('focus')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect((input.element as HTMLInputElement).value).toBe('19:15')
    await input.trigger('keydown', { key: 'Escape' })
    expect((input.element as HTMLInputElement).value).toBe('19:00')
    expect(wrapper.find('[role="listbox"]').isVisible()).toBe(false)

    await input.trigger('focus')
    await wrapper.findAll('[role="option"]')[4]!.trigger('mousedown')
    expect(wrapper.emitted('update:modelValue')![1]).toEqual(['01:00'])
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
      travel: null,
      status: null,
    }
    const wrapper = mount(EventChip, { props: { instance, color: '#225688', variant: 'timed' } })
    expect(wrapper.classes()).toContain('flex-col')
    expect(wrapper.classes()).toContain('justify-start')
    expect(wrapper.text()).toContain('10:00')
  })
})
