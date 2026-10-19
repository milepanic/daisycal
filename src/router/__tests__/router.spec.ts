import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import router, { calendarPath } from '@/router'
import { useAuthStore } from '@/stores/auth'
import { FakeClient } from '@/stores/__tests__/fakeClient'

vi.mock('@/layouts/AppShell.vue', () => ({ default: { template: '<router-view />' } }))
vi.mock('@/views/CalendarView.vue', () => ({ default: { template: '<p>calendar</p>' } }))
vi.mock('@/views/TasksView.vue', () => ({ default: { template: '<p>tasks</p>' } }))

beforeEach(() => {
  setActivePinia(createPinia())
  sessionStorage.clear()
  localStorage.clear()
})

describe('router', () => {
  it('connects through the proxy once before the first navigation', async () => {
    const auth = useAuthStore()
    const connect = vi.spyOn(auth, 'connect').mockImplementation(async () => {
      auth._setClient(new FakeClient())
      return true
    })
    await router.push('/month/2026-10-01')
    await router.push('/tasks')
    expect(connect).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('tasks')
  })

  it('still routes when the connection fails (the shell shows the error screen)', async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, 'connect').mockImplementation(async () => {
      auth.status = 'error'
      return false
    })
    await router.push('/month/2026-10-01')
    expect(router.currentRoute.value.name).toBe('calendar')
    expect(auth.isAuthenticated).toBe(false)
  })

  it('lets authenticated users through and normalises a missing date', async () => {
    useAuthStore()._setClient(new FakeClient())
    await router.push('/week')
    expect(router.currentRoute.value.name).toBe('calendar')
    expect(router.currentRoute.value.params.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await router.push('/day/nonsense')
    expect(router.currentRoute.value.params.view).toBe('day')
    expect(router.currentRoute.value.params.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await router.push('/')
    expect(router.currentRoute.value.params.view).toBe('week')
    await router.push('/tasks')
    expect(router.currentRoute.value.name).toBe('tasks')
  })

  it('builds canonical calendar paths', () => {
    expect(calendarPath('month', new Date(2026, 9, 5))).toBe('/month/2026-10-05')
  })
})
