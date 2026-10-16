import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useUiStore } from '../ui'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('ui store', () => {
  it('navigates by view and computes the visible range', () => {
    const ui = useUiStore()
    ui.setDate(new Date(2026, 9, 16, 15, 30))
    expect(ui.currentDate).toEqual(new Date(2026, 9, 16))
    expect(ui.view).toBe('week')
    expect(ui.visibleRange).toEqual({ start: new Date(2026, 9, 12), end: new Date(2026, 9, 19) })
    ui.next()
    expect(ui.currentDate).toEqual(new Date(2026, 9, 23))
    ui.setView('month')
    ui.prev()
    expect(ui.currentDate).toEqual(new Date(2026, 8, 23))
    expect(ui.visibleRange.start).toEqual(new Date(2026, 7, 31))
    expect(ui.visibleRange.end).toEqual(new Date(2026, 9, 12))
    ui.setView('work-week')
    ui.setDate(new Date(2026, 9, 18)) // Sunday
    expect(ui.visibleRange).toEqual({ start: new Date(2026, 9, 12), end: new Date(2026, 9, 17) })
    ui.today()
    expect(ui.currentDate.getHours()).toBe(0)
  })

  it('persists layout choices and restores them', () => {
    const ui = useUiStore()
    ui.toggleSidebar()
    ui.toggleTasksPanel()
    ui.setView('agenda')
    ui.showCompletedTasks = false
    return Promise.resolve().then(() => {
      setActivePinia(createPinia())
      const again = useUiStore()
      expect(again.sidebarOpen).toBe(false)
      expect(again.tasksPanelOpen).toBe(false)
      expect(again.view).toBe('agenda')
      expect(again.showCompletedTasks).toBe(false)
    })
  })

  it('create popup and selection are mutually exclusive', () => {
    const ui = useUiStore()
    ui.select({ objectUrl: 'x', recurrenceId: null })
    ui.openCreate({ kind: 'task' })
    expect(ui.isCreateOpen).toBe(true)
    expect(ui.selection).toBeNull()
    ui.select({ objectUrl: 'y', recurrenceId: '2026-10-16T09:00:00' })
    expect(ui.createDraft).toBeNull()
    expect(ui.selection?.objectUrl).toBe('y')
    ui.closeCreate()
    ui.select(null)
    expect(ui.selection).toBeNull()
  })
})
