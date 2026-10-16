import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import CollectionList from '@/components/sidebar/CollectionList.vue'
import { MY_TASKS, PERSONAL, WORK } from '@/stores/__tests__/fakeClient'

describe('CollectionList', () => {
  it('renders checkboxes colored by the collection and emits toggles', async () => {
    const hidden = new Set([PERSONAL.url])
    const wrapper = mount(CollectionList, {
      props: {
        title: 'My calendars',
        collections: [WORK, PERSONAL],
        isVisible: (u: string) => !hidden.has(u),
      },
    })
    expect(wrapper.text()).toContain('My calendars')
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect((boxes[0]!.element as HTMLInputElement).checked).toBe(true)
    expect((boxes[1]!.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.findAll('span.grid')[0]!.attributes('style')).toContain('--cb-color: #225688')
    ;(boxes[1]!.element as HTMLInputElement).checked = true
    await boxes[1]!.trigger('change')
    expect(wrapper.emitted('toggle')![0]).toEqual([PERSONAL.url, true])
  })

  it('shows loading and empty states', () => {
    expect(
      mount(CollectionList, {
        props: { title: 'x', collections: [], isVisible: () => true, loading: true },
      }).text(),
    ).toContain('Loading')
    expect(
      mount(CollectionList, {
        props: { title: 'x', collections: [], isVisible: () => true },
      }).text(),
    ).toContain('None')
    expect(
      mount(CollectionList, {
        props: { title: 'Task lists', collections: [MY_TASKS], isVisible: () => true },
      }).text(),
    ).toContain('My tasks')
  })
})
