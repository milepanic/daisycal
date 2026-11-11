<script setup lang="ts">
/**
 * Date field (Google Calendar style): a button showing "Thursday, November 12" that opens a
 * month grid; today is a filled circle, the picked day a light one.
 * The value is a date key (YYYY-MM-DD), '' meaning no date.
 *
 * Keyboard: arrows move a day / week, PageUp / PageDown a month, Enter picks, Escape closes.
 */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

import {
  type WeekStart,
  addDays,
  addMonths,
  isSameDay,
  parseDateKey,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toDateKey,
} from '@/lib/dates'
import { WEEKDAYS_LETTER, monthTitle } from '@/lib/format'
import { formatPickerDate } from '@/lib/timeInput'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    weekStart?: WeekStart
    /** Days before this date key cannot be picked. */
    min?: string
    placeholder?: string
    /** Plain text button instead of the gray field (for secondary dates). */
    ghost?: boolean
    /** Trigger text instead of the formatted date. */
    text?: string
    /** "Thu, Nov 12" instead of "Thursday, November 12". */
    short?: boolean
  }>(),
  { weekStart: 1, min: '', placeholder: 'Pick a date' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const grid = ref<HTMLElement | null>(null)
/** Where the popover opens: flipped up / right-aligned when it would leave the viewport. */
const placement = ref({ up: false, right: false })

const value = computed(() => parseDateKey(props.modelValue))
const minDate = computed(() => parseDateKey(props.min))
const today = startOfDay(new Date())
const month = ref(startOfMonth(value.value ?? today))
/** The day keyboard focus is on (roving tabindex). */
const cursor = ref(value.value ?? today)

const triggerText = computed(
  () =>
    props.text ??
    (value.value ? formatPickerDate(value.value, { short: props.short }) : props.placeholder),
)
const weekdayLetters = computed(() =>
  Array.from({ length: 7 }, (_, i) => WEEKDAYS_LETTER[(props.weekStart + i) % 7]!),
)
const days = computed(() => {
  const start = startOfWeek(month.value, props.weekStart)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
})

const disabled = (d: Date) => Boolean(minDate.value && d < minDate.value)

function dayClass(d: Date) {
  if (isSameDay(d, today)) return 'bg-accent text-white'
  if (value.value && isSameDay(d, value.value)) return 'bg-accent/15 font-semibold text-accent'
  if (disabled(d)) return 'text-gray-300'
  return `${d.getMonth() === month.value.getMonth() ? 'text-gray-800' : 'text-gray-400'} hover:bg-gray-100`
}

async function show() {
  const r = trigger.value?.getBoundingClientRect()
  if (r && typeof window !== 'undefined') {
    placement.value = {
      up: r.bottom + 340 > window.innerHeight && r.top > 340,
      right: r.left + 272 > window.innerWidth - 8,
    }
  }
  cursor.value = value.value ?? (minDate.value && minDate.value > today ? minDate.value : today)
  month.value = startOfMonth(cursor.value)
  open.value = true
  document.addEventListener('mousedown', onDocMouseDown)
  await nextTick()
  focusCursor()
}

function hide(refocus = true) {
  open.value = false
  document.removeEventListener('mousedown', onDocMouseDown)
  if (refocus) trigger.value?.focus()
}
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown))

function onDocMouseDown(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) hide(false)
}

function pick(d: Date) {
  if (disabled(d)) return
  emit('update:modelValue', toDateKey(d))
  hide()
}

function focusCursor() {
  grid.value?.querySelector<HTMLElement>(`[data-date="${toDateKey(cursor.value)}"]`)?.focus()
}

async function moveCursor(next: Date) {
  cursor.value = next
  if (
    next.getMonth() !== month.value.getMonth() ||
    next.getFullYear() !== month.value.getFullYear()
  )
    month.value = startOfMonth(next)
  await nextTick()
  focusCursor()
}

function onGridKeydown(e: KeyboardEvent) {
  const steps: Record<string, () => Date> = {
    ArrowLeft: () => addDays(cursor.value, -1),
    ArrowRight: () => addDays(cursor.value, 1),
    ArrowUp: () => addDays(cursor.value, -7),
    ArrowDown: () => addDays(cursor.value, 7),
    PageUp: () => addMonths(cursor.value, -1),
    PageDown: () => addMonths(cursor.value, 1),
  }
  const step = steps[e.key]
  if (!step) return
  e.preventDefault()
  void moveCursor(step())
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    // Close only the picker, not the popup around it.
    e.preventDefault()
    e.stopPropagation()
    hide()
  }
}

function shiftMonth(by: number) {
  month.value = addMonths(month.value, by)
  cursor.value = month.value
}
</script>

<template>
  <div ref="root" class="relative inline-block" @keydown="onKeydown">
    <button
      ref="trigger"
      type="button"
      class="inline-flex items-center gap-x-1.5 rounded-sm text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-accent"
      :class="
        ghost
          ? 'px-2 py-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900'
          : value
            ? 'bg-gray-100 px-2.5 py-1.5 text-gray-900 hover:bg-gray-200'
            : 'bg-gray-100 px-2.5 py-1.5 text-gray-500 hover:bg-gray-200'
      "
      :aria-label="`${label}: ${value ? formatPickerDate(value) : placeholder}`"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="open ? hide() : show()"
    >
      <slot name="icon" />
      {{ triggerText }}
    </button>

    <div
      v-if="open"
      role="dialog"
      :aria-label="label"
      class="absolute z-50 w-68 rounded-xl bg-white p-3 shadow-xl ring-1 ring-gray-200"
      :class="[
        placement.up ? 'bottom-full mb-1' : 'top-full mt-1',
        placement.right ? 'right-0' : 'left-0',
      ]"
      data-testid="date-picker"
    >
      <div class="mb-1 flex items-center justify-between">
        <h3 class="pl-1 text-sm font-semibold text-gray-900">{{ monthTitle(month) }}</h3>
        <div class="flex items-center">
          <button
            type="button"
            class="rounded-sm p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            @click="shiftMonth(-1)"
          >
            <span class="sr-only">Previous month</span>
            <AppIcon name="chevron-left" class="size-4" />
          </button>
          <button
            type="button"
            class="rounded-sm p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            @click="shiftMonth(1)"
          >
            <span class="sr-only">Next month</span>
            <AppIcon name="chevron-right" class="size-4" />
          </button>
        </div>
      </div>
      <div class="grid grid-cols-7 text-center text-[11px] font-medium text-gray-400">
        <div v-for="(letter, i) in weekdayLetters" :key="i" class="py-1">{{ letter }}</div>
      </div>
      <div
        ref="grid"
        class="grid grid-cols-7 gap-y-0.5 text-center text-xs font-medium"
        @keydown="onGridKeydown"
      >
        <button
          v-for="d in days"
          :key="toDateKey(d)"
          type="button"
          class="mx-auto flex size-8 items-center justify-center rounded-full tabular-nums focus-visible:outline-2 focus-visible:outline-accent"
          :class="dayClass(d)"
          :data-date="toDateKey(d)"
          :tabindex="isSameDay(d, cursor) ? 0 : -1"
          :disabled="disabled(d)"
          :aria-current="isSameDay(d, today) ? 'date' : undefined"
          :aria-pressed="Boolean(value && isSameDay(d, value))"
          @click="pick(d)"
        >
          {{ d.getDate() }}
        </button>
      </div>
    </div>
  </div>
</template>
