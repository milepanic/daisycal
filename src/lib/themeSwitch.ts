/**
 * Changes the color scheme with a circle spreading out from `origin` (View Transitions,
 * skipped with reduced motion or where the browser has none).
 */
import { nextTick } from 'vue'

import { prefersReducedMotion } from './motion'

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => Promise<void>) => { ready: Promise<void> }
}

export function switchTheme(apply: () => void, origin: HTMLElement | null): void {
  const doc = document as ViewTransitionDoc
  const wasDark = document.documentElement.classList.contains('dark')
  if (!doc.startViewTransition || prefersReducedMotion() || !origin) {
    apply()
    return
  }
  const transition = doc.startViewTransition(async () => {
    apply()
    // useTheme's watcher sets the `dark` class before the next tick resolves.
    await nextTick()
  })
  const r = origin.getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  void transition.ready.then(() => {
    // Same scheme as before (e.g. Light → System on a light OS): nothing to reveal.
    if (document.documentElement.classList.contains('dark') === wasDark) return
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      {
        duration: 500,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)',
      },
    )
  })
}
