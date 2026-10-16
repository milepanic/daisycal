<script setup lang="ts">
/** Details popover for a selected event with Edit and Delete (scope choice for recurring). */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { ConflictError } from '@/api/errors'
import { type EditScope, type EventInstance, describeRepeat } from '@/api/ical'
import { isSameDay } from '@/lib/dates'
import { dayTitle, formatShortDateTime, formatTime } from '@/lib/format'
import { useCalendarsStore } from '@/stores/calendars'
import { useEventsStore } from '@/stores/events'
import { type Anchor, useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = defineProps<{ instance: EventInstance; anchor?: Anchor }>()
const emit = defineEmits<{ close: [] }>()

const calendars = useCalendarsStore()
const events = useEventsStore()
const ui = useUiStore()

const root = ref<HTMLElement | null>(null)
const confirming = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

const color = computed(() => calendars.colorFor(props.instance.collectionUrl))
const calendarName = computed(() => calendars.get(props.instance.collectionUrl)?.displayName ?? '')
const when = computed(() => {
  const { start, end, allDay } = props.instance
  const lastDay = new Date(end.getTime() - 1)
  if (allDay)
    return isSameDay(start, lastDay)
      ? dayTitle(start)
      : `${formatShortDateTime(start, false)} – ${formatShortDateTime(lastDay, false)}`
  if (isSameDay(start, end) || isSameDay(start, lastDay))
    return `${dayTitle(start)} · ${formatTime(start)} – ${formatTime(end)}`
  return `${formatShortDateTime(start)} – ${formatShortDateTime(end)}`
})

/** Keep the popover inside the viewport, preferring below-right of the anchor. */
const style = computed(() => {
  const a = props.anchor
  if (!a) return { top: '5rem', right: '1rem' }
  const width = 320
  const height = 280
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  let left = a.x + a.width + 8
  if (left + width > vw - 8) left = Math.max(8, a.x - width - 8)
  let top = a.y
  if (top + height > vh - 8) top = Math.max(8, vh - height - 8)
  return { top: `${top}px`, left: `${left}px` }
})

function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) emit('close')
}
onMounted(() => setTimeout(() => document.addEventListener('mousedown', onDocClick), 0))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))

function edit() {
  ui.openCreate({
    kind: 'event',
    edit: {
      objectUrl: props.instance.objectUrl,
      recurrenceId: props.instance.recurrenceId?.toString() ?? null,
    },
  })
}

async function remove(scope: EditScope) {
  busy.value = true
  error.value = null
  try {
    await events.deleteEvent(props.instance, scope)
    emit('close')
  } catch (err) {
    error.value =
      err instanceof ConflictError
        ? 'This event changed on another device. It has been refreshed, please try again.'
        : err instanceof Error
          ? err.message
          : 'Could not delete the event'
    confirming.value = false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    ref="root"
    role="dialog"
    aria-label="Event details"
    class="fixed z-40 w-80 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-gray-200"
    :style="style"
    data-testid="event-popover"
  >
    <div class="flex items-start gap-x-3">
      <span class="mt-1.5 size-3 shrink-0 rounded-sm" :style="{ backgroundColor: color }"></span>
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold text-gray-900">
          {{ instance.summary || '(No title)' }}
        </h2>
        <p class="mt-0.5 text-sm text-gray-600">{{ when }}</p>
      </div>
      <button
        type="button"
        class="-mt-1 -mr-1 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        @click="emit('close')"
      >
        <span class="sr-only">Close</span>
        <AppIcon name="close" class="size-5" />
      </button>
    </div>

    <dl class="mt-3 space-y-1.5 text-sm text-gray-700">
      <div class="flex gap-x-2">
        <dt class="w-20 shrink-0 text-gray-400">Calendar</dt>
        <dd class="truncate">{{ calendarName }}</dd>
      </div>
      <div v-if="instance.location" class="flex gap-x-2">
        <dt class="w-20 shrink-0 text-gray-400">Location</dt>
        <dd class="truncate">{{ instance.location }}</dd>
      </div>
      <div v-if="instance.isRecurring" class="flex gap-x-2">
        <dt class="w-20 shrink-0 text-gray-400">Repeats</dt>
        <dd>{{ describeRepeat(instance.repeat) }}</dd>
      </div>
      <div v-if="instance.alarm != null" class="flex gap-x-2">
        <dt class="w-20 shrink-0 text-gray-400">Reminder</dt>
        <dd>{{ instance.alarm }} min before</dd>
      </div>
      <div v-if="instance.description" class="flex gap-x-2">
        <dt class="w-20 shrink-0 text-gray-400">Notes</dt>
        <dd class="line-clamp-4 whitespace-pre-line">{{ instance.description }}</dd>
      </div>
    </dl>

    <p v-if="error" class="mt-3 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">
      {{ error }}
    </p>

    <div v-if="confirming" class="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
      <p class="font-medium text-gray-900">
        {{ instance.isRecurring ? 'Delete this repeating event?' : 'Delete this event?' }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-if="instance.isRecurring"
          type="button"
          :disabled="busy"
          class="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
          @click="remove('this')"
        >
          Only this occurrence
        </button>
        <button
          type="button"
          :disabled="busy"
          class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          @click="remove('all')"
        >
          {{ instance.isRecurring ? 'All occurrences' : 'Delete' }}
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
          @click="confirming = false"
        >
          Cancel
        </button>
      </div>
    </div>
    <div v-else class="mt-4 flex gap-x-2">
      <button
        type="button"
        class="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-700"
        @click="edit"
      >
        Edit
      </button>
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        @click="confirming = true"
      >
        Delete
      </button>
    </div>
  </div>
</template>
