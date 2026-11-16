import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import CollectionList from '@/components/sidebar/CollectionList.vue'
import { MY_TASKS, PERSONAL, WORK } from '@/stores/__tests__/fakeClient'

describe('CollectionList', () => {
  it('renders color dots as switches and emits toggles', async () => {
    const hidden = new Set([PERSONAL.url])
    const wrapper = mount(CollectionList, {
      props: {
        title: 'My calendars',
        collections: [WORK, PERSONAL],
        isVisible: (u: string) => !hidden.has(u),
      },
    })
    expect(wrapper.text()).toContain('My calendars')
    const rows = wrapper.findAll('[data-testid="collection-toggle"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.attributes('aria-checked')).toBe('true')
    expect(rows[1]!.attributes('aria-checked')).toBe('false')
    expect(wrapper.find('li').attributes('style')).toContain('--dot: #225688')
    expect(wrapper.findAll('[data-testid="collection-dot"]')[1]!.classes()).toContain(
      'bg-transparent',
    )
    await rows[1]!.trigger('click')
    expect(wrapper.emitted('toggle')![0]).toEqual([PERSONAL.url, true])
  })

  it('shows only one collection, and all again from the only one', async () => {
    const visible = new Set([WORK.url, PERSONAL.url])
    const props = {
      title: 'Calendars',
      collections: [WORK, PERSONAL],
      isVisible: (u: string) => visible.has(u),
    }
    const wrapper = mount(CollectionList, { props })
    const only = () => wrapper.findAll('[data-testid="collection-only"]')
    expect(only()[0]!.text()).toBe('Only')
    await only()[0]!.trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([[PERSONAL.url, false]])
    visible.delete(PERSONAL.url)
    await wrapper.setProps({ isVisible: (u: string) => visible.has(u) })
    expect(only()[0]!.text()).toBe('All')
    await only()[0]!.trigger('click')
    expect(wrapper.emitted('toggle')![1]).toEqual([PERSONAL.url, true])
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
