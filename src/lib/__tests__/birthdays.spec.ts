import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import EventPopover from '@/components/calendar/EventPopover.vue'
import { useAuthStore } from '@/stores/auth'
import { useBirthdaysStore } from '@/stores/birthdays'
import { useCalendarsStore } from '@/stores/calendars'
import { FakeClient } from '@/stores/__tests__/fakeClient'
import { BIRTHDAYS_URL, birthdayInstances, parseBirthday } from '../birthdays'

const card = (lines: string) => `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:u1\r\n${lines}\r\nEND:VCARD\r\n`

describe('contact birthdays', () => {
  it('reads the usual BDAY forms', () => {
    const read = (bday: string, name = 'FN:Ana Petrović') => {
      const b = parseBirthday(card(`${name}\r\n${bday}`))
      return b && [b.name, b.year, b.month, b.day]
    }
    expect(read('BDAY:19900315')).toEqual(['Ana Petrović', 1990, 3, 15])
    expect(read('BDAY;VALUE=date:1990-03-15')).toEqual(['Ana Petrović', 1990, 3, 15])
    expect(read('BDAY:1990-03-15T00:00:00Z')).toEqual(['Ana Petrović', 1990, 3, 15])
    // No year: vCard 4 "--MMDD" and Apple's placeholder year.
    expect(read('BDAY:--0315')).toEqual(['Ana Petrović', null, 3, 15])
    expect(read('BDAY:--03-15')).toEqual(['Ana Petrović', null, 3, 15])
    expect(read('BDAY;X-APPLE-OMIT-YEAR=1604:1604-03-15')).toEqual(['Ana Petrović', null, 3, 15])
    // Grouped property, escaped and folded name, N when there is no FN.
    expect(read('item1.BDAY:2000-01-02', 'FN:Marko\\, Jr.')).toEqual(['Marko, Jr.', 2000, 1, 2])
    expect(read('BDAY:2000-01-02', 'N:Petrović;Ana;;;')).toEqual(['Ana Petrović', 2000, 1, 2])
    expect(parseBirthday(card('FN:No birthday'))).toBeNull()
    expect(parseBirthday(card('FN:X\r\nBDAY:not a date'))).toBeNull()
  })

  it('makes read-only all-day events with the age, 29 Feb on the 28th in other years', () => {
    const list = [
      { uid: 'a', name: 'Ana', month: 3, day: 15, year: 1990 },
      { uid: 'l', name: 'Leap', month: 2, day: 29, year: null },
    ]
    const range = { start: new Date(2027, 1, 1), end: new Date(2027, 3, 1) }
    const out = birthdayInstances(list, range)
    expect(out.map((i) => [i.summary, i.start.getMonth() + 1, i.start.getDate()])).toEqual([
      ['🎂 Leap', 2, 28],
      ['🎂 Ana (37)', 3, 15],
    ])
    expect(out[0]).toMatchObject({ allDay: true, readOnly: true, collectionUrl: BIRTHDAYS_URL })
    // Not before the person was born.
    expect(
      birthdayInstances(list, { start: new Date(1989, 0, 1), end: new Date(1989, 11, 31) }).map(
        (i) => i.summary,
      ),
    ).toEqual(['🎂 Leap'])
  })

  it('loads from the address books, can be hidden, and shows no Edit or Delete', async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    const client = new FakeClient()
    client.vcards.set('https://dav.test/daisy/contacts/', [
      card('FN:Ana Petrović\r\nBDAY:1990-11-12'),
      card('FN:Ana again (same UID)\r\nBDAY:1990-11-12'),
      'BEGIN:VCARD\r\nVERSION:3.0\r\nUID:u2\r\nFN:No date\r\nEND:VCARD',
    ])
    useAuthStore()._setClient(client)
    await useCalendarsStore().load()
    const store = useBirthdaysStore()
    await store.load()
    expect(store.birthdays.map((b) => b.name)).toEqual(['Ana Petrović'])
    expect(store.collection?.displayName).toBe('Contact birthdays')
    const week = { start: new Date(2026, 10, 9), end: new Date(2026, 10, 16) }
    const [ana] = store.instancesFor(week)
    expect(ana!.summary).toBe('🎂 Ana Petrović (36)')
    useCalendarsStore().setVisible(BIRTHDAYS_URL, false)
    expect(store.instancesFor(week)).toEqual([])

    const popover = mount(EventPopover, { props: { instance: ana! } })
    expect(popover.text()).toContain('Contact birthdays')
    expect(popover.text()).toContain('From your contacts')
    expect(popover.findAll('button').map((b) => b.text())).not.toContain('Edit')
    expect(popover.findAll('button').map((b) => b.text())).not.toContain('Delete')
  })
})
