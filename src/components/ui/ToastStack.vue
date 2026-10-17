<script setup lang="ts">
import { ref } from 'vue'

import { type Toast, useNotificationsStore } from '@/stores/notifications'
import AppIcon from './AppIcon.vue'

const notifications = useNotificationsStore()
const retrying = ref<Set<number>>(new Set())

async function retry(toast: Toast) {
  if (!toast.retry) return
  retrying.value = new Set(retrying.value).add(toast.id)
  try {
    await toast.retry()
    notifications.dismiss(toast.id)
  } catch {
    /* the retry reports its own failure */
  } finally {
    const next = new Set(retrying.value)
    next.delete(toast.id)
    retrying.value = next
  }
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-y-2 px-4"
    aria-live="assertive"
    data-testid="toasts"
  >
    <div
      v-for="t in notifications.toasts"
      :key="t.id"
      role="alert"
      class="pointer-events-auto flex w-full max-w-md items-start gap-x-3 rounded-xl px-4 py-3 text-sm shadow-lg ring-1"
      :class="
        t.kind === 'error'
          ? 'bg-red-50 text-red-800 ring-red-200'
          : t.kind === 'success'
            ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
            : 'bg-white text-gray-800 ring-gray-200'
      "
    >
      <AppIcon :name="t.kind === 'error' ? 'warning' : 'check'" class="mt-0.5 size-4 shrink-0" />
      <p class="min-w-0 flex-1">{{ t.message }}</p>
      <button
        v-if="t.retry"
        type="button"
        :disabled="retrying.has(t.id)"
        class="shrink-0 rounded-lg bg-white/70 px-2 py-1 text-xs font-semibold hover:bg-white disabled:opacity-60"
        @click="retry(t)"
      >
        {{ retrying.has(t.id) ? 'Retrying…' : 'Retry' }}
      </button>
      <button
        type="button"
        class="-mr-1 shrink-0 rounded-lg p-1 hover:bg-white/60"
        @click="notifications.dismiss(t.id)"
      >
        <span class="sr-only">Dismiss</span>
        <AppIcon name="close" class="size-4" />
      </button>
    </div>
  </div>
</template>
