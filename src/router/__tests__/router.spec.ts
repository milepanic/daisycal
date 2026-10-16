import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import router, { _resetRouterGuardState, calendarPath } from '@/router'
import { useAuthStore } from '@/stores/auth'
import { FakeClient } from '@/stores/__tests__/fakeClient'

vi.mock('@/views/LoginView.vue', () => ({ default: { template: '<p>login</p>' } }))
vi.mock('@/layouts/AppShell.vue', () => ({ default: { template: '<router-view />' } }))
vi.mock('@/views/CalendarView.vue', () => ({ default: { template: '<p>calendar</p>' } }))
vi.mock('@/views/TasksView.vue', () => ({ default: { template: '<p>tasks</p>' } }))

beforeEach(() => {
  setActivePinia(createPinia())
  sessionStorage.clear()
  localStorage.clear()
  _resetRouterGuardState()
})

describe('router', () => {
  it('redirects anonymous users to /login with the target in the query', async () => {
    await router.push('/month/2026-10-01')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/month/2026-10-01')
  })

  it('tries to restore a stored session once', async () => {
    const auth = useAuthStore()
    const restore = vi.spyOn(auth, 'restore').mockResolvedValue(false)
    await router.push('/tasks')
    await router.push('/week/2026-10-12')
    expect(restore).toHaveBeenCalledTimes(1)
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

  it('sends authenticated users away from /login', async () => {
    useAuthStore()._setClient(new FakeClient())
    await router.push({ name: 'login', query: { redirect: '/tasks' } })
    expect(router.currentRoute.value.name).toBe('tasks')
  })

  it('builds canonical calendar paths', () => {
    expect(calendarPath('month', new Date(2026, 9, 5))).toBe('/month/2026-10-05')
  })
})
