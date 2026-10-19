/** Mounts the real router + layout with a fake client: login → calendar → navigation → tasks → logout. */
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'
import router from '@/router'
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

const mounted: ReturnType<typeof mount>[] = []
afterEach(() => {
  // Earlier apps keep reacting to router changes otherwise and leak into later tests.
  for (const w of mounted.splice(0)) w.unmount()
})

async function mountApp(path: string) {
  await router.push(path)
  // Attached so pointer events reach the window listeners the drag code uses.
  const wrapper = mount(App, {
    global: { plugins: [router], stubs: { teleport: true } },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('app shell', () => {
  it('connects on start and shows a retryable error screen when the proxy credentials are rejected', async () => {
    const auth = useAuthStore()
    let attempts = 0
    vi.spyOn(auth, 'connect').mockImplementation(async () => {
      attempts++
      if (attempts === 1) {
        auth.status = 'error'
        auth.error = new (await import('@/stores/auth')).ConnectError(
          'credentials',
          'The calendar server rejected the configured credentials',
        )
        return false
      }
      auth._setClient(client)
      return true
    })
    const wrapper = await mountApp('/week/2026-10-12')
    expect(wrapper.find('[data-testid="connect-screen"]').text()).toContain(
      'rejected the configured credentials',
    )
    expect(wrapper.find('[data-testid="connect-screen"]').text()).toContain('RADICALE_USER')
    await wrapper.find('[data-testid="connect-screen"] button').trigger('click')
    await routeIs(() => expect(wrapper.find('h1').text()).toBe('October 12 – 18, 2026'))
    expect(wrapper.find('[data-testid="connect-screen"]').exists()).toBe(false)
    expect(wrapper.find('aside#sidebar').text()).toContain('Work')
  })

  it('loads collections and events, navigates and toggles panels', async () => {
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

  it('saves a task dragged to a new time in the grid', async () => {
    useAuthStore()._setClient(client)
    const wrapper = await mountApp('/week/2026-10-12')
    await flushPromises()
    const cols = wrapper.findAll('[data-day]')
    cols.forEach((c, i) => {
      c.element.getBoundingClientRect = () => ({
        top: 0,
        left: i * 100,
        width: 100,
        height: 1440,
        bottom: 1440,
        right: (i + 1) * 100,
        x: i * 100,
        y: 0,
        toJSON: () => ({}),
      })
    })
    const chip = wrapper.find('[data-task-chip]') // "Send invoice", due Thu 2026-10-15 17:00
    const fire = (type: string, init: PointerEventInit) =>
      chip.element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerType: 'mouse',
          ...init,
        }),
      )
    fire('pointerdown', { clientX: 350, clientY: 1025 })
    fire('pointermove', { clientX: 350, clientY: 1145 })
    fire('pointerup', { clientX: 350, clientY: 1145 })
    await flushPromises()
    const saved = client.objects.get(`${MY_TASKS.url}a.ics`)!.data
    expect(saved).toContain('DUE;TZID=Europe/Belgrade:20261015T190000')
    expect(wrapper.find('[data-testid="toasts"]').text()).toBe('')
  })

  it('drops to the error screen when the server starts rejecting the proxy credentials', async () => {
    useAuthStore()._setClient(client)
    const wrapper = await mountApp('/day/2026-10-14')
    client.listCollections.mockRejectedValueOnce(
      new (await import('@/api/errors')).UnauthorizedError('u'),
    )
    useAuthStore().disconnect('unauthorized')
    useAuthStore().status = 'error'
    await flushPromises()
    expect(wrapper.find('[data-testid="connect-screen"]').exists()).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/day/2026-10-14')
  })
})
