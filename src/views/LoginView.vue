<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { LoginError, useAuthStore } from '@/stores/auth'
import AppIcon from '@/components/ui/AppIcon.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const remember = ref(false)
const error = ref<string | null>(null)
const submitting = ref(false)
const usernameInput = ref<HTMLInputElement | null>(null)

onMounted(() => usernameInput.value?.focus())

async function submit() {
  error.value = null
  submitting.value = true
  try {
    await auth.login(username.value, password.value, { remember: remember.value })
    await router.replace((route.query.redirect as string) || '/')
  } catch (err) {
    error.value = err instanceof LoginError ? err.message : 'Login failed'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center p-4">
    <form class="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm" @submit.prevent="submit">
      <div class="mb-6 flex items-center gap-x-3">
        <span class="flex size-10 items-center justify-center rounded-xl bg-accent text-white">
          <AppIcon name="calendar" class="size-6" />
        </span>
        <div>
          <h1 class="text-lg font-semibold text-gray-900">DaisyCal</h1>
          <p class="text-xs text-gray-500">Sign in to your calendar</p>
        </div>
      </div>

      <p
        v-if="auth.lastLogoutReason === 'expired'"
        class="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
      >
        Your session expired. Please sign in again.
      </p>

      <label class="block text-sm font-medium text-gray-700">
        Username
        <input
          ref="usernameInput"
          v-model="username"
          name="username"
          type="text"
          autocomplete="username"
          required
          class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
      </label>
      <label class="mt-4 block text-sm font-medium text-gray-700">
        Password
        <input
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
      </label>
      <label class="mt-4 flex cursor-pointer items-center gap-x-2 text-sm text-gray-600">
        <input
          v-model="remember"
          name="remember"
          type="checkbox"
          class="size-4 rounded-sm accent-gray-900"
        />
        Remember me on this device
      </label>

      <p
        v-if="error"
        role="alert"
        class="mt-4 flex items-start gap-x-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        <AppIcon name="warning" class="mt-0.5 size-4 shrink-0" />
        {{ error }}
      </p>

      <button
        type="submit"
        :disabled="submitting"
        class="mt-6 flex h-10 w-full items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
      >
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </main>
</template>
