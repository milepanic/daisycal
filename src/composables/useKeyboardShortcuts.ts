/** Global shortcuts: t today · ← → navigate · d/w/m/a views · c create · Esc close · Ctrl/Cmd+Z undo. */
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import type { CalendarView } from '@/lib/dates'
import { useHistoryStore } from '@/stores/history'
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
  const history = useHistoryStore()

  function onKey(e: KeyboardEvent) {
    // Search from anywhere.
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      ui.searchOpen = true
      return
    }
    // Undo the last change; inside a text field Ctrl+Z stays the field's own undo.
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
      if (isTyping(e.target) || ui.isCreateOpen || !history.canUndo()) return
      e.preventDefault()
      void history.undo()
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'Escape') {
      if (ui.searchOpen) ui.searchOpen = false
      else if (ui.isCreateOpen) ui.closeCreate()
      else if (ui.selection) ui.select(null)
      return
    }
    if (isTyping(e.target)) return
    const onCalendar = router.currentRoute.value.name === 'calendar'
    switch (e.key) {
      case '/':
        e.preventDefault()
        ui.searchOpen = true
        break
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
