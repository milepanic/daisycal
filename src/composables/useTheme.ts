/**
 * Applies the color scheme: `dark` on <html> when the setting is dark, or 'system' and the OS
 * prefers dark. Follows OS changes live. (index.html sets the class before the app loads, so
 * there is no light flash.)
 */
import { computed, watchEffect } from 'vue'

import { useUiStore } from '@/stores/ui'
import { useMediaQuery } from './useMediaQuery'

export const DARK_QUERY = '(prefers-color-scheme: dark)'

export function useTheme() {
  const ui = useUiStore()
  const systemDark = useMediaQuery(DARK_QUERY)
  const dark = computed(() => ui.theme === 'dark' || (ui.theme === 'system' && systemDark.value))
  watchEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('dark', dark.value)
    document.documentElement.classList.toggle('chips-tinted', ui.chipStyle === 'tinted')
  })
  return { dark }
}
