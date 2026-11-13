import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import ThemeToggle from '@/components/shell/ThemeToggle.vue'
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
    return () => h(ThemeToggle)
  },
})

describe('dark mode', () => {
  it('cycles System → Light → Dark, sets the class on <html> and remembers the choice', async () => {
    const wrapper = mount(Host)
    const html = document.documentElement
    const button = () => wrapper.find('[data-testid="theme-toggle"]')
    expect(useUiStore().theme).toBe('system')
    expect(html.classList.contains('dark')).toBe(false)
    await button().trigger('click')
    expect(useUiStore().theme).toBe('light')
    await button().trigger('click')
    await nextTick()
    expect(useUiStore().theme).toBe('dark')
    expect(html.classList.contains('dark')).toBe(true)
    expect(JSON.parse(localStorage.getItem('daisycal.layout')!).theme).toBe('dark')
    await button().trigger('click')
    await nextTick()
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
