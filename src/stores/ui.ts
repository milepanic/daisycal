/** Navigation and layout state: current date, active view, panels, create popup, selection. */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import {
  type CalendarView,
  type DateRange,
  type WeekStart,
  rangeForView,
  startOfDay,
  stepDate,
} from '@/lib/dates'
import { readJson, writeJson } from '@/lib/storage'

const LAYOUT_KEY = 'daisycal.layout'

interface Layout {
  sidebarOpen: boolean
  tasksPanelOpen: boolean
  view: CalendarView
  weekStart: WeekStart
  showCompletedTasks: boolean
}

const DEFAULT_LAYOUT: Layout = {
  sidebarOpen: true,
  tasksPanelOpen: true,
  view: 'week',
  weekStart: 1,
  showCompletedTasks: true,
}

export interface CreateDraft {
  kind: 'event' | 'task'
  start?: Date
  end?: Date
  allDay?: boolean
  collectionUrl?: string
  /** Live title while the form is being filled (drives the preview chip in the grid). */
  title?: string
  /** Viewport point the popup is anchored to (the clicked slot). */
  anchor?: Anchor
  /** When set, the popup edits this existing object instead of creating one. */
  edit?: Selection
}

export interface Anchor {
  x: number
  y: number
  width: number
  height: number
}

export interface Selection {
  objectUrl: string
  /** `recurrenceId.toString()` of the occurrence, when the event repeats. */
  recurrenceId: string | null
  /** Viewport rectangle of the clicked chip, for positioning the details popover. */
  anchor?: Anchor
}

export const useUiStore = defineStore('ui', () => {
  const saved = { ...DEFAULT_LAYOUT, ...readJson<Partial<Layout>>('local', LAYOUT_KEY, {}) }

  const currentDate = ref<Date>(startOfDay(new Date()))
  const view = ref<CalendarView>(saved.view)
  const weekStart = ref<WeekStart>(saved.weekStart)
  const sidebarOpen = ref(saved.sidebarOpen)
  const tasksPanelOpen = ref(saved.tasksPanelOpen)
  const showCompletedTasks = ref(saved.showCompletedTasks)
  const createDraft = ref<CreateDraft | null>(null)
  const selection = ref<Selection | null>(null)

  watch([view, weekStart, sidebarOpen, tasksPanelOpen, showCompletedTasks], () =>
    writeJson('local', LAYOUT_KEY, {
      view: view.value,
      weekStart: weekStart.value,
      sidebarOpen: sidebarOpen.value,
      tasksPanelOpen: tasksPanelOpen.value,
      showCompletedTasks: showCompletedTasks.value,
    } satisfies Layout),
  )

  /** Dates the active view shows. */
  const visibleRange = computed<DateRange>(() =>
    rangeForView(view.value, currentDate.value, weekStart.value),
  )
  const isCreateOpen = computed(() => createDraft.value !== null)

  function setDate(date: Date) {
    currentDate.value = startOfDay(date)
  }
  function setView(next: CalendarView) {
    view.value = next
  }
  function today() {
    currentDate.value = startOfDay(new Date())
  }
  function next() {
    currentDate.value = stepDate(view.value, currentDate.value, 1)
  }
  function prev() {
    currentDate.value = stepDate(view.value, currentDate.value, -1)
  }
  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }
  function toggleTasksPanel() {
    tasksPanelOpen.value = !tasksPanelOpen.value
  }
  function openCreate(draft: CreateDraft = { kind: 'event' }) {
    selection.value = null
    createDraft.value = draft
  }
  function closeCreate() {
    createDraft.value = null
  }
  /** Keeps the draft in step with the form so the grid can preview it. */
  function updateDraft(patch: Partial<CreateDraft>) {
    if (createDraft.value) createDraft.value = { ...createDraft.value, ...patch }
  }
  function select(sel: Selection | null) {
    createDraft.value = null
    selection.value = sel
  }

  return {
    currentDate,
    view,
    weekStart,
    sidebarOpen,
    tasksPanelOpen,
    showCompletedTasks,
    createDraft,
    selection,
    visibleRange,
    isCreateOpen,
    setDate,
    setView,
    today,
    next,
    prev,
    toggleSidebar,
    toggleTasksPanel,
    openCreate,
    closeCreate,
    updateDraft,
    select,
  }
})
