import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { parseTask } from '@/api/ical'
import TaskChip from '@/components/calendar/TaskChip.vue'
import { MY_TASKS, todoIcs } from '@/stores/__tests__/fakeClient'
import { DARK_TEXT, LIGHT_TEXT, contrastRatio, relativeLuminance, textOn } from '../color'

describe('chip text color by contrast', () => {
  it('computes WCAG luminance and contrast', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBe(1)
    expect(relativeLuminance('#fff')).toBe(1)
    expect(relativeLuminance('nope')).toBeNull()
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21)
  })

  it('picks white on dark and medium colors, near-black on light ones', () => {
    // The app's default calendar colors and Apple's: white while it keeps 3:1…
    const white = ['#2a4d88', '#225688', '#566c86', '#7c3aed', '#e30000', '#ff2d55', '#ff3b30']
    for (const c of [...white, '#007aff', '#af52de', '#a2845e'])
      expect([c, textOn(c)]).toEqual([c, LIGHT_TEXT])
    // …near-black on light colors where white would be hard to read.
    for (const c of ['#ffcc00', '#a3e635', '#34c759', '#5ac8fa', '#f4f4f5', '#ff9500'])
      expect([c, textOn(c)]).toEqual([c, DARK_TEXT])
    // Unknown formats keep the old white text.
    expect(textOn('rebeccapurple')).toBe(LIGHT_TEXT)
  })

  it('task chips in the grid draw text and ring in the picked color', () => {
    const task = parseTask({
      url: `${MY_TASKS.url}t.ics`,
      collectionUrl: MY_TASKS.url,
      etag: '"1"',
      data: todoIcs('t', 'Buy lemons', 'DUE:20261014T100000Z\r\n'),
    })
    // jsdom drops CSS variables from style, so check that the chip reads them.
    const chip = mount(TaskChip, { props: { task, color: '#ffcc00', showTime: true } })
    expect(chip.find('span.truncate').classes()).toContain('text-(--chip-fg)')
    expect(chip.find('[data-testid="task-dot"]').classes()).toContain('border-(--chip-fg)/90')
  })
})
