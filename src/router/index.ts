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
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
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

let restoreAttempted = false

router.beforeEach(async (to: RouteLocationNormalized) => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated && !restoreAttempted) {
    restoreAttempted = true
    await auth.restore()
  }
  if (to.meta.public) {
    return auth.isAuthenticated ? (to.query.redirect as string) || '/' : true
  }
  if (!auth.isAuthenticated) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }
  // Normalise a missing or invalid calendar date to today so the URL is always canonical.
  // (A global guard, because per-route beforeEnter does not run on param-only changes.)
  if (to.name === 'calendar' && !parseDateKey(to.params.date as string | undefined)) {
    return calendarPath(to.params.view as CalendarView, new Date())
  }
  return true
})

/** Test hook: forget that a restore was tried. */
export function _resetRouterGuardState() {
  restoreAttempted = false
}

export default router
