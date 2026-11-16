<script setup lang="ts">
/**
 * Settings → Colors: pick a theme to color every calendar and task list at once, change any
 * one of them (picking a color another one has swaps the two, and so does dragging one chip
 * onto another), shuffle the order, then Apply.
 * Colors are written to the server (calendar-color), so other clients show them too; one Undo
 * puts the old ones back. Each row previews the chip as it will look in the calendar.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

import { textOn } from '@/lib/color'
import { PALETTES, type Palette, assignPalette, setColor, shuffleColors } from '@/lib/palettes'
import type { Collection } from '@/api/collections'
import { BIRTHDAYS_URL } from '@/lib/birthdays'
import { useBirthdaysStore } from '@/stores/birthdays'
import { FALLBACK_COLOR, useCalendarsStore } from '@/stores/calendars'
import { useHistoryStore } from '@/stores/history'
import { useNotificationsStore } from '@/stores/notifications'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'

const calendars = useCalendarsStore()
const notifications = useNotificationsStore()
const ui = useUiStore()

const birthdays = useBirthdaysStore()
const history = useHistoryStore()

/** Calendars (with Contact birthdays when shown: its color is kept in this browser). */
const calendarRows = computed<Collection[]>(() =>
  birthdays.collection ? [...calendars.calendars, birthdays.collection] : calendars.calendars,
)
const groups = computed(() => [
  { title: 'Calendars', list: calendarRows.value },
  { title: 'Task lists', list: calendars.taskLists },
])
const all = computed(() => [...calendarRows.value, ...calendars.taskLists])
const urls = computed(() => all.value.map((c) => c.url))
const colorNow = (url: string) =>
  url === BIRTHDAYS_URL ? birthdays.color : (calendars.get(url)?.color ?? FALLBACK_COLOR)
const nameOf = (url: string) => all.value.find((c) => c.url === url)?.displayName ?? ''
const current = () => new Map(urls.value.map((url) => [url, colorNow(url)]))

const draft = shallowRef<Map<string, string>>(current())
const palette = ref<Palette | null>(null)
const editing = ref<string | null>(null)
const saving = ref(false)

const changes = computed(
  () =>
    [...draft.value].filter(
      ([url, color]) => color.toLowerCase() !== colorNow(url).toLowerCase(),
    ).length,
)

function pickTheme(p: Palette) {
  palette.value = p
  draft.value = assignPalette(p, urls.value)
  editing.value = null
}
function shuffle() {
  draft.value = shuffleColors(draft.value)
}
function revert() {
  palette.value = null
  draft.value = current()
  editing.value = null
}
function choose(url: string, color: string) {
  draft.value = setColor(draft.value, url, color)
}

// ---- drag a chip onto another to swap their colors -----------------------------------------
const DRAG_THRESHOLD_PX = 5
const drag = ref<{
  from: string
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
  over: string | null
} | null>(null)

/** The color a row shows: while dragging over another row, the two already show swapped. */
function shown(url: string): string {
  const d = drag.value
  const color = draft.value.get(url)!
  if (!d?.moved || !d.over || d.over === d.from) return color
  if (url === d.from) return draft.value.get(d.over)!
  if (url === d.over) return draft.value.get(d.from)!
  return color
}

function onChipDown(url: string, e: PointerEvent) {
  // The Change button keeps working as a button.
  if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, label')) return
  e.preventDefault()
  drag.value = {
    from: url,
    startX: e.clientX,
    startY: e.clientY,
    x: e.clientX,
    y: e.clientY,
    moved: false,
    over: null,
  }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragCancel)
}
function onDragMove(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  const moved =
    d.moved || Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) >= DRAG_THRESHOLD_PX
  const row = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest<HTMLElement>('[data-color-row]')
  drag.value = { ...d, x: e.clientX, y: e.clientY, moved, over: row?.dataset.colorRow ?? null }
  // The grabbing hand everywhere while dragging, not only over the rows.
  if (moved) document.documentElement.style.cursor = 'grabbing'
}
function untrackDrag() {
  document.documentElement.style.cursor = ''
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragCancel)
}
function onDragCancel() {
  untrackDrag()
  drag.value = null
}
function onDragEnd() {
  untrackDrag()
  const d = drag.value
  drag.value = null
  if (!d) return
  // A press without moving is a click: open that row's colors.
  if (!d.moved) {
    editing.value = editing.value === d.from ? null : d.from
    return
  }
  if (d.over && d.over !== d.from) choose(d.from, draft.value.get(d.over)!)
}
onBeforeUnmount(untrackDrag)

const draggedName = computed(() => (drag.value?.moved ? nameOf(drag.value.from) : ''))

/** Colors offered when changing one collection: the picked theme's, else the first theme's. */
const choices = computed(() => (palette.value ?? PALETTES[0]!).colors)

function close() {
  ui.colorsOpen = false
}
async function apply() {
  saving.value = true
  try {
    // One undo step for the server colors and the birthdays color together.
    await history.group(`colors:${Date.now()}`, async () => {
      const next = draft.value.get(BIRTHDAYS_URL)
      const before = birthdays.color
      if (next && next.toLowerCase() !== before.toLowerCase()) {
        ui.birthdaysColor = next
        history.record('Changed colors', 'colors:birthdays', async () => {
          ui.birthdaysColor = before
        })
      }
      await calendars.setColors(draft.value)
    })
    close()
  } catch (err) {
    notifications.reportError(err, 'Could not save the colors', apply)
  } finally {
    saving.value = false
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  if (drag.value) onDragCancel()
  else if (editing.value) editing.value = null
  else close()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 px-4 py-[8vh]"
    @mousedown.self="close"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="colors-title"
      class="relative w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl ring-1 ring-gray-200"
      data-testid="colors-dialog"
    >
      <button
        type="button"
        title="Close"
        class="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-full text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
        @click="close"
      >
        <span class="sr-only">Close</span>
        <AppIcon name="close" class="size-4" />
      </button>
      <h2 id="colors-title" class="font-display text-lg font-bold text-gray-900">Colors</h2>
      <p class="mt-0.5 text-xs text-gray-500">
        Pick a theme for every calendar and task list, then fine-tune any of them. Saved on the
        server, so your other apps get the colors too.
      </p>

      <!-- Themes -->
      <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Themes">
        <button
          v-for="p in PALETTES"
          :key="p.id"
          type="button"
          class="rounded-xl p-2.5 text-left ring-1 transition-shadow duration-150"
          :class="
            palette?.id === p.id
              ? 'ring-2 ring-gray-900'
              : 'ring-gray-200 hover:ring-gray-400'
          "
          :aria-pressed="palette?.id === p.id"
          data-testid="palette"
          @click="pickTheme(p)"
        >
          <span class="flex -space-x-1">
            <span
              v-for="c in p.colors.slice(0, 6)"
              :key="c"
              class="size-4 rounded-full ring-2 ring-white"
              :style="{ backgroundColor: c }"
            ></span>
          </span>
          <span class="mt-1.5 block truncate text-xs font-semibold text-gray-800">{{
            p.name
          }}</span>
        </button>
      </div>

      <div class="mt-4 flex items-center gap-x-2">
        <button type="button" class="btn btn-sm btn-secondary" data-testid="palette-shuffle" @click="shuffle">
          <AppIcon name="refresh" class="size-3.5" /> Shuffle order
        </button>
        <button
          v-if="changes"
          type="button"
          class="btn btn-sm btn-ghost"
          data-testid="palette-revert"
          @click="revert"
        >
          Current colors
        </button>
      </div>

      <!-- Every collection: now → after, as a chip preview. Drag a chip onto another to swap. -->
      <p class="mt-3 text-[11px] text-gray-400">
        Drag a color onto another calendar to swap the two, or click it to pick one.
      </p>
      <div
        class="mt-1.5 max-h-[45vh] space-y-3 overflow-y-auto pr-1 select-none"
        :class="drag?.moved ? 'cursor-grabbing' : ''"
      >
        <section v-for="g in groups" v-show="g.list.length" :key="g.title">
          <h3 class="mb-1 text-xs font-semibold text-gray-500">{{ g.title }}</h3>
          <ul class="space-y-1">
            <li
              v-for="c in g.list"
              :key="c.url"
              class="rounded-lg transition-shadow duration-150"
              :class="
                drag?.moved && drag.over === c.url && drag.from !== c.url
                  ? 'ring-2 ring-gray-900'
                  : ''
              "
              :data-color-row="c.url"
            >
              <div
                class="flex touch-none items-center gap-x-3 rounded-lg px-1 py-1 hover:bg-gray-50"
                :class="drag?.moved ? 'cursor-grabbing' : 'cursor-grab'"
                @pointerdown="onChipDown(c.url, $event)"
              >
                <span
                  class="size-3 shrink-0 rounded-full"
                  :style="{ backgroundColor: colorNow(c.url) }"
                  :title="`Now: ${colorNow(c.url)}`"
                ></span>
                <AppIcon name="arrow-right" class="size-3 shrink-0 text-gray-300" />
                <span
                  class="chip-fill min-w-0 flex-1 truncate rounded-md px-2 py-1 text-xs font-medium text-(--chip-fg) transition-[background-color,opacity] duration-150"
                  :class="drag?.moved && drag.from === c.url ? 'opacity-50' : ''"
                  :style="{
                    backgroundColor: shown(c.url),
                    '--chip-color': shown(c.url),
                    '--chip-fg': textOn(shown(c.url)),
                  }"
                  :title="`Drag onto another calendar to swap colors`"
                  data-testid="color-preview"
                  >{{ c.displayName }}</span
                >
                <button
                  type="button"
                  class="btn btn-sm btn-ghost shrink-0"
                  :aria-expanded="editing === c.url"
                  :aria-label="`Change the color of ${c.displayName}`"
                  data-testid="color-edit"
                  @click="editing = editing === c.url ? null : c.url"
                >
                  Change
                </button>
              </div>
              <div
                v-if="editing === c.url"
                class="mx-1 mb-1 flex flex-wrap items-center gap-1.5 rounded-lg bg-gray-50 p-2"
                role="group"
                :aria-label="`Colors for ${c.displayName}`"
              >
                <button
                  v-for="col in choices"
                  :key="col"
                  type="button"
                  class="grid size-7 place-items-center rounded-full transition-transform duration-150 hover:scale-110"
                  :style="{ backgroundColor: col }"
                  :title="col"
                  :aria-pressed="draft.get(c.url)?.toLowerCase() === col"
                  data-testid="color-choice"
                  @click="choose(c.url, col)"
                >
                  <AppIcon
                    v-if="draft.get(c.url)?.toLowerCase() === col"
                    name="check"
                    class="size-4"
                    :style="{ color: textOn(col) }"
                    stroke-width="2.5"
                  />
                </button>
                <label
                  class="ml-1 flex cursor-pointer items-center gap-x-1.5 rounded-full px-2 py-1 text-xs font-medium text-gray-600 hover:bg-white"
                  title="Any color"
                >
                  <input
                    type="color"
                    class="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                    :value="draft.get(c.url)"
                    @input="choose(c.url, ($event.target as HTMLInputElement).value)"
                  />
                  Custom
                </label>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <div class="mt-4 flex items-center justify-end gap-x-2 border-t border-gray-100 pt-4">
        <span class="mr-auto text-xs text-gray-500">
          {{ changes ? `${changes} ${changes === 1 ? 'change' : 'changes'}` : 'No changes yet' }}
        </span>
        <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!changes || saving"
          :title="changes ? undefined : 'Pick a theme or change a color first'"
          data-testid="colors-apply"
          @click="apply"
        >
          {{ saving ? 'Saving…' : 'Apply' }}
        </button>
      </div>
    </div>
    <!-- The dragged color follows the pointer. -->
    <div
      v-if="drag?.moved"
      class="pointer-events-none fixed z-[60] flex items-center gap-x-2 rounded-full bg-white py-1 pr-3 pl-1 text-xs font-medium text-gray-800 shadow-lg ring-1 ring-gray-200"
      :style="{ left: `${drag.x + 12}px`, top: `${drag.y + 12}px` }"
      data-testid="color-drag-ghost"
    >
      <span class="size-5 rounded-full" :style="{ backgroundColor: draft.get(drag.from) }"></span>
      {{ draggedName }}
    </div>
  </div>
</template>
