import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Task } from '@/api/ical'
import TaskChip from '@/components/calendar/TaskChip.vue'
import { useTasksStore } from '@/stores/tasks'

vi.mock('@/lib/sounds', () => ({ playCompleteSound: vi.fn<() => void>() }))

const task = {
  uid: 't1',
  objectUrl: 'https://x/t1.ics',
  collectionUrl: 'https://x/',
  summary: 'Call',
  completed: false,
  due: new Date(2026, 10, 13, 15, 30),
  dueAllDay: false,
} as unknown as Task

beforeEach(() => setActivePinia(createPinia()))

describe('TaskChip', () => {
  it('completes the task only from the checkbox; the rest of the chip selects it', async () => {
    const tasks = useTasksStore()
    const setCompleted = vi.spyOn(tasks, 'setCompleted').mockResolvedValue(task)
    const wrapper = mount(TaskChip, { props: { task, color: '#7c3aed', showTime: true } })

    await wrapper.find('[data-testid="chip-checkbox"]').trigger('click')
    expect(setCompleted).toHaveBeenCalledWith(task, true)
    expect(wrapper.emitted('select')).toBeUndefined()

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(setCompleted).toHaveBeenCalledTimes(1)
  })
})
