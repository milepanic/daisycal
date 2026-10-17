/** Mounts the real router + layout with a fake client: login → calendar → navigation → tasks → logout. */
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'
import router, { _resetRouterGuardState } from '@/router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import {
  FakeClient,
  MY_TASKS,
  PERSONAL,
  WORK,
  eventIcs,
  todoIcs,
} from '@/stores/__tests__/fakeClient'

let client: FakeClient

beforeEach(() => {
  const pinia = createPinia()
  setActivePinia(pinia)
  localStorage.clear()
  sessionStorage.clear()
  _resetRouterGuardState()
  client = new FakeClient()
  client.seed(
    WORK,
    'review',
    eventIcs('review', 'Design review', '20261014T120000Z', '20261014T130000Z'),
  )
  client.seed(PERSONAL, 'gym', eventIcs('gym', 'Gym', '20261013T060000Z', '20261013T070000Z'))
  client.seed(MY_TASKS, 'a', todoIcs('a', 'Send invoice', 'DUE:20261015T150000Z\r\n'))
})

/** Waits for lazy route components to load and the route to settle. */
async function routeIs(check: () => void) {
  await vi.waitFor(check, { timeout: 2000 })
  await flushPromises()
}

async function mountApp(path: string) {
  await router.push(path)
  const wrapper = mount(App, { global: { plugins: [router], stubs: { teleport: true } } })
  await flushPromises()
  return wrapper
}

describe('app shell', () => {
  it('shows the login page and signs in', async () => {
    const wrapper = await mountApp('/week/2026-10-12')
    expect(wrapper.find('form').exists()).toBe(true)
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockImplementation(async () => auth._setClient(client))
    await wrapper.find('input[name="username"]').setValue('daisy')
    await wrapper.find('input[name="password"]').setValue('daisy')
    await wrapper.find('form').trigger('submit')
    await routeIs(() => expect(router.currentRoute.value.fullPath).toBe('/week/2026-10-12'))
    expect(wrapper.find('h1').text()).toBe('October 12 – 18, 2026')
  })

  it('loads collections and events, navigates, toggles panels and logs out', async () => {
    useAuthStore()._setClient(client)
    const wrapper = await mountApp('/week/2026-10-12')
    await flushPromises()
    expect(wrapper.find('aside#sidebar').text()).toContain('Work')
    expect(wrapper.find('aside#sidebar').text()).toContain('My tasks')
    expect(wrapper.find('[data-testid="time-grid"]').text()).toContain('Design review')
    expect(wrapper.find('[data-testid="time-grid"]').text()).toContain('Gym')
    expect(wrapper.find('#tasks-panel').text()).toContain('Send invoice')

    // Hide Personal in the sidebar → Gym disappears without a refetch.
    const fetches = client.fetchEvents.mock.calls.length
    const personalBox = wrapper
      .findAll('aside#sidebar input[type="checkbox"]')
      .find((b) => b.element.parentElement?.parentElement?.textContent?.includes('Personal'))!
    ;(personalBox.element as HTMLInputElement).checked = false
    await personalBox.trigger('change')
    expect(wrapper.find('[data-testid="time-grid"]').text()).not.toContain('Gym')
    expect(client.fetchEvents).toHaveBeenCalledTimes(fetches)

    // Next week via the toolbar updates the URL and title.
    await wrapper.find('button[class*="w-8"]:last-of-type').trigger('click') // "Next week" is the second w-8 button
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/week/2026-10-19')
    expect(wrapper.find('h1').text()).toBe('October 19 – 25, 2026')

    // View switcher → month, Today, mini calendar pick.
    await wrapper.find('[role="tab"][aria-selected="false"]').trigger('click') // Agenda
    await flushPromises()
    expect(router.currentRoute.value.params.view).toBe('agenda')
    expect(wrapper.find('h1').text()).toBe('October 2026')
    expect(wrapper.find('[data-testid="agenda-view"]').text()).toContain('Design review')
    await wrapper.find('time[datetime="2026-10-07"]').element.parentElement!.click()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/agenda/2026-10-07')

    // Panels.
    const ui = useUiStore()
    await wrapper.find('button[title="Show tasks panel"]').trigger('click')
    expect(ui.tasksPanelOpen).toBe(false)
    expect(wrapper.find('#tasks-panel').isVisible()).toBe(false)
    await wrapper.find('button[title="Menu"]').trigger('click')
    expect(ui.sidebarOpen).toBe(false)
    expect(wrapper.find('aside#sidebar').isVisible()).toBe(false)
    await wrapper.find('button[title="Menu"]').trigger('click')

    // Tasks tab.
    await wrapper.find('a[href="/tasks"]').trigger('click')
    await routeIs(() => expect(router.currentRoute.value.name).toBe('tasks'))
    expect(wrapper.find('main').text()).toContain('Send invoice')

    // Keyboard: "c" opens the create popup (task on the tasks page), Esc closes it.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    expect(ui.createDraft?.kind).toBe('task')
    await flushPromises()
    expect(wrapper.find('[data-testid="create-popup"]').attributes('aria-label')).toBe('New task')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(ui.createDraft).toBeNull()

    // Logout returns to login with a redirect back.
    await wrapper.find('button[title="Log out"]').trigger('click')
    await routeIs(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(router.currentRoute.value.query.redirect).toBe('/tasks')
  })

  it('shows the offline banner when polling fails and clears it after a successful retry', async () => {
    useAuthStore()._setClient(client)
    const wrapper = await mountApp('/week/2026-10-12')
    const { useSyncStore } = await import('@/stores/sync')
    const { useNotificationsStore } = await import('@/stores/notifications')
    const sync = useSyncStore()
    sync.lastError = 'offline'
    await flushPromises()
    expect(wrapper.find('[data-testid="offline-banner"]').exists()).toBe(true)
    sync.lastError = null
    await flushPromises()
    expect(wrapper.find('[data-testid="offline-banner"]').exists()).toBe(false)

    // A failed task toggle shows a toast with Retry; the retry succeeds.
    client.failNext = { op: 'update', error: new (await import('@/api/errors')).NetworkError('x') }
    const box = wrapper.find('input[aria-label="Mark as completed: Send invoice"]')
    ;(box.element as HTMLInputElement).checked = true
    await box.trigger('change')
    await flushPromises()
    expect(useNotificationsStore().offline).toBe(true)
    expect(wrapper.find('[data-testid="toasts"]').text()).toContain(
      'Could not update "Send invoice"',
    )
    await wrapper.find('[data-testid="toasts"] button').trigger('click')
    await flushPromises()
    expect(client.objects.get(`${MY_TASKS.url}a.ics`)!.data).toContain('STATUS:COMPLETED')
    expect(useNotificationsStore().offline).toBe(false)
    expect(wrapper.find('[data-testid="toasts"]').text()).toBe('')
  })

  it('uses a drawer sidebar and the day view by default on narrow screens', async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: q.includes('767'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
      onchange: null,
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    try {
      useAuthStore()._setClient(client)
      const wrapper = await mountApp('/')
      await routeIs(() => expect(router.currentRoute.value.params.view).toBe('day'))
      const ui = useUiStore()
      expect(ui.sidebarOpen).toBe(false)
      expect(ui.tasksPanelOpen).toBe(false)
      await wrapper.find('button[title="Menu"]').trigger('click')
      expect(wrapper.find('[data-testid="drawer-backdrop"]').exists()).toBe(true)
      expect(wrapper.find('aside#sidebar').classes()).toContain('fixed')
      await wrapper.find('[data-testid="drawer-backdrop"]').trigger('click')
      expect(ui.sidebarOpen).toBe(false)
      expect(wrapper.find('#view-select').exists()).toBe(true)
    } finally {
      window.matchMedia = original
    }
  })

  it('redirects to login when the session expires', async () => {
    useAuthStore()._setClient(client)
    await mountApp('/day/2026-10-14')
    useAuthStore().logout('expired')
    await routeIs(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(router.currentRoute.value.query.redirect).toBe('/day/2026-10-14')
  })
})
