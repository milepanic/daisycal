import { describe, expect, it } from 'vitest'

import { classifyCollection, normalizeColor, toCollection } from '../collections'

const comp = (...names: string[]) => ({
  comp: names.map((name) => ({ _attributes: { name } })),
})

describe('classifyCollection', () => {
  it('accepts a Calendar (VEVENT only) collection', () => {
    expect(
      classifyCollection({
        resourcetype: { collection: {}, calendar: {} },
        supportedCalendarComponentSet: comp('VEVENT'),
      }),
    ).toBe('calendar')
  })

  it('accepts a Tasks (VTODO only) collection', () => {
    expect(
      classifyCollection({
        resourcetype: { collection: {}, calendar: {} },
        supportedCalendarComponentSet: { comp: { _attributes: { name: 'VTODO' } } },
      }),
    ).toBe('tasks')
  })

  it('rejects a mixed "Calendar and Tasks" collection', () => {
    expect(
      classifyCollection({
        resourcetype: { collection: {}, calendar: {} },
        supportedCalendarComponentSet: comp('VEVENT', 'VTODO'),
      }),
    ).toBeNull()
  })

  it('rejects an address book', () => {
    expect(
      classifyCollection({
        resourcetype: { collection: {}, addressbook: {} },
      }),
    ).toBeNull()
  })

  it('rejects a journal collection', () => {
    expect(
      classifyCollection({
        resourcetype: { collection: {}, calendar: {} },
        supportedCalendarComponentSet: comp('VJOURNAL'),
      }),
    ).toBeNull()
  })

  it('rejects a calendar without a declared component set', () => {
    expect(classifyCollection({ resourcetype: { collection: {}, calendar: {} } })).toBeNull()
  })

  it('rejects the calendar home itself and plain collections', () => {
    expect(classifyCollection({ resourcetype: { collection: {} } })).toBeNull()
    expect(classifyCollection({ resourcetype: { principal: {} } })).toBeNull()
    expect(classifyCollection(undefined)).toBeNull()
  })
})

describe('normalizeColor', () => {
  it('keeps #rrggbb, strips Apple alpha suffix, rejects garbage', () => {
    expect(normalizeColor('#225688')).toBe('#225688')
    expect(normalizeColor('#225688FF')).toBe('#225688')
    expect(normalizeColor({ _text: '#ABCDEF' })).toBe('#abcdef')
    expect(normalizeColor('red')).toBeNull()
    expect(normalizeColor(undefined)).toBeNull()
  })
})

describe('toCollection', () => {
  it('builds an absolute URL and falls back to the slug when displayname is empty', () => {
    const c = toCollection(
      {
        href: '/dav/daisy/work/',
        status: 207,
        statusText: 'Multi-Status',
        ok: true,
        props: {
          resourcetype: { collection: {}, calendar: {} },
          supportedCalendarComponentSet: comp('VEVENT'),
          displayname: '',
          calendarColor: '#225688',
          getctag: '"abc"',
        },
      },
      'https://daisycal.home/dav/',
    )
    expect(c).toEqual({
      url: 'https://daisycal.home/dav/daisy/work/',
      kind: 'calendar',
      displayName: 'work',
      color: '#225688',
      ctag: '"abc"',
      syncToken: null,
    })
  })
})
