<script setup lang="ts">
/**
 * The contacts column: a search field, label filters, and the contacts grouped by initial
 * letter (sticky headers). ↑ / ↓ in the search field move the selection.
 */
import { computed, nextTick, ref, watch } from 'vue'

import type { ContactEntry } from '@/stores/contacts'
import { displayName, sortKey } from '@/lib/vcard'
import AppIcon from '@/components/ui/AppIcon.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SkeletonRows from '@/components/ui/SkeletonRows.vue'
import ContactAvatar from './ContactAvatar.vue'

const props = defineProps<{
  contacts: ContactEntry[]
  categories: string[]
  selectedUrl: string | null
  loading?: boolean
}>()
const emit = defineEmits<{ select: [url: string]; create: []; import: [] }>()

const query = ref('')
const label = ref<string | null>(null)

/** Name, organization, e-mail, phone and labels, accents ignored. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
function matches(c: ContactEntry, q: string) {
  if (!q) return true
  const hay = [
    displayName(c),
    c.nickname,
    c.org,
    c.title,
    ...c.emails.map((e) => e.value),
    ...c.categories,
  ]
    .map(fold)
    .join(' ')
  // Phones match by digits, whatever the spacing.
  const digits = q.replace(/\D/g, '')
  return (
    q
      .split(/\s+/)
      .filter(Boolean)
      .every((w) => hay.includes(w)) ||
    (digits.length >= 3 && c.phones.some((p) => p.value.replace(/\D/g, '').includes(digits)))
  )
}

const filtered = computed(() => {
  const q = fold(query.value.trim())
  return props.contacts.filter(
    (c) => (!label.value || c.categories.includes(label.value)) && matches(c, q),
  )
})

const groups = computed(() => {
  const out: { letter: string; contacts: ContactEntry[] }[] = []
  for (const c of filtered.value) {
    const first = sortKey(c).charAt(0).toLocaleUpperCase()
    const letter = /\p{L}/u.test(first) ? first : '#'
    const last = out[out.length - 1]
    if (last?.letter === letter) last.contacts.push(c)
    else out.push({ letter, contacts: [c] })
  }
  return out
})

// A label that no contact has any more is dropped.
watch(
  () => props.categories,
  (cats) => {
    if (label.value && !cats.includes(label.value)) label.value = null
  },
)

const listEl = ref<HTMLElement | null>(null)
async function move(by: number) {
  const list = filtered.value
  if (!list.length) return
  const i = list.findIndex((c) => c.url === props.selectedUrl)
  const next = list[Math.min(Math.max(i + by, 0), list.length - 1)]!
  emit('select', next.url)
  await nextTick()
  listEl.value
    ?.querySelector<HTMLElement>(`[data-url="${CSS.escape(next.url)}"]`)
    ?.scrollIntoView?.({ block: 'nearest' })
}

function subtitle(c: ContactEntry) {
  // A business shown by its name does not repeat it underneath.
  const org = c.org === displayName(c) ? '' : c.org
  return [c.title, org].filter(Boolean).join(' · ') || c.emails[0]?.value || c.phones[0]?.value
}
</script>

<template>
  <section
    class="flex min-h-0 flex-col rounded-2xl bg-white shadow-card"
    aria-label="Contacts"
    data-testid="contact-list"
  >
    <div class="shrink-0 px-3 pt-3 pb-2">
      <label class="relative block">
        <span class="sr-only">Search contacts</span>
        <AppIcon
          name="search"
          class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
        />
        <input
          v-model="query"
          type="search"
          placeholder="Search contacts"
          autocomplete="off"
          class="h-9 w-full rounded-lg bg-gray-100 pr-3 pl-8 text-[13px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-900 focus:outline-none"
          data-testid="contact-search"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
        />
      </label>
      <div
        v-if="categories.length"
        class="scroll-subtle -mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-0.5"
        role="group"
        aria-label="Labels"
      >
        <button
          v-for="cat in [null, ...categories]"
          :key="cat ?? '*'"
          type="button"
          class="h-7 shrink-0 rounded-full px-3 text-xs font-medium transition-colors duration-150"
          :class="
            label === cat
              ? 'bg-pill text-on-color'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
          "
          :aria-pressed="label === cat"
          data-testid="label-filter"
          @click="label = cat"
        >
          {{ cat ?? 'All' }}
        </button>
      </div>
    </div>

    <div ref="listEl" class="scroll-subtle min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <SkeletonRows v-if="loading && contacts.length === 0" />
      <EmptyState
        v-else-if="contacts.length === 0"
        icon="user"
        title="No contacts yet"
        text="Add someone, or import a .vcf file from another app."
      >
        <div class="flex gap-x-2">
          <button type="button" class="btn btn-sm btn-primary" @click="emit('create')">
            New contact
          </button>
          <button type="button" class="btn btn-sm btn-secondary" @click="emit('import')">
            Import
          </button>
        </div>
      </EmptyState>
      <EmptyState
        v-else-if="filtered.length === 0"
        icon="search"
        title="No matches"
        :text="query ? `Nobody matches “${query}”.` : 'No contacts with this label.'"
      />
      <template v-for="g in groups" :key="g.letter">
        <h3
          class="sticky top-0 z-10 bg-white/95 px-2 pt-2 pb-1 font-display text-[13px] font-bold text-gray-400 backdrop-blur-sm"
        >
          {{ g.letter }}
        </h3>
        <ul class="space-y-px">
          <li v-for="c in g.contacts" :key="c.url">
            <button
              type="button"
              class="flex w-full items-center gap-x-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-150"
              :class="selectedUrl === c.url ? 'bg-gray-100' : 'hover:bg-gray-50'"
              :aria-current="selectedUrl === c.url || undefined"
              :data-url="c.url"
              data-testid="contact-row"
              @click="emit('select', c.url)"
            >
              <ContactAvatar :contact="c" size="sm" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-gray-900">{{
                  displayName(c)
                }}</span>
                <span v-if="subtitle(c)" class="block truncate text-xs text-gray-500">{{
                  subtitle(c)
                }}</span>
              </span>
            </button>
          </li>
        </ul>
      </template>
    </div>
    <p
      v-if="contacts.length"
      class="shrink-0 border-t border-gray-100 px-4 py-2 text-xs text-gray-400"
    >
      {{ filtered.length === contacts.length ? contacts.length : `${filtered.length} of ${contacts.length}` }}
      {{ contacts.length === 1 ? 'contact' : 'contacts' }}
    </p>
  </section>
</template>
