<script setup lang="ts">
/**
 * 24h time field (HH:MM). Typing is understood loosely ("14", "1430", "9.15", "2pm"); a list of
 * 15-minute steps opens below, scrolled to the current value. With `from` (an end time), the
 * list starts at that time ("18:00 (0 mins)") and shows the duration next to every option.
 *
 * Keyboard: ArrowUp / ArrowDown move through the list, Enter picks, Escape restores the value.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { formatDuration, fromMinutes, parseTime, toMinutes } from '@/lib/timeInput'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    /** Start time: the options run from here to + 23:45, labelled with the length. */
    from?: string
    stepMinutes?: number
    size?: 'sm' | 'md'
  }>(),
  { from: '', stepMinutes: 15, size: 'md' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

interface Option {
  value: string
  duration: number | null
}

const options = computed<Option[]>(() => {
  const step = props.stepMinutes
  if (props.from) {
    const f = toMinutes(props.from)
    return Array.from({ length: 1440 / step }, (_, i) => ({
      value: fromMinutes(f + step * i),
      duration: step * i,
    }))
  }
  const out: Option[] = Array.from({ length: 1440 / step }, (_, i) => ({
    value: fromMinutes(step * i),
    duration: null,
  }))
  if (props.modelValue && !out.some((o) => o.value === props.modelValue))
    out.push({ value: props.modelValue, duration: null })
  return out.sort((a, b) => a.value.localeCompare(b.value))
})

const text = ref(props.modelValue)
const typed = ref(false)
const open = ref(false)
const active = ref(-1)
const list = ref<HTMLElement | null>(null)
const listId = `time-list-${Math.random().toString(36).slice(2, 9)}`

watch(
  () => props.modelValue,
  (v) => {
    if (!typed.value) text.value = v
  },
)

/** Index of the option for `t`, or the first one after it. */
function indexFor(t: string): number {
  const opts = options.value
  const exact = opts.findIndex((o) => o.value === t)
  if (exact >= 0) return exact
  if (props.from) {
    const f = toMinutes(props.from)
    const rel = (m: number) => (m - f + 1440) % 1440
    const target = rel(toMinutes(t))
    const i = opts.findIndex((o) => rel(toMinutes(o.value)) >= target)
    return i >= 0 ? i : opts.length - 1
  }
  const i = opts.findIndex((o) => o.value > t)
  return i >= 0 ? i : opts.length - 1
}

async function scrollToActive() {
  await nextTick()
  const el = list.value?.children[active.value] as HTMLElement | undefined
  if (el && list.value) list.value.scrollTop = el.offsetTop - list.value.clientHeight / 2 + 14
}

function openList() {
  if (open.value) return
  open.value = true
  active.value = indexFor(parseTime(text.value) ?? props.modelValue)
  void scrollToActive()
}

function commit(value: string | null) {
  typed.value = false
  if (value && value !== props.modelValue) emit('update:modelValue', value)
  text.value = value ?? props.modelValue
}

function close() {
  open.value = false
  active.value = -1
}

function onInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value
  typed.value = true
  openList()
  const parsed = parseTime(text.value)
  if (parsed) {
    active.value = indexFor(parsed)
    void scrollToActive()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) return openList()
    const n = options.value.length
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
    text.value = options.value[active.value]!.value
    typed.value = true
    void scrollToActive()
  } else if (e.key === 'Enter') {
    if (!open.value && !typed.value) return
    e.preventDefault()
    commit(parseTime(text.value) ?? options.value[active.value]?.value ?? null)
    close()
  } else if (e.key === 'Escape' && open.value) {
    e.preventDefault()
    e.stopPropagation()
    typed.value = false
    text.value = props.modelValue
    close()
  }
}

function onBlur() {
  if (typed.value) commit(parseTime(text.value))
  close()
}

function pick(o: Option) {
  commit(o.value)
  close()
}
</script>

<template>
  <div class="relative inline-block">
    <input
      :value="text"
      type="text"
      inputmode="numeric"
      role="combobox"
      autocomplete="off"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="open && active >= 0 ? `${listId}-${active}` : undefined"
      class="rounded-sm text-center font-medium text-gray-900 tabular-nums focus:outline-2 focus:outline-accent"
      :class="
        size === 'sm'
          ? 'w-14 bg-white px-1.5 py-1 text-xs ring-1 ring-gray-200'
          : 'w-16 bg-gray-100 px-2 py-1.5 text-sm hover:bg-gray-200'
      "
      @focus="openList"
      @click="openList"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />
    <Transition name="dropdown">
      <ul
        v-show="open"
        :id="listId"
        ref="list"
        role="listbox"
        :aria-label="label"
        class="absolute top-full left-0 z-50 origin-top mt-1 max-h-64 overflow-y-auto rounded-sm bg-white py-2 text-sm shadow-[0_4px_16px_rgba(0,0,0,0.18)]"
        :class="from ? 'w-44' : 'w-28'"
      >
        <li
          v-for="(o, i) in options"
          :id="`${listId}-${i}`"
          :key="o.value + (o.duration ?? '')"
          role="option"
          :aria-selected="o.value === modelValue"
          class="flex cursor-pointer items-baseline gap-x-1.5 px-4 py-2 tabular-nums"
          :class="[
            i === active ? 'bg-gray-200/70' : 'hover:bg-gray-100',
            o.value === modelValue ? 'font-semibold text-gray-900' : 'text-gray-700',
          ]"
          @mousedown.prevent="pick(o)"
        >
          {{ o.value }}
          <span v-if="o.duration != null" class="font-normal text-gray-500">
            ({{ formatDuration(o.duration) }})
          </span>
        </li>
      </ul>
    </Transition>
  </div>
</template>
