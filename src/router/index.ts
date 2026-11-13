import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'

import { type CalendarView, MAX_CUSTOM_DAYS, parseDateKey, toDateKey } from '@/lib/dates'
import { isNarrowScreen } from '@/composables/useMediaQuery'
import { useAuthStore } from '@/stores/auth'

export const CALENDAR_VIEWS: CalendarView[] = [
  'day',
  'work-week',
  'week',
  'month',
  'agenda',
  'custom',
]

/** "/week/2026-11-13"; a custom view also carries its length: "/custom/2026-11-03/15". */
export function calendarPath(view: CalendarView, date: Date, days?: number): string {
  return view === 'custom'
    ? `/custom/${toDateKey(date)}/${days ?? 7}`
    : `/${view}/${toDateKey(date)}`
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/AppShell.vue'),
      children: [
        // Phones get the day view by default; wider screens the week.
        { path: '', redirect: () => calendarPath(isNarrowScreen() ? 'day' : 'week', new Date()) },
        {
          path: ':view(day|work-week|week|month|agenda|custom)/:date?/:days(\\d+)?',
          name: 'calendar',
          component: () => import('@/views/CalendarView.vue'),
        },
        { path: 'tasks', name: 'tasks', component: () => import('@/views/TasksView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to: RouteLocationNormalized) => {
  const auth = useAuthStore()
  // Connect through the proxy once; the shell shows an error screen (with Retry) if it fails.
  if (auth.status === 'idle') await auth.connect()
  // Normalise a missing or invalid calendar date to today so the URL is always canonical.
  // (A global guard, because per-route beforeEnter does not run on param-only changes.)
  if (to.name === 'calendar' && !parseDateKey(to.params.date as string | undefined)) {
    return calendarPath(to.params.view as CalendarView, new Date(), Number(to.params.days) || 7)
  }
  // A custom view needs a length between 1 and MAX_CUSTOM_DAYS.
  if (to.name === 'calendar' && to.params.view === 'custom') {
    const days = Number(to.params.days)
    if (!Number.isInteger(days) || days < 1 || days > MAX_CUSTOM_DAYS)
      return calendarPath(
        'custom',
        parseDateKey(to.params.date as string)!,
        Math.min(Math.max(Math.round(days) || 7, 1), MAX_CUSTOM_DAYS),
      )
  }
  return true
})

export default router
