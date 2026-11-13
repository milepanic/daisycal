<script setup lang="ts">
/**
 * Cycles the color scheme: System → Light → Dark. Where the browser has View Transitions, the
 * new scheme spreads out as a circle from the button (skipped with reduced motion).
 */
import { computed, nextTick } from 'vue'

import { prefersReducedMotion } from '@/lib/motion'
import { type Theme, useUiStore } from '@/stores/ui'
import IconButton from '@/components/ui/IconButton.vue'

const ui = useUiStore()
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const ICON: Record<Theme, string> = { system: 'computer', light: 'sun', dark: 'moon' }
const NAME: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const label = computed(() => `Theme: ${NAME[ui.theme]} (switch to ${NAME[NEXT[ui.theme]]})`)

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => Promise<void>) => { ready: Promise<void> }
}

function cycle(e: MouseEvent) {
  const next = NEXT[ui.theme]
  const doc = document as ViewTransitionDoc
  const wasDark = document.documentElement.classList.contains('dark')
  if (!doc.startViewTransition || prefersReducedMotion()) {
    ui.theme = next
    return
  }
  const transition = doc.startViewTransition(async () => {
    ui.theme = next
    // useTheme's watcher sets the `dark` class before the next tick resolves.
    await nextTick()
  })
  // Same scheme as before (e.g. Light → System on a light OS): nothing to reveal.
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  void transition.ready.then(() => {
    if (document.documentElement.classList.contains('dark') === wasDark) return
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 500, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
    )
  })
}
</script>

<template>
  <IconButton :icon="ICON[ui.theme]" :label="label" data-testid="theme-toggle" @click="cycle" />
</template>
