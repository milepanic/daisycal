/**
 * One-off entrance animations with the Web Animations API, for elements that stay mounted
 * (the calendar sliding on prev / next, the page on Calendar ↔ Tasks) where a Vue
 * <Transition> would need a remount. Skipped with prefers-reduced-motion and where the API
 * is missing (jsdom in tests).
 */

export function prefersReducedMotion(): boolean {
  return (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const EASE_OUT = 'cubic-bezier(0.2, 0.7, 0.3, 1)'

/** Fades `el` in from `dx` / `dy` pixels away. */
export function slideIn(el: Element | null | undefined, dx = 0, dy = 0, duration = 220): void {
  if (!el || typeof (el as HTMLElement).animate !== 'function' || prefersReducedMotion()) return
  ;(el as HTMLElement).animate(
    [
      { opacity: 0.35, transform: `translate(${dx}px, ${dy}px)` },
      { opacity: 1, transform: 'none' },
    ],
    { duration, easing: EASE_OUT },
  )
}
