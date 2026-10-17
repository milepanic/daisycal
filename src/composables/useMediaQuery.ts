import { onBeforeUnmount, ref } from 'vue'

/** Reactive `window.matchMedia` result (false during SSR / tests without matchMedia). */
export function useMediaQuery(query: string) {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  const mql = supported ? window.matchMedia(query) : null
  const matches = ref(mql?.matches ?? false)
  const onChange = (e: MediaQueryListEvent) => (matches.value = e.matches)
  mql?.addEventListener('change', onChange)
  onBeforeUnmount(() => mql?.removeEventListener('change', onChange))
  return matches
}

/** Phones and small tablets: the sidebar becomes a drawer and the tasks panel starts closed. */
export const NARROW_QUERY = '(max-width: 767px)'

export function isNarrowScreen(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function') return window.matchMedia(NARROW_QUERY).matches
  return window.innerWidth < 768
}
