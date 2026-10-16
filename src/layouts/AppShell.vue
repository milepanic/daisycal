<script setup lang="ts">
/**
 * Authenticated layout: sidebar + page column. Loads collections once and starts the ctag
 * sync loop; both are torn down by the stores themselves on logout.
 */
import { onMounted, watch } from 'vue'
import { RouterView, useRouter } from 'vue-router'

import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useAuthStore } from '@/stores/auth'
import { useCalendarsStore } from '@/stores/calendars'
import { useSyncStore } from '@/stores/sync'
import { useUiStore } from '@/stores/ui'
import CreatePopup from '@/components/create/CreatePopup.vue'
import AppSidebar from '@/components/sidebar/AppSidebar.vue'

const auth = useAuthStore()
const calendars = useCalendarsStore()
const sync = useSyncStore()
const ui = useUiStore()
const router = useRouter()

useKeyboardShortcuts()

onMounted(async () => {
  if (!auth.isAuthenticated) return
  try {
    await calendars.load()
  } catch {
    /* shown in the sidebar */
  }
  if (auth.isAuthenticated) sync.start()
})

watch(
  () => auth.isAuthenticated,
  (ok) => {
    if (!ok) {
      const redirect = router.currentRoute.value.fullPath
      void router.replace({ name: 'login', query: redirect !== '/' ? { redirect } : {} })
    }
  },
)
</script>

<template>
  <div class="flex h-screen gap-x-2 px-2 pb-2">
    <AppSidebar v-show="ui.sidebarOpen" />
    <div class="flex min-w-0 flex-1 flex-col">
      <RouterView />
    </div>
    <CreatePopup v-if="ui.createDraft" :key="ui.createDraft.edit?.objectUrl ?? 'new'" />
  </div>
</template>
