import { type Ref, onBeforeUnmount, onMounted } from 'vue'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keeps Tab / Shift+Tab inside `container` while it is mounted and returns focus to the
 * previously focused element on unmount (dialogs and popovers).
 */
export function useFocusTrap(container: Ref<HTMLElement | null>) {
  let previous: HTMLElement | null = null

  function focusables(): HTMLElement[] {
    if (!container.value) return []
    // Only attribute-hidden elements are excluded: there is no layout info in jsdom, and
    // `focusFirst` skips anything the browser refuses to focus anyway.
    return [...container.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hidden && !el.closest('[hidden], [aria-hidden="true"]'),
    )
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !container.value) return
    const items = focusables()
    if (items.length === 0) return
    const active = document.activeElement as HTMLElement | null
    const index = active ? items.indexOf(active) : -1
    if (index === -1) {
      e.preventDefault()
      focusFirst(items)
    } else if (e.shiftKey && index === 0) {
      e.preventDefault()
      focusFirst([...items].reverse())
    } else if (!e.shiftKey && index === items.length - 1) {
      e.preventDefault()
      focusFirst(items)
    }
  }

  /** Focuses the first element that accepts focus (some may be hidden without layout info). */
  function focusFirst(items: HTMLElement[]) {
    for (const el of items) {
      el.focus()
      if (document.activeElement === el) return
    }
  }

  onMounted(() => {
    previous = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', onKeydown)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown)
    if (previous && document.contains(previous)) previous.focus()
  })
}
