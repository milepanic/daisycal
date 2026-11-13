/**
 * Birthdays from the contacts on the same server (CardDAV, read only). Loaded with the
 * calendars and again on Refresh; without address books or birthdays nothing shows.
 */
import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import type { Collection } from '@/api/collections'
import {
  BIRTHDAYS_COLOR,
  BIRTHDAYS_NAME,
  BIRTHDAYS_URL,
  type Birthday,
  birthdayInstances,
  parseBirthday,
} from '@/lib/birthdays'
import type { DateRange } from '@/lib/dates'
import { useAuthStore } from './auth'
import { useCalendarsStore } from './calendars'

export const useBirthdaysStore = defineStore('birthdays', () => {
  const auth = useAuthStore()
  const calendars = useCalendarsStore()
  const birthdays = shallowRef<Birthday[]>([])
  const error = shallowRef<string | null>(null)

  async function load() {
    try {
      const client = auth.requireClient()
      const books = await client.listAddressBooks()
      const cards = (await Promise.all(books.map((b) => client.fetchVCards(b)))).flat()
      const seen = new Set<string>()
      const list: Birthday[] = []
      for (const card of cards) {
        const b = parseBirthday(card.data, card.url)
        if (!b || seen.has(b.uid)) continue
        seen.add(b.uid)
        list.push(b)
      }
      birthdays.value = list
      error.value = null
    } catch (err) {
      // Contacts are a nicety: a server without CardDAV just shows no birthdays.
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  /** The sidebar entry, only when there is something to show. */
  const collection = computed<Collection | null>(() =>
    birthdays.value.length
      ? {
          url: BIRTHDAYS_URL,
          kind: 'calendar',
          displayName: BIRTHDAYS_NAME,
          color: BIRTHDAYS_COLOR,
          ctag: null,
          syncToken: null,
        }
      : null,
  )

  function instancesFor(range: DateRange) {
    if (!calendars.isVisible(BIRTHDAYS_URL)) return []
    return birthdayInstances(birthdays.value, range)
  }

  function reset() {
    birthdays.value = []
    error.value = null
  }
  auth.onDisconnect(reset)

  return { birthdays, error, collection, load, instancesFor }
})
