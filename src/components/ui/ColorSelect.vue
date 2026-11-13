<script setup lang="ts">
/**
 * Picker for the create popup (calendar, task list, travel time, notification): a field with
 * the current choice (and its color square, when options have colors) opening a card with
 * every option and a check on the picked one. `inline` sizes it to its content.
 *
 * Keyboard: ↑ / ↓ open and move, Enter / Space pick, Escape closes (only the menu).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import AppIcon from './AppIcon.vue'

export interface ColorOption {
  value: string | number
  label: string
  color?: string
}

const props = defineProps<{
  modelValue: string | number
  options: ColorOption[]
  label: string
  id?: string
  inline?: boolean
  /** Plain gray text instead of the gray field (secondary choices such as Repeat). */
  ghost?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()

const open = ref(false)
const active = ref(0)
const root = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const listId = `color-select-${Math.random().toString(36).slice(2, 9)}`

const current = computed(() => props.options.find((o) => o.value === props.modelValue))

function show() {
  active.value = Math.max(
    0,
    props.options.findIndex((o) => o.value === props.modelValue),
  )
  open.value = true
}
function hide() {
  open.value = false
}
function pick(o: ColorOption) {
  emit('update:modelValue', o.value)
  hide()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    // Close only the menu, not the popup around it.
    e.preventDefault()
    e.stopPropagation()
    hide()
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) return show()
    const by = e.key === 'ArrowDown' ? 1 : -1
    active.value = (active.value + by + props.options.length) % props.options.length
    return
  }
  if ((e.key === 'Enter' || e.key === ' ') && open.value) {
    e.preventDefault()
    const o = props.options[active.value]
    if (o) pick(o)
  }
}

watch(active, async () => {
  await nextTick()
  list.value?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' })
})

function onDocMouseDown(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) hide()
}
/** Escape closes the menu even when focus is elsewhere (and not the popup around it). */
function onDocKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  hide()
}
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onDocKeydown, true)
  } else {
    document.removeEventListener('mousedown', onDocMouseDown)
    document.removeEventListener('keydown', onDocKeydown, true)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onDocKeydown, true)
})
</script>

<template>
  <div ref="root" class="relative" :class="inline ? 'inline-block' : 'w-full'" @keydown="onKeydown">
    <button
      :id="id"
      type="button"
      class="flex items-center gap-x-2 rounded-sm px-2.5 py-1.5 text-left text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-accent"
      :aria-label="`${label}: ${current?.label ?? 'none'}`"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listId"
      :data-value="modelValue"
      :class="[
        inline ? '' : 'w-full',
        ghost
          ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          : 'bg-gray-100 text-gray-900 hover:bg-gray-200',
      ]"
      @click="open ? hide() : show()"
    >
      <span
        v-if="current?.color"
        class="size-2.5 shrink-0 rounded-sm"
        :style="{ backgroundColor: current.color }"
      ></span>
      <span class="min-w-0 flex-1 truncate whitespace-nowrap">{{
        current?.label ?? 'Pick one'
      }}</span>
      <AppIcon
        name="chevron-down"
        class="size-4 shrink-0 text-gray-500 transition-transform duration-150"
        :class="open ? 'rotate-180' : ''"
      />
    </button>
    <Transition name="dropdown">
      <ul
        v-if="open"
        :id="listId"
        ref="list"
        role="listbox"
        :aria-label="label"
        class="absolute top-full left-0 z-50 mt-1 max-h-64 min-w-full origin-top overflow-y-auto whitespace-nowrap rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-gray-200"
      >
        <li
          v-for="(o, i) in options"
          :key="o.value"
          role="option"
          :aria-selected="o.value === modelValue"
          :data-active="i === active || undefined"
          :data-value="o.value"
          class="flex cursor-pointer items-center gap-x-2.5 rounded-sm px-2.5 py-1.5 text-[13px]"
          :class="[
            i === active ? 'bg-gray-100' : '',
            o.value === modelValue ? 'font-semibold text-gray-900' : 'text-gray-700',
          ]"
          @mouseenter="active = i"
          @mousedown.prevent="pick(o)"
        >
          <span
            v-if="o.color"
            class="size-2.5 shrink-0 rounded-sm"
            :style="{ backgroundColor: o.color }"
          ></span>
          <span class="min-w-0 flex-1 truncate">{{ o.label }}</span>
          <AppIcon
            name="check"
            class="size-4 shrink-0 text-gray-900"
            :class="o.value === modelValue ? '' : 'invisible'"
          />
        </li>
      </ul>
    </Transition>
  </div>
</template>
