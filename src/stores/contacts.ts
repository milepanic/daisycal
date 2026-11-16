/**
 * Contacts (CardDAV address books on the same server) for the Contacts page: loaded on first
 * visit and on Refresh. Writes go to the server first (a contact is one small file, so there is
 * nothing to show optimistically); each one can be undone like events and tasks. Birthdays in
 * the calendar are re-read after every change.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import type { AddressBook, VCardObject } from '@/api/caldav'
import { newUid } from '@/api/stamp'
import {
  type Contact,
  type ContactFields,
  displayName,
  parseVCard,
  serializeVCard,
  sortKey,
  splitVCards,
} from '@/lib/vcard'
import { useAuthStore } from './auth'
import { useBirthdaysStore } from './birthdays'
import { useCalendarsStore } from './calendars'
import { useHistoryStore } from './history'

/** A contact and where it lives. */
export interface ContactEntry extends Contact {
  url: string
  etag: string
  bookUrl: string
}

/** Address books have no color on the server: one from this list each, in order. */
const BOOK_COLORS = ['#245a85', '#d9467a', '#0f9488', '#c2620e', '#7c3aed', '#566c86']

function entryOf(card: VCardObject): ContactEntry {
  return {
    ...parseVCard(card.data, card.url),
    url: card.url,
    etag: card.etag,
    bookUrl: card.addressBookUrl,
  }
}
function cardOf(c: ContactEntry): VCardObject {
  return { url: c.url, addressBookUrl: c.bookUrl, etag: c.etag, data: c.raw }
}

export const useContactsStore = defineStore('contacts', () => {
  const auth = useAuthStore()
  const calendars = useCalendarsStore()
  const history = useHistoryStore()

  const books = shallowRef<AddressBook[]>([])
  const contacts = shallowRef<ContactEntry[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const error = ref<string | null>(null)

  /** Visible books' contacts, sorted by name (family name first). */
  const sorted = computed(() =>
    contacts.value
      .filter((c) => calendars.isVisible(c.bookUrl))
      .map((c) => ({ c, key: sortKey(c) }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(({ c }) => c),
  )

  /** Every label used, for the filter and the edit form's suggestions. */
  const categories = computed(() =>
    [...new Set(contacts.value.flatMap((c) => c.categories))].sort((a, b) => a.localeCompare(b)),
  )

  function bookColor(url: string): string {
    const i = books.value.findIndex((b) => b.url === url)
    return BOOK_COLORS[(i < 0 ? 0 : i) % BOOK_COLORS.length]!
  }
  function book(url: string): AddressBook | undefined {
    return books.value.find((b) => b.url === url)
  }
  function get(url: string): ContactEntry | undefined {
    return contacts.value.find((c) => c.url === url)
  }

  let inFlight: Promise<void> | null = null
  function load(): Promise<void> {
    if (inFlight) return inFlight
    status.value = 'loading'
    inFlight = (async () => {
      try {
        const client = auth.requireClient()
        const list = await client.listAddressBooks()
        const cards = (await Promise.all(list.map((b) => client.fetchVCards(b)))).flat()
        books.value = list
        contacts.value = cards.map(entryOf)
        status.value = 'ready'
        error.value = null
      } catch (err) {
        status.value = 'error'
        error.value = err instanceof Error ? err.message : String(err)
        throw err
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }
  async function ensureLoaded() {
    if (status.value === 'idle') await load().catch(() => {})
  }

  function put(entry: ContactEntry) {
    const others = contacts.value.filter((c) => c.url !== entry.url)
    contacts.value = [...others, entry]
  }
  function drop(url: string) {
    contacts.value = contacts.value.filter((c) => c.url !== url)
  }
  /** Calendar birthdays come from the same cards. */
  function birthdaysChanged() {
    void useBirthdaysStore().load()
  }

  function requireBook(url: string): AddressBook {
    const b = book(url)
    if (!b) throw new Error('That address book is gone')
    return b
  }

  async function writeNew(bookUrl: string, vcf: string, uid: string): Promise<ContactEntry> {
    const card = await auth.requireClient().createVCard(requireBook(bookUrl), vcf, uid)
    const entry = entryOf(card)
    put(entry)
    return entry
  }

  async function create(bookUrl: string, fields: ContactFields): Promise<ContactEntry> {
    const uid = newUid()
    const entry = await writeNew(bookUrl, serializeVCard(fields, { uid }), uid)
    birthdaysChanged()
    history.record(`Added ${displayName(entry)}`, entry.url, () => removeQuietly(entry.url))
    return entry
  }

  async function update(contact: ContactEntry, fields: ContactFields): Promise<ContactEntry> {
    const before = get(contact.url) ?? contact
    const vcf = serializeVCard(fields, { uid: before.uid, base: before.raw })
    const card = await auth.requireClient().updateVCard(cardOf(before), vcf)
    const entry = entryOf(card)
    put(entry)
    birthdaysChanged()
    history.record(`Edited ${displayName(entry)}`, entry.url, async () => {
      const now = get(entry.url)
      if (!now) return
      put(entryOf(await auth.requireClient().updateVCard(cardOf(now), before.raw)))
      birthdaysChanged()
    })
    return entry
  }

  async function removeQuietly(url: string) {
    const c = get(url)
    if (!c) return
    await auth.requireClient().deleteVCard(cardOf(c))
    drop(url)
    birthdaysChanged()
  }

  async function remove(contact: ContactEntry): Promise<void> {
    const before = get(contact.url) ?? contact
    await auth.requireClient().deleteVCard(cardOf(before))
    drop(before.url)
    birthdaysChanged()
    history.record(`Deleted ${displayName(before)}`, before.url, async () => {
      const card = await auth
        .requireClient()
        .restoreVCard(requireBook(before.bookUrl), before.url, before.raw)
      put(entryOf(card))
      birthdaysChanged()
    })
  }

  /**
   * Adds every card of a .vcf file to a book. A card whose UID is already in the book gets a new
   * one, so importing the same file twice makes copies rather than failing. Returns how many.
   */
  async function importText(bookUrl: string, text: string): Promise<number> {
    const taken = new Set(contacts.value.filter((c) => c.bookUrl === bookUrl).map((c) => c.uid))
    const added: string[] = []
    for (const raw of splitVCards(text)) {
      const parsed = parseVCard(raw)
      const uid = parsed.uid && !taken.has(parsed.uid) ? parsed.uid : newUid()
      taken.add(uid)
      const vcf = serializeVCard(parsed, { uid, base: raw })
      added.push((await writeNew(bookUrl, vcf, uid)).url)
    }
    if (added.length) {
      birthdaysChanged()
      history.record(
        `Imported ${added.length} ${added.length === 1 ? 'contact' : 'contacts'}`,
        `import:${added[0]}`,
        async () => {
          for (const url of added) await removeQuietly(url)
        },
      )
    }
    return added.length
  }

  function reset() {
    books.value = []
    contacts.value = []
    status.value = 'idle'
    error.value = null
  }
  auth.onDisconnect(reset)

  return {
    books,
    contacts,
    sorted,
    categories,
    status,
    error,
    bookColor,
    book,
    get,
    load,
    ensureLoaded,
    create,
    update,
    remove,
    importText,
  }
})
