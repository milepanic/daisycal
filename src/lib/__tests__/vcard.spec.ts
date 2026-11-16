import { describe, expect, it } from 'vitest'

import {
  displayName,
  emptyFields,
  initials,
  nextBirthday,
  parseVCard,
  serializeVCard,
  sortKey,
  splitVCards,
} from '../vcard'

const APPLE = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'PRODID:-//Apple Inc.//iPhone OS 17.0//EN',
  'N:Petrović;Ana;;;',
  'FN:Ana Petrović',
  'ORG:Vertex IT;Design',
  'TITLE:Product designer',
  'item1.EMAIL;type=INTERNET;type=pref:ana@example.com',
  'item1.X-ABLabel:_$!<Other>!$_',
  'EMAIL;type=INTERNET;type=WORK:ana@vertex.example',
  'TEL;type=CELL;type=VOICE;type=pref:+387 61 111 222',
  'TEL;type=WORK;type=VOICE:+387 33 444 555',
  'ADR;type=HOME:;;Ferhadija 1;Sarajevo;;71000;Bosnia and Herzegovina',
  'NOTE:Met at the conference\\, 2024.\\nLikes coffee.',
  'BDAY;X-APPLE-OMIT-YEAR=1604:1604-03-15',
  'CATEGORIES:Friends,Work',
  'X-SOCIALPROFILE;type=twitter:https://twitter.com/ana',
  'UID:ana-1',
  'END:VCARD',
].join('\r\n')

describe('parseVCard', () => {
  it('reads an Apple card', () => {
    const c = parseVCard(APPLE)
    expect(c).toMatchObject({
      uid: 'ana-1',
      version: '3.0',
      fullName: 'Ana Petrović',
      givenName: 'Ana',
      familyName: 'Petrović',
      org: 'Vertex IT, Design',
      title: 'Product designer',
      birthday: '--03-15',
      note: 'Met at the conference, 2024.\nLikes coffee.',
      categories: ['Friends', 'Work'],
    })
    expect(c.emails).toEqual([
      { type: 'other', value: 'ana@example.com' },
      { type: 'work', value: 'ana@vertex.example' },
    ])
    expect(c.phones).toEqual([
      { type: 'mobile', value: '+387 61 111 222' },
      { type: 'work', value: '+387 33 444 555' },
    ])
    expect(c.addresses[0]).toEqual({
      type: 'home',
      street: 'Ferhadija 1',
      city: 'Sarajevo',
      region: '',
      postcode: '71000',
      country: 'Bosnia and Herzegovina',
    })
  })

  it('reads vCard 4 dates, data URI photos and folded lines', () => {
    const c = parseVCard(
      [
        'BEGIN:VCARD',
        'VERSION:4.0',
        'FN:Marko',
        'BDAY:19880704',
        'PHOTO:data:image/png;base64,iVBO',
        ' Rw0K',
        'END:VCARD',
      ].join('\r\n'),
      'fallback',
    )
    expect(c).toMatchObject({
      uid: 'fallback',
      version: '4.0',
      birthday: '1988-07-04',
      photo: 'data:image/png;base64,iVBORw0K',
    })
    const v3 = parseVCard('BEGIN:VCARD\r\nPHOTO;ENCODING=b;TYPE=JPEG:/9j/4A\r\nEND:VCARD')
    expect(v3.photo).toBe('data:image/jpeg;base64,/9j/4A')
  })

  it('splits a multi-card export', () => {
    expect(splitVCards(`${APPLE}\r\n${APPLE}\r\n`)).toHaveLength(2)
  })
})

describe('serializeVCard', () => {
  it('round-trips the edited fields and keeps everything else', () => {
    const c = parseVCard(APPLE)
    const out = serializeVCard(
      { ...c, title: 'Lead designer', emails: [c.emails[1]!] },
      { uid: c.uid, base: c.raw, now: new Date(Date.UTC(2026, 10, 16, 12)) },
    )
    // Unedited properties survive; the dropped e-mail takes its Apple label with it.
    expect(out).toContain('PRODID:-//Apple Inc.//iPhone OS 17.0//EN')
    expect(out).toContain('X-SOCIALPROFILE;type=twitter:https://twitter.com/ana')
    expect(out).not.toContain('X-ABLabel')
    expect(out).not.toContain('ana@example.com')
    expect(out).toContain('REV:20261116T120000Z')
    expect(out).toContain('BDAY;X-APPLE-OMIT-YEAR=1604:1604-03-15')
    const back = parseVCard(out)
    expect(back).toMatchObject({
      uid: 'ana-1',
      title: 'Lead designer',
      note: c.note,
      org: 'Vertex IT, Design',
      birthday: '--03-15',
    })
    expect(back.emails).toEqual([{ type: 'work', value: 'ana@vertex.example' }])
    expect(back.phones).toEqual(c.phones)
    expect(back.addresses).toEqual(c.addresses)
  })

  it('writes a new card, folding long lines', () => {
    const fields = {
      ...emptyFields(),
      givenName: 'Lena',
      familyName: 'Kovač',
      birthday: '1992-01-30',
      note: 'x'.repeat(200),
    }
    const out = serializeVCard(fields, { uid: 'lena' })
    expect(out.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true)
    expect(out).toContain('FN:Lena Kovač')
    expect(out).toContain('N:Kovač;Lena;;;')
    expect(out).toContain('BDAY;VALUE=date:1992-01-30')
    for (const line of out.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(parseVCard(out).note).toBe('x'.repeat(200))
  })
})

describe('names and birthdays', () => {
  it('derives display name, sort key and initials', () => {
    const c = { ...emptyFields(), givenName: 'Đorđe', familyName: 'Šimić' }
    expect(displayName(c)).toBe('Đorđe Šimić')
    // By the name as shown; accents are ignored (Đ has no decomposition and stays).
    expect(sortKey(c)).toBe('đorđe simic')
    expect(sortKey({ ...emptyFields(), prefix: 'Dr.', givenName: 'Mirela' })).toBe('mirela')
    expect(initials(c)).toBe('ĐŠ')
    expect(displayName({ ...emptyFields(), org: 'Acme' })).toBe('Acme')
    expect(initials({ ...emptyFields(), org: 'Acme Corp' })).toBe('AC')
  })

  it('finds the next birthday and the age then', () => {
    const today = new Date(2026, 10, 16)
    expect(nextBirthday('1990-11-20', today)).toMatchObject({ turns: 36, inDays: 4 })
    expect(nextBirthday('1990-11-16', today)).toMatchObject({ turns: 36, inDays: 0 })
    expect(nextBirthday('--03-15', today)).toMatchObject({ turns: null })
    expect(nextBirthday('--03-15', today)!.date.getFullYear()).toBe(2027)
    expect(nextBirthday('', today)).toBeNull()
  })
})
