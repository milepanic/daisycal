import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseTask } from '@/api/ical'
import TaskRow from '@/components/tasks/TaskRow.vue'
import { MY_TASKS, todoIcs } from '@/stores/__tests__/fakeClient'

vi.mock('@/lib/sounds', () => ({ playCompleteSound: vi.fn<() => void>() }))
import { playCompleteSound } from '@/lib/sounds'

const task = parseTask({
  url: `${MY_TASKS.url}t.ics`,
  collectionUrl: MY_TASKS.url,
  etag: '"1"',
  data: todoIcs('t', 'Water plants'),
})

function mountRow() {
  return mount(TaskRow, { props: { task, color: '#2a4d88' } })
}
async function check(wrapper: ReturnType<typeof mountRow>, value: boolean) {
  const box = wrapper.find('input[type="checkbox"]')
  ;(box.element as HTMLInputElement).checked = value
  await box.trigger('change')
}

describe('TaskRow completion', () => {
  let reduce = false
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(playCompleteSound).mockClear()
    reduce = false
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduced-motion') && reduce,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (window as Partial<Window>).matchMedia
  })

  it('plays a sound and a burst, then reports the completion', async () => {
    const wrapper = mountRow()
    await check(wrapper, true)
    expect(playCompleteSound).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.task-spark')).toHaveLength(6)
    expect(wrapper.find('p').classes()).toContain('line-through')
    expect(wrapper.emitted('toggle')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(600)
    expect(wrapper.emitted('toggle')).toEqual([[task, true]])
    expect(wrapper.find('.task-spark').exists()).toBe(false)
  })

  it('unticking during the animation cancels it', async () => {
    const wrapper = mountRow()
    await check(wrapper, true)
    await check(wrapper, false)
    await vi.advanceTimersByTimeAsync(600)
    expect(wrapper.emitted('toggle')).toBeUndefined()
    expect(wrapper.find('.task-spark').exists()).toBe(false)
  })

  it('saves right away when unmounted mid-animation or with reduced motion', async () => {
    const onToggle = vi.fn<(t: unknown, done: boolean) => void>()
    const wrapper = mount(TaskRow, { props: { task, color: '#2a4d88', onToggle } })
    await check(wrapper as never, true)
    wrapper.unmount()
    expect(onToggle).toHaveBeenCalledWith(task, true)

    reduce = true
    const calm = mountRow()
    await check(calm, true)
    expect(calm.emitted('toggle')).toEqual([[task, true]])
    expect(calm.find('.task-spark').exists()).toBe(false)
    expect(playCompleteSound).toHaveBeenCalledTimes(2)
  })
})
