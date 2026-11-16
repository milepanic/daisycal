import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import ContactList from '@/components/contacts/ContactList.vue'
import { parseVCard } from '@/lib/vcard'
import type { ContactEntry } from '@/stores/contacts'

const entry = (uid: string, lines: string): ContactEntry => ({
  ...parseVCard(`BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${uid}\r\n${lines}END:VCARD\r\n`),
  url: `https://x/${uid}.vcf`,
  etag: '"1"',
  bookUrl: 'https://x/',
})

// Sorted as the store hands them over (by name as shown).
const CONTACTS = [
  entry('a', 'FN:Amra Hadžić\r\nN:Hadžić;Amra;;;\r\nCATEGORIES:Work\r\n'),
  entry('c', 'FN:Auto servis\r\nORG:Auto servis\r\n'),
  entry('b', 'FN:Jelena Babić\r\nN:Babić;Jelena;;;\r\nTEL:+387 66 401 223\r\n'),
]

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('ContactList', () => {
  it('groups by letter, searches ignoring accents and by phone digits, filters by label', async () => {
    const wrapper = mount(ContactList, {
      props: {
        contacts: CONTACTS,
        categories: ['Work'],
        selectedUrl: null,
      },
    })
    const names = () => wrapper.findAll('[data-testid="contact-row"]').map((r) => r.text())
    expect(wrapper.findAll('h3').map((h) => h.text())).toEqual(['A', 'J'])
    // A business shown by its name does not repeat it underneath.
    // (initials, then the name; no subtitle)
    expect(names()[1]).toBe('ASAuto servis')

    await wrapper.find('[data-testid="contact-search"]').setValue('hadzic')
    expect(names()).toHaveLength(1)
    await wrapper.find('[data-testid="contact-search"]').setValue('401 223')
    expect(names()[0]).toContain('Jelena')

    await wrapper.find('[data-testid="contact-search"]').setValue('')
    const work = wrapper.findAll('[data-testid="label-filter"]').find((b) => b.text() === 'Work')!
    await work.trigger('click')
    expect(names()).toHaveLength(1)
    expect(names()[0]).toContain('Amra')

    await wrapper.findAll('[data-testid="contact-row"]')[0]!.trigger('click')
    // (the only row left is Amra's)
    expect(wrapper.emitted('select')![0]).toEqual(['https://x/a.vcf'])
  })
})
