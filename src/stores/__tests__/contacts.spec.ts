import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { emptyFields } from '@/lib/vcard'
import { useAuthStore } from '../auth'
import { useCalendarsStore } from '../calendars'
import { useContactsStore } from '../contacts'
import { useHistoryStore } from '../history'
import { useUiStore } from '../ui'
import { FakeClient, SERVER } from './fakeClient'

const BOOK = `${SERVER}daisy/contacts/`
const card = (uid: string, fn: string, extra = '') =>
  `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${uid}\r\nFN:${fn}\r\nN:${fn.split(' ').reverse().join(';')};;;\r\n${extra}END:VCARD\r\n`

let client: FakeClient

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  client = new FakeClient()
  client.vcards.set(BOOK, [])
  client.cards.set(`${BOOK}zoran.vcf`, {
    addressBookUrl: BOOK,
    etag: '"z"',
    data: card('zoran', 'Zoran Babić', 'EMAIL;TYPE=WORK:zoran@example.com\r\n'),
  })
  client.cards.set(`${BOOK}ana.vcf`, {
    addressBookUrl: BOOK,
    etag: '"a"',
    data: card('ana', 'Ana Kovač', 'CATEGORIES:Family\r\n'),
  })
  useAuthStore()._setClient(client)
  await useCalendarsStore().load()
})

describe('contacts store', () => {
  it('loads books and sorts by name as shown', async () => {
    const contacts = useContactsStore()
    await contacts.ensureLoaded()
    expect(contacts.books.map((b) => b.url)).toEqual([BOOK])
    expect(contacts.sorted.map((c) => c.fullName)).toEqual(['Ana Kovač', 'Zoran Babić'])
    // Settings: by last name.
    useUiStore().contactSort = 'last'
    expect(contacts.sorted.map((c) => c.fullName)).toEqual(['Zoran Babić', 'Ana Kovač'])
    expect(contacts.categories).toEqual(['Family'])
    // A hidden book hides its contacts.
    useCalendarsStore().setVisible(BOOK, false)
    expect(contacts.sorted).toEqual([])
  })

  it('creates, edits and deletes, each undoable', async () => {
    const contacts = useContactsStore()
    const history = useHistoryStore()
    await contacts.ensureLoaded()

    const lena = await contacts.create(BOOK, {
      ...emptyFields(),
      givenName: 'Lena',
      familyName: 'Marić',
      phones: [{ type: 'mobile', value: '+387 61 000 000' }],
    })
    expect(client.cards.get(lena.url)!.data).toContain('TEL;TYPE=CELL,VOICE:+387 61 000 000')
    expect(contacts.sorted.map((c) => c.fullName)).toContain('Lena Marić')

    const edited = await contacts.update(lena, { ...lena, title: 'Architect' })
    expect(edited.title).toBe('Architect')
    expect(client.cards.get(lena.url)!.data).toContain('TITLE:Architect')

    // Edited right after adding: one undo step takes both back (as with events).
    await history.undo()
    expect(contacts.get(lena.url)).toBeUndefined()
    expect(client.cards.has(lena.url)).toBe(false)

    const zoran = contacts.sorted.find((c) => c.uid === 'zoran')!
    await contacts.remove(zoran)
    expect(client.cards.has(zoran.url)).toBe(false)
    expect(contacts.get(zoran.url)).toBeUndefined()
    await history.undo()
    expect(client.cards.get(zoran.url)!.data).toContain('zoran@example.com')
    expect(contacts.get(zoran.url)!.emails).toEqual([{ type: 'work', value: 'zoran@example.com' }])
  })

  it('imports a .vcf file, giving duplicate UIDs new ones', async () => {
    const contacts = useContactsStore()
    await contacts.ensureLoaded()
    const n = await contacts.importText(
      BOOK,
      card('ana', 'Ana Kovač') + card('new-1', 'Iva Ivić') + card('new-1', 'Iva Ivić'),
    )
    expect(n).toBe(3)
    const anas = contacts.contacts.filter((c) => c.fullName === 'Ana Kovač')
    expect(anas).toHaveLength(2)
    expect(new Set(anas.map((c) => c.uid)).size).toBe(2)
    expect(contacts.contacts.filter((c) => c.uid === 'new-1')).toHaveLength(1)
    await useHistoryStore().undo()
    expect(contacts.contacts).toHaveLength(2)
  })
})
