<script setup lang="ts">
/**
 * Authenticated layout: sidebar + page column. Loads collections once and starts the ctag
 * sync loop; both are torn down by the stores themselves on logout. On narrow screens the
 * sidebar is a drawer over the page and the tasks panel starts closed.
 */
import { computed, onMounted, watch } from 'vue'
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

// The banner shows while the ctag poll fails or a write hit a NetworkError.
const offline = computed(() => notifications.offline || Boolean(sync.lastError))

// Close the drawer after navigating on narrow screens.
watch(
  () => router.currentRoute.value.fullPath,
  () => {
    if (narrow.value) ui.sidebarOpen = false
  },
)

watch(
  () => auth.isAuthenticated,
  async (ok) => {
    if (!ok) notifications.clear()
    else {
      await calendars
        .load()
        .catch((err) =>
          notifications.reportError(err, 'Could not load calendars', () => calendars.load()),
        )
      sync.start()
    }
  },
)

async function reconnect() {
  if (await auth.connect()) await router.replace(router.currentRoute.value.fullPath)
}

async function retrySync() {
  await sync.syncNow()
  if (!sync.lastError) {
    notifications.setOffline(false)
    await calendars.load().catch(() => undefined)
  }
}
</script>

<template>
  <main
    v-if="!auth.isAuthenticated"
    class="flex min-h-screen items-center justify-center p-4"
    data-testid="connect-screen"
  >
    <div class="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
      <span
        class="mx-auto flex size-10 items-center justify-center rounded-xl bg-accent text-white"
      >
        <AppIcon name="calendar" class="size-6" />
      </span>
      <h1 class="mt-4 text-lg font-semibold text-gray-900">DaisyCal</h1>
      <template v-if="auth.status === 'error'">
        <p class="mt-2 text-sm text-red-700" role="alert">{{ auth.error?.message }}</p>
        <p v-if="auth.error?.kind === 'credentials'" class="mt-1 text-xs text-gray-500">
          Check RADICALE_USER / RADICALE_PASSWORD on the daisycal.home container.
        </p>
        <button
          type="button"
          class="mt-5 h-10 w-full rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-700"
          @click="reconnect"
        >
          Retry
        </button>
      </template>
      <p v-else class="mt-2 text-sm text-gray-500">Connecting to the calendar server…</p>
    </div>
  </main>
  <div v-else class="flex h-screen flex-col px-2 pb-2">
    <div
      v-if="offline"
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
      <Transition :name="narrow ? 'slide' : 'fade'">
        <AppSidebar
          v-show="ui.sidebarOpen"
          :class="narrow ? 'fixed inset-y-0 left-0 z-30 h-full bg-zinc-100 px-2 shadow-xl' : ''"
        />
      </Transition>
      <div class="flex min-w-0 flex-1 flex-col">
        <RouterView />
      </div>
    </div>

    <Transition name="pop">
      <CreatePopup v-if="ui.createDraft" :key="ui.createDraft.edit?.objectUrl ?? 'new'" />
    </Transition>
    <ToastStack />
  </div>
</template>
