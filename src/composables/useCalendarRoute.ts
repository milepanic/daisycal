/**
 * The URL is the source of truth for the calendar view and anchor date. This composable keeps
 * the ui store in step with the route and offers navigation helpers that push new routes.
 */
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { type CalendarView, parseDateKey, stepDate } from '@/lib/dates'
import { calendarPath } from '@/router'
import { useUiStore } from '@/stores/ui'

export function useCalendarRoute() {
  const route = useRoute()
  const router = useRouter()
  const ui = useUiStore()

  const routeView = computed(() =>
    route.name === 'calendar' ? (route.params.view as CalendarView) : null,
  )
  const routeDate = computed(() =>
    route.name === 'calendar' ? parseDateKey(route.params.date as string | undefined) : null,
  )

  const routeDays = computed(() =>
    route.name === 'calendar' && route.params.days ? Number(route.params.days) : null,
  )

  watch(
    [routeView, routeDate, routeDays],
    ([view, date, days]) => {
      if (view === 'custom' && days) ui.setCustomDays(days)
      if (view) ui.setView(view)
      if (date) ui.setDate(date)
    },
    { immediate: true },
  )

  function go(view: CalendarView, date: Date) {
    return router.push(calendarPath(view, date, ui.customDays))
  }
  /** Shows `days` days from `start` (mini calendar drag); one day is the day view. */
  function goCustom(start: Date, days: number) {
    return days === 1
      ? router.push(calendarPath('day', start))
      : router.push(calendarPath('custom', start, days))
  }
  function setView(view: CalendarView) {
    return go(view, ui.currentDate)
  }
  function setDate(date: Date) {
    return go(ui.view, date)
  }
  function today() {
    return go(ui.view, new Date())
  }
  function next() {
    return go(ui.view, stepDate(ui.view, ui.currentDate, 1, ui.customDays))
  }
  function prev() {
    return go(ui.view, stepDate(ui.view, ui.currentDate, -1, ui.customDays))
  }

  return { routeView, routeDate, go, goCustom, setView, setDate, today, next, prev }
}
