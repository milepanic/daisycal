import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import SettingsMenu from '@/components/shell/SettingsMenu.vue'
import { useTheme } from '@/composables/useTheme'
import { useUiStore } from '@/stores/ui'

let systemDark = false
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  systemDark = false
  window.matchMedia = ((q: string) => ({
    matches: q.includes('prefers-color-scheme: dark') && systemDark,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  delete (window as Partial<Window>).matchMedia
  document.documentElement.classList.remove('dark')
})

const Host = defineComponent({
  setup() {
    useTheme()
    return () => h(SettingsMenu)
  },
})

/** Opens the settings card and clicks the option with this text in a setting group. */
async function pick(wrapper: ReturnType<typeof mount>, group: string, label: string) {
  if (!wrapper.find('[data-testid="settings-menu"]').exists())
    await wrapper.find('[data-testid="settings-button"]').trigger('click')
  const button = wrapper
    .find(`[data-testid="${group}"]`)
    .findAll('button')
    .find((b) => b.text() === label)!
  await button.trigger('click')
  await nextTick()
}

describe('dark mode', () => {
  it('switches System / Light / Dark from the settings, sets the class on <html> and remembers it', async () => {
    const wrapper = mount(Host)
    const html = document.documentElement
    expect(useUiStore().theme).toBe('system')
    expect(html.classList.contains('dark')).toBe(false)
    await pick(wrapper, 'setting-theme', 'Light')
    expect(useUiStore().theme).toBe('light')
    await pick(wrapper, 'setting-theme', 'Dark')
    expect(useUiStore().theme).toBe('dark')
    expect(html.classList.contains('dark')).toBe(true)
    expect(JSON.parse(localStorage.getItem('daisycal.layout')!).theme).toBe('dark')
    await pick(wrapper, 'setting-theme', 'System')
    expect(html.classList.contains('dark')).toBe(false)
    wrapper.unmount()
  })

  it('follows the system setting on System', async () => {
    systemDark = true
    const wrapper = mount(Host)
    await nextTick()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    useUiStore().theme = 'light'
    await nextTick()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    wrapper.unmount()
  })
})

describe('settings', () => {
  it('switches the event style, the first day of the week and completed tasks', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    const ui = useUiStore()
    const html = document.documentElement
    await pick(wrapper, 'setting-style', 'Tinted')
    expect(html.classList.contains('chips-tinted')).toBe(true)
    expect(JSON.parse(localStorage.getItem('daisycal.layout')!).chipStyle).toBe('tinted')
    await pick(wrapper, 'setting-style', 'Solid')
    expect(html.classList.contains('chips-tinted')).toBe(false)
    await pick(wrapper, 'setting-week', 'Sunday')
    expect(ui.weekStart).toBe(0)
    expect(ui.showCompletedTasks).toBe(true)
    await wrapper.find('[data-testid="setting-completed"]').trigger('click')
    expect(ui.showCompletedTasks).toBe(false)
    expect(ui.miniDots).toBe(true)
    await wrapper.find('[data-testid="setting-dots"]').trigger('click')
    expect(ui.miniDots).toBe(false)
    expect(JSON.parse(localStorage.getItem('daisycal.layout')!).miniDots).toBe(false)
    // Escape closes the card.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('[data-testid="settings-menu"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
