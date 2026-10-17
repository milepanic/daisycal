<script setup lang="ts">
/**
 * Authenticated layout: sidebar + page column. Loads collections once and starts the ctag
 * sync loop; both are torn down by the stores themselves on logout. On narrow screens the
 * sidebar is a drawer over the page and the tasks panel starts closed.
 */
import { onMounted, watch } from 'vue'
import { RouterView, useRouter } from 'vue-router'

import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { NARROW_QUERY, useMediaQuery } from '@/composables/useMediaQuery'
import { useAuthStore } from '@/stores/auth'
import { useCalendarsStore } from '@/stores/calendars'
import { useNotificationsStore } from '@/stores/notifications'
import { useSyncStore } from '@/stores/sync'
import { useUiStore } from '@/stores/ui'
import CreatePopup from '@/components/create/CreatePopup.vue'
import AppSidebar from '@/components/sidebar/AppSidebar.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import ToastStack from '@/components/ui/ToastStack.vue'

const auth = useAuthStore()
const calendars = useCalendarsStore()
const sync = useSyncStore()
const ui = useUiStore()
const notifications = useNotificationsStore()
const router = useRouter()
const narrow = useMediaQuery(NARROW_QUERY)

useKeyboardShortcuts()

onMounted(async () => {
  if (narrow.value) {
    ui.sidebarOpen = false
    ui.tasksPanelOpen = false
  }
  if (!auth.isAuthenticated) return
  try {
    await calendars.load()
  } catch (err) {
    notifications.reportError(err, 'Could not load calendars', () => calendars.load())
  }
  if (auth.isAuthenticated) sync.start()
})

// A failed poll means the server is unreachable; a successful one clears the banner.
watch(
  () => sync.lastError,
  (err) => notifications.setOffline(Boolean(err)),
)

// Close the drawer after navigating on narrow screens.
watch(
  () => router.currentRoute.value.fullPath,
  () => {
    if (narrow.value) ui.sidebarOpen = false
  },
)

watch(
  () => auth.isAuthenticated,
  (ok) => {
    if (!ok) {
      notifications.clear()
      const redirect = router.currentRoute.value.fullPath
      void router.replace({ name: 'login', query: redirect !== '/' ? { redirect } : {} })
    }
  },
)

async function retrySync() {
  await sync.syncNow()
  if (!sync.lastError) {
    notifications.setOffline(false)
    await calendars.load().catch(() => undefined)
  }
}
</script>

<template>
  <div class="flex h-screen flex-col px-2 pb-2">
    <div
      v-if="notifications.offline"
      role="status"
      class="mt-2 flex items-center gap-x-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900"
      data-testid="offline-banner"
    >
      <AppIcon name="warning" class="size-4 shrink-0" />
      <span class="min-w-0 flex-1"
        >Can't reach the calendar server. Changes will fail until it is back.</span
      >
      <button
        type="button"
        class="rounded-lg bg-white/70 px-2 py-1 text-xs font-semibold hover:bg-white"
        @click="retrySync"
      >
        Retry
      </button>
    </div>

    <div class="flex min-h-0 flex-1 gap-x-2">
      <!-- Drawer backdrop on narrow screens -->
      <div
        v-if="narrow && ui.sidebarOpen"
        class="fixed inset-0 z-20 bg-gray-900/30"
        data-testid="drawer-backdrop"
        @click="ui.sidebarOpen = false"
      ></div>
      <AppSidebar
        v-show="ui.sidebarOpen"
        :class="narrow ? 'fixed inset-y-0 left-0 z-30 h-full bg-zinc-100 px-2 shadow-xl' : ''"
      />
      <div class="flex min-w-0 flex-1 flex-col">
        <RouterView />
      </div>
    </div>

    <CreatePopup v-if="ui.createDraft" :key="ui.createDraft.edit?.objectUrl ?? 'new'" />
    <ToastStack />
  </div>
</template>
