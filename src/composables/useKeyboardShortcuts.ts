/** Global shortcuts: t today · ← → navigate · d/w/m/a views · c create · Esc close. */
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import type { CalendarView } from '@/lib/dates'
import { useUiStore } from '@/stores/ui'
import { useCalendarRoute } from './useCalendarRoute'

const VIEW_KEYS: Record<string, CalendarView> = { d: 'day', w: 'week', m: 'month', a: 'agenda' }

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useKeyboardShortcuts() {
  const ui = useUiStore()
  const router = useRouter()
  const nav = useCalendarRoute()

  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'Escape') {
      if (ui.isCreateOpen) ui.closeCreate()
      else if (ui.selection) ui.select(null)
      return
    }
    if (isTyping(e.target)) return
    const onCalendar = router.currentRoute.value.name === 'calendar'
    switch (e.key) {
      case 't':
        if (onCalendar) void nav.today()
        break
      case 'ArrowLeft':
        if (onCalendar) void nav.prev()
        break
      case 'ArrowRight':
        if (onCalendar) void nav.next()
        break
      case 'c':
        ui.openCreate({ kind: onCalendar ? 'event' : 'task' })
        break
      default: {
        const view = VIEW_KEYS[e.key]
        if (view) void nav.setView(view)
      }
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
