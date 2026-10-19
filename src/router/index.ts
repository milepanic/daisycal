import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'

import { type CalendarView, parseDateKey, toDateKey } from '@/lib/dates'
import { isNarrowScreen } from '@/composables/useMediaQuery'
import { useAuthStore } from '@/stores/auth'

export const CALENDAR_VIEWS: CalendarView[] = ['day', 'work-week', 'week', 'month', 'agenda']

export function calendarPath(view: CalendarView, date: Date): string {
  return `/${view}/${toDateKey(date)}`
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
          path: ':view(day|work-week|week|month|agenda)/:date?',
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
    return calendarPath(to.params.view as CalendarView, new Date())
  }
  return true
})

export default router
