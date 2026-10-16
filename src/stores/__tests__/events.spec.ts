import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ConflictError, NetworkError } from '@/api/errors'
import { eventToForm } from '@/api/ical'
import { useAuthStore } from '../auth'
import { useCalendarsStore } from '../calendars'
import { useEventsStore } from '../events'
import { FakeClient, PERSONAL, WORK, eventIcs } from './fakeClient'

let client: FakeClient
const OCT = { start: new Date(2026, 9, 12), end: new Date(2026, 9, 19) }

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  client = new FakeClient()
  client.seed(
    WORK,
    'standup',
    eventIcs(
      'standup',
      'Standup',
      '20261012T073000Z',
      '20261012T074500Z',
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR\r\n',
    ),
  )
  client.seed(WORK, 'review', eventIcs('review', 'Review', '20261014T120000Z', '20261014T130000Z'))
  client.seed(PERSONAL, 'gym', eventIcs('gym', 'Gym', '20261013T060000Z', '20261013T070000Z'))
  client.seed(
    PERSONAL,
    'nov',
    eventIcs('nov', 'November thing', '20261105T120000Z', '20261105T130000Z'),
  )
  useAuthStore()._setClient(client)
  await useCalendarsStore().load()
})

describe('events store', () => {
  it('loads months per calendar once and expands visible instances', async () => {
    const events = useEventsStore()
    const loading = events.ensureLoaded(OCT)
    expect(events.isLoading(OCT)).toBe(true)
    await loading
    expect(events.isLoading(OCT)).toBe(false)
    expect(client.fetchEvents).toHaveBeenCalledTimes(2) // Work + Personal, one month each
    const instances = events.instancesFor(OCT)
    expect(instances.map((i) => i.summary)).toEqual([
      'Standup',
      'Gym',
      'Standup',
      'Review',
      'Standup',
    ])
    await events.ensureLoaded(OCT)
    expect(client.fetchEvents).toHaveBeenCalledTimes(2)
    // Another month triggers only the missing chunks.
    await events.ensureLoaded({ start: new Date(2026, 10, 2), end: new Date(2026, 10, 9) })
    expect(client.fetchEvents).toHaveBeenCalledTimes(4)
    expect(
      events
        .instancesFor({ start: new Date(2026, 10, 2), end: new Date(2026, 10, 9) })
        .map((i) => i.summary),
    ).toEqual(['Standup', 'Standup', 'November thing', 'Standup'])
  })

  it('hides instances of hidden calendars without refetching', async () => {
    const events = useEventsStore()
    await events.ensureLoaded(OCT)
    useCalendarsStore().setVisible(PERSONAL.url, false)
    expect(events.instancesFor(OCT).map((i) => i.summary)).not.toContain('Gym')
    expect(events.instancesFor(OCT, { includeHidden: true }).map((i) => i.summary)).toContain('Gym')
    expect(client.fetchEvents).toHaveBeenCalledTimes(2)
  })

  it('creates optimistically and keeps the server copy', async () => {
    const events = useEventsStore()
    await events.ensureLoaded(OCT)
    const pending = events.createEvent(WORK, {
      summary: 'New',
      description: '',
      location: '',
      start: new Date(2026, 9, 15, 10),
      end: new Date(2026, 9, 15, 11),
      allDay: false,
      repeat: null,
      alarm: null,
    })
    expect(events.instancesFor(OCT).map((i) => i.summary)).toContain('New')
    const doc = await pending
    expect(doc.object.etag).toMatch(/^"e\d+"$/)
    expect(events.getDocument(doc.object.url)?.object.etag).toBe(doc.object.etag)
    expect(client.objects.has(doc.object.url)).toBe(true)
  })

  it('rolls back a failed create', async () => {
    const events = useEventsStore()
    await events.ensureLoaded(OCT)
    client.failNext = { op: 'create', error: new NetworkError('x') }
    await expect(
      events.createEvent(WORK, {
        summary: 'Doomed',
        description: '',
        location: '',
        start: new Date(2026, 9, 15, 10),
        end: new Date(2026, 9, 15, 11),
        allDay: false,
        repeat: null,
        alarm: null,
      }),
    ).rejects.toBeInstanceOf(NetworkError)
    expect(events.instancesFor(OCT).map((i) => i.summary)).not.toContain('Doomed')
  })

  it('updates with scope this/all and deletes one occurrence or the whole series', async () => {
    const events = useEventsStore()
    await events.ensureLoaded(OCT)
    const wed = events
      .instancesFor(OCT)
      .find((i) => i.summary === 'Standup' && i.start.getDay() === 3)!
    await events.updateEvent(wed, { ...eventToForm(wed), summary: 'Standup (demo)' }, 'this')
    let names = events
      .instancesFor(OCT)
      .filter((i) => i.uid === 'standup')
      .map((i) => i.summary)
    expect(names).toEqual(['Standup', 'Standup (demo)', 'Standup'])

    const mon = events.instancesFor(OCT).find((i) => i.uid === 'standup' && i.start.getDay() === 1)!
    await events.updateEvent(mon, { ...eventToForm(mon), alarm: 5 }, 'all')
    expect(events.instancesFor(OCT).find((i) => i.uid === 'standup' && !i.isException)?.alarm).toBe(
      5,
    )
    expect(events.instancesFor(OCT).find((i) => i.isException)?.summary).toBe('Standup (demo)')

    const fri = events.instancesFor(OCT).find((i) => i.uid === 'standup' && i.start.getDay() === 5)!
    await events.deleteEvent(fri, 'this')
    names = events
      .instancesFor(OCT)
      .filter((i) => i.uid === 'standup')
      .map((i) => i.summary)
    expect(names).toEqual(['Standup', 'Standup (demo)'])
    expect(client.objects.get(fri.objectUrl)!.data).toContain('EXDATE')

    await events.deleteEvent(
      events.instancesFor(OCT).find((i) => i.uid === 'standup')!,
      'all',
    )
    expect(events.instancesFor(OCT).some((i) => i.uid === 'standup')).toBe(false)
    expect(client.objects.has(fri.objectUrl)).toBe(false)
  })

  it('rolls back on conflict, reloads the server copy and rethrows', async () => {
    const events = useEventsStore()
    await events.ensureLoaded(OCT)
    const review = events.instancesFor(OCT).find((i) => i.summary === 'Review')!
    // The phone edits the same object meanwhile.
    const server = client.objects.get(review.objectUrl)!
    client.objects.set(review.objectUrl, {
      ...server,
      etag: '"phone"',
      data: server.data.replace('SUMMARY:Review', 'SUMMARY:Review (phone)'),
    })

    await expect(
      events.updateEvent(review, { ...eventToForm(review), summary: 'Review (web)' }),
    ).rejects.toBeInstanceOf(ConflictError)
    const after = events.instancesFor(OCT).find((i) => i.uid === 'review')!
    expect(after.summary).toBe('Review (phone)')
    expect(after.etag).toBe('"phone"')
    // Retrying with the fresh instance works.
    await events.updateEvent(after, { ...eventToForm(after), summary: 'Review (merged)' })
    expect(events.instancesFor(OCT).find((i) => i.uid === 'review')?.summary).toBe(
      'Review (merged)',
    )
  })

  it('restores a deleted event when the delete fails', async () => {
    const events = useEventsStore()
    await events.ensureLoaded(OCT)
    const gym = events.instancesFor(OCT).find((i) => i.summary === 'Gym')!
    client.failNext = { op: 'delete', error: new NetworkError('x') }
    await expect(events.deleteEvent(gym)).rejects.toBeInstanceOf(NetworkError)
    expect(events.instancesFor(OCT).some((i) => i.summary === 'Gym')).toBe(true)
  })

  it('moves an event to another calendar', async () => {
    const events = useEventsStore()
    await events.ensureLoaded(OCT)
    const gym = events.instancesFor(OCT).find((i) => i.summary === 'Gym')!
    const moved = await events.moveEvent(gym, WORK)
    expect(moved.object.collectionUrl).toBe(WORK.url)
    expect(moved.uid).toBe('gym')
    expect(client.objects.has(gym.objectUrl)).toBe(false)
    expect(events.instancesFor(OCT).find((i) => i.summary === 'Gym')?.collectionUrl).toBe(WORK.url)
  })

  it('refresh refetches loaded months and drops objects the server removed', async () => {
    const events = useEventsStore()
    await events.ensureLoaded(OCT)
    client.objects.delete(`${WORK.url}review.ics`)
    client.seed(WORK, 'late', eventIcs('late', 'Late add', '20261016T150000Z', '20261016T160000Z'))
    await events.refresh([WORK.url])
    const names = events.instancesFor(OCT).map((i) => i.summary)
    expect(names).not.toContain('Review')
    expect(names).toContain('Late add')
    expect(client.fetchEvents).toHaveBeenCalledTimes(3)
    events.invalidate()
    expect(events.count).toBe(0)
  })

  it('records load errors per range and retries on the next ensureLoaded', async () => {
    const events = useEventsStore()
    client.failNext = { op: 'fetch', error: new NetworkError('down') }
    await events.ensureLoaded(OCT)
    expect(events.loadError(OCT)).toBe('Server unreachable')
    await events.ensureLoaded(OCT)
    expect(events.loadError(OCT)).toBeNull()
    expect(events.instancesFor(OCT).length).toBeGreaterThan(0)
  })
})
