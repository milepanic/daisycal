<script setup lang="ts">
/**
 * Contacts page: the list on the left, the selected contact (or its edit form) on the right.
 * On phones the two take turns. Contacts come from the CardDAV address books on the same
 * server; import / export use plain .vcf files.
 */
import { computed, ref, watch } from 'vue'

import { displayName, type ContactFields } from '@/lib/vcard'
import { NARROW_QUERY, useMediaQuery } from '@/composables/useMediaQuery'
import { useCalendarsStore } from '@/stores/calendars'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { useUiStore } from '@/stores/ui'
import ContactDetail from '@/components/contacts/ContactDetail.vue'
import ContactForm from '@/components/contacts/ContactForm.vue'
import ContactList from '@/components/contacts/ContactList.vue'
import ContactsToolbar from '@/components/shell/ContactsToolbar.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const contacts = useContactsStore()
const calendars = useCalendarsStore()
const notifications = useNotificationsStore()
const ui = useUiStore()
const narrow = useMediaQuery(NARROW_QUERY)

void contacts.ensureLoaded()

const selectedUrl = ref<string | null>(null)
const mode = ref<'view' | 'edit' | 'create'>('view')
const saving = ref(false)

const selected = computed(() => (selectedUrl.value ? contacts.get(selectedUrl.value) : undefined))

// Wide screens open on the first contact; a deleted or hidden one hands over to the next.
watch(
  () => contacts.sorted,
  (list) => {
    if (mode.value === 'create') return
    if (selectedUrl.value && list.some((c) => c.url === selectedUrl.value)) return
    selectedUrl.value = narrow.value ? null : (list[0]?.url ?? null)
    if (mode.value === 'edit') mode.value = 'view'
  },
  { immediate: true },
)

function select(url: string) {
  selectedUrl.value = url
  mode.value = 'view'
}
function startCreate() {
  if (contacts.status === 'ready' && contacts.books.length === 0) {
    notifications.push('There is no address book on the server to add contacts to', {
      kind: 'error',
    })
    return
  }
  mode.value = 'create'
}
// "c" anywhere on the page.
watch(
  () => ui.newContactRequest,
  () => startCreate(),
)

/** New contacts go to the selected contact's book, else the first visible one. */
const targetBook = computed(
  () =>
    selected.value?.bookUrl ??
    contacts.books.find((b) => calendars.isVisible(b.url))?.url ??
    contacts.books[0]?.url,
)

async function save(fields: ContactFields, bookUrl: string) {
  saving.value = true
  try {
    if (mode.value === 'create') {
      const entry = await contacts.create(bookUrl, fields)
      calendars.setVisible(bookUrl, true)
      selectedUrl.value = entry.url
    } else if (selected.value) {
      await contacts.update(selected.value, fields)
    }
    mode.value = 'view'
  } catch (err) {
    notifications.reportError(
      err,
      mode.value === 'create' ? 'Could not add the contact' : 'Could not save the contact',
      () => save(fields, bookUrl),
    )
  } finally {
    saving.value = false
  }
}

async function remove() {
  const c = selected.value
  if (!c) return
  const list = contacts.sorted
  const i = list.findIndex((x) => x.url === c.url)
  try {
    await contacts.remove(c)
    const next = list[i + 1] ?? list[i - 1]
    selectedUrl.value = narrow.value ? null : (next?.url ?? null)
  } catch (err) {
    notifications.reportError(err, `Could not delete ${displayName(c)}`, remove)
  }
}

// ---- import / export ---------------------------------------------------------------------
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/vcard;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function fileName(name: string) {
  return `${name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'contact'}.vcf`
}
function exportOne() {
  if (selected.value) download(fileName(displayName(selected.value)), selected.value.raw)
}
function exportAll() {
  download('contacts.vcf', contacts.sorted.map((c) => c.raw.trimEnd()).join('\r\n') + '\r\n')
}

const fileInput = ref<HTMLInputElement | null>(null)
async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const bookUrl = targetBook.value
  if (!file || !bookUrl) return
  try {
    const n = await contacts.importText(bookUrl, await file.text())
    if (n === 0) notifications.push(`No contacts found in ${file.name}`, { kind: 'error' })
    else calendars.setVisible(bookUrl, true)
  } catch (err) {
    notifications.reportError(err, `Could not import ${file.name}`)
  }
}

/** Phones: the list, or the card / form. */
const showList = computed(() => !narrow.value || (mode.value === 'view' && !selected.value))
const showPane = computed(() => !narrow.value || mode.value !== 'view' || Boolean(selected.value))
</script>

<template>
  <ContactsToolbar
    :can-export="contacts.sorted.length > 0"
    @create="startCreate"
    @import="fileInput?.click()"
    @export="exportAll"
  />
  <input
    ref="fileInput"
    type="file"
    accept=".vcf,text/vcard,text/x-vcard"
    class="hidden"
    data-testid="import-input"
    @change="onImportFile"
  />
  <main class="flex min-h-0 flex-1 gap-x-3 px-2 pb-2" data-testid="contacts-view">
    <ContactList
      v-if="showList"
      class="w-full shrink-0 md:w-80 lg:w-96"
      :contacts="contacts.sorted"
      :categories="contacts.categories"
      :selected-url="mode === 'create' ? null : selectedUrl"
      :loading="contacts.status === 'loading' || contacts.status === 'idle'"
      @select="select"
      @create="startCreate"
      @import="fileInput?.click()"
    />
    <div v-if="showPane" class="flex min-h-0 min-w-0 flex-1 flex-col">
      <ContactForm
        v-if="mode !== 'view'"
        :key="mode === 'create' ? 'new' : selectedUrl!"
        class="flex-1"
        :initial="mode === 'edit' ? selected : undefined"
        :books="contacts.books"
        :book-color="contacts.bookColor"
        :book-url="targetBook"
        :categories="contacts.categories"
        :saving="saving"
        @save="save"
        @cancel="mode = 'view'"
      />
      <ContactDetail
        v-else-if="selected"
        class="flex-1"
        :contact="selected"
        :book-name="contacts.book(selected.bookUrl)?.displayName ?? ''"
        :book-color="contacts.bookColor(selected.bookUrl)"
        :back="narrow"
        @back="selectedUrl = null"
        @edit="mode = 'edit'"
        @remove="remove"
        @export="exportOne"
      />
      <div
        v-else
        class="hidden flex-1 place-items-center rounded-2xl bg-white shadow-card md:grid"
      >
        <EmptyState
          v-if="contacts.status === 'error'"
          icon="warning"
          title="Could not load contacts"
          :text="contacts.error ?? undefined"
        >
          <button type="button" class="btn btn-sm btn-secondary" @click="contacts.load()">
            Try again
          </button>
        </EmptyState>
        <EmptyState
          v-else-if="contacts.status === 'ready' && contacts.books.length === 0"
          icon="user"
          title="No address books"
          text="The server has no CardDAV address book for this account yet."
        />
        <EmptyState v-else icon="user" title="Pick a contact" text="Their details show here." />
      </div>
    </div>
  </main>
</template>
