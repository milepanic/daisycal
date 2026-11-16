/**
 * vCard (RFC 6350 / 2426) for the Contacts page: parse a card into the fields the page edits,
 * and write them back without losing anything else the card carries (Apple / Android extras,
 * photos, groups). Versions 3.0 and 4.0 are read; a card keeps its version when written, and new
 * cards are 3.0 (what Apple Contacts, DAVx⁵ and Thunderbird all read).
 */

export type FieldType = 'home' | 'work' | 'mobile' | 'other'

export interface ContactValue {
  type: FieldType
  value: string
}

export interface ContactAddress {
  type: FieldType
  street: string
  city: string
  region: string
  postcode: string
  country: string
}

/** What the page shows and edits. */
export interface ContactFields {
  /** Formatted name (FN). Derived from the parts when left empty. */
  fullName: string
  prefix: string
  givenName: string
  middleName: string
  familyName: string
  suffix: string
  nickname: string
  org: string
  title: string
  emails: ContactValue[]
  phones: ContactValue[]
  addresses: ContactAddress[]
  urls: string[]
  /** `YYYY-MM-DD`, or `--MM-DD` without a year; empty for none. */
  birthday: string
  note: string
  /** Labels (CATEGORIES). */
  categories: string[]
  /** A data: or http(s): URL, or empty. */
  photo: string
}

export interface Contact extends ContactFields {
  uid: string
  /** The vCard version it was read as ('3.0' / '4.0'). */
  version: string
  /** The card as read (everything the page does not edit is kept from it). */
  raw: string
}

// ---- lines -----------------------------------------------------------------------------------

interface Prop {
  group: string
  name: string
  /** Upper-cased parameter names; values unquoted. A name can repeat (TYPE=a;TYPE=b). */
  params: [string, string][]
  value: string
  /** The line as read (unfolded), written back as-is when the property is not edited. */
  line: string
}

/** Joins folded lines (RFC 6350 §3.2) and splits into content lines. */
function unfold(text: string): string[] {
  return text
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
}

/** Splits at `sep` outside double quotes. */
function splitOutsideQuotes(s: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of s) {
    if (ch === '"') quoted = !quoted
    if (ch === sep && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function parseLine(line: string): Prop | null {
  // The value starts at the first colon outside quoted parameter values.
  let quoted = false
  let colon = -1
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted
    else if (line[i] === ':' && !quoted) {
      colon = i
      break
    }
  }
  if (colon < 0) return null
  const [head = '', ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ';')
  const dot = head.lastIndexOf('.')
  const params: [string, string][] = []
  for (const p of rawParams) {
    const eq = p.indexOf('=')
    // vCard 2.1 style bare types ("TEL;CELL:…").
    if (eq < 0) params.push(['TYPE', p])
    else
      for (const v of splitOutsideQuotes(p.slice(eq + 1), ','))
        params.push([p.slice(0, eq).toUpperCase(), v.replace(/^"|"$/g, '')])
  }
  return {
    group: dot >= 0 ? head.slice(0, dot) : '',
    name: head.slice(dot + 1).toUpperCase(),
    params,
    value: line.slice(colon + 1),
    line,
  }
}

function unescapeText(v: string): string {
  return v.replace(/\\(.)/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}
function escapeText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}
/** Splits a structured value (N, ADR, ORG) at unescaped `;`. */
function components(v: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && i + 1 < v.length) {
      cur += v[i]! + v[i + 1]!
      i++
    } else if (v[i] === ';') {
      out.push(cur)
      cur = ''
    } else cur += v[i]
  }
  out.push(cur)
  return out.map(unescapeText)
}
/** Splits a list value (CATEGORIES, NICKNAME) at unescaped `,`. */
function listValues(v: string): string[] {
  return v
    .split(/(?<!\\),/)
    .map((s) => unescapeText(s).trim())
    .filter(Boolean)
}

const typesOf = (p: Prop) => p.params.filter(([k]) => k === 'TYPE').map(([, v]) => v.toLowerCase())

/** Apple keeps custom labels in a sibling `itemN.X-ABLabel`. */
function appleLabel(all: Prop[], p: Prop): string {
  if (!p.group) return ''
  const label = all.find((o) => o.group === p.group && o.name === 'X-ABLABEL')
  return label ? label.value.replace(/^_\$!<(.*)>!\$_$/, '$1').toLowerCase() : ''
}

function fieldType(all: Prop[], p: Prop): FieldType {
  const types = [...typesOf(p), appleLabel(all, p)]
  if (types.some((t) => t === 'cell' || t === 'mobile' || t === 'iphone')) return 'mobile'
  if (types.includes('work')) return 'work'
  if (types.includes('home')) return 'home'
  return 'other'
}

// ---- parse -----------------------------------------------------------------------------------

export function emptyFields(): ContactFields {
  return {
    fullName: '',
    prefix: '',
    givenName: '',
    middleName: '',
    familyName: '',
    suffix: '',
    nickname: '',
    org: '',
    title: '',
    emails: [],
    phones: [],
    addresses: [],
    urls: [],
    birthday: '',
    note: '',
    categories: [],
    photo: '',
  }
}

/** All vCards in a text (a .vcf export can hold many). */
export function splitVCards(text: string): string[] {
  return [...text.matchAll(/BEGIN:VCARD[\s\S]*?END:VCARD/gi)].map((m) => m[0])
}

function parseBirthdayValue(p: Prop): string {
  const raw = p.value.trim()
  let m = /^--(\d{2})-?(\d{2})/.exec(raw)
  if (m) return `--${m[1]}-${m[2]}`
  m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(raw)
  if (!m) return ''
  const omit = p.params.find(([k]) => k === 'X-APPLE-OMIT-YEAR')?.[1]
  if ((omit && omit === m[1]) || Number(m[1]) < 1800) return `--${m[2]}-${m[3]}`
  return `${m[1]}-${m[2]}-${m[3]}`
}

function parsePhoto(p: Prop): string {
  const value = p.value.trim()
  if (/^(data:|https?:)/i.test(value)) return value
  const encoding = p.params.find(([k]) => k === 'ENCODING')?.[1]?.toLowerCase()
  if (encoding === 'b' || encoding === 'base64') {
    const type = (typesOf(p)[0] ?? 'jpeg').replace(/^image\//, '')
    return `data:image/${type};base64,${value}`
  }
  return ''
}

export function parseVCard(text: string, fallbackUid = ''): Contact {
  const props = unfold(text)
    .map(parseLine)
    .filter((p): p is Prop => p !== null)
  const first = (name: string) => props.find((p) => p.name === name)
  const all = (name: string) => props.filter((p) => p.name === name)
  const f = emptyFields()

  const n = first('N')
  if (n) {
    const [family = '', given = '', middle = '', prefix = '', suffix = ''] = components(n.value)
    Object.assign(f, {
      familyName: family,
      givenName: given,
      middleName: middle,
      prefix,
      suffix,
    })
  }
  f.fullName = unescapeText(first('FN')?.value ?? '').trim()
  f.nickname = listValues(first('NICKNAME')?.value ?? '').join(', ')
  const org = first('ORG')
  if (org) f.org = components(org.value).filter(Boolean).join(', ')
  f.title = unescapeText(first('TITLE')?.value ?? '')
  f.emails = all('EMAIL')
    .map((p) => ({ type: fieldType(props, p), value: unescapeText(p.value).trim() }))
    .filter((e) => e.value)
  f.phones = all('TEL')
    .map((p) => ({
      type: fieldType(props, p),
      value: unescapeText(p.value)
        .replace(/^tel:/i, '')
        .trim(),
    }))
    .filter((e) => e.value)
  f.addresses = all('ADR').map((p) => {
    const [, , street = '', city = '', region = '', postcode = '', country = ''] = components(
      p.value,
    )
    return { type: fieldType(props, p), street, city, region, postcode, country }
  })
  f.urls = all('URL')
    .map((p) => unescapeText(p.value).trim())
    .filter(Boolean)
  const bday = first('BDAY')
  if (bday) f.birthday = parseBirthdayValue(bday)
  f.note = unescapeText(first('NOTE')?.value ?? '')
  f.categories = all('CATEGORIES').flatMap((p) => listValues(p.value))
  const photo = first('PHOTO')
  if (photo) f.photo = parsePhoto(photo)

  return {
    ...f,
    uid: first('UID')?.value.trim() || fallbackUid,
    version: first('VERSION')?.value.trim() || '3.0',
    raw: text,
  }
}

// ---- names -----------------------------------------------------------------------------------

/** The name to show: FN, else the name parts, else the organization / e-mail / phone. */
export function displayName(c: ContactFields): string {
  return (
    c.fullName.trim() ||
    [c.prefix, c.givenName, c.middleName, c.familyName, c.suffix]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' ') ||
    c.org.trim() ||
    c.emails[0]?.value ||
    c.phones[0]?.value ||
    'No name'
  )
}

/** Sort key: family name first when there is one (like most address books). */
export function sortKey(c: ContactFields): string {
  const key = c.familyName.trim()
    ? `${c.familyName} ${c.givenName}`
    : c.givenName.trim()
      ? c.givenName
      : displayName(c)
  return key.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()
}

/** Up to two initials for the avatar. */
export function initials(c: ContactFields): string {
  const given = c.givenName.trim()
  const family = c.familyName.trim()
  if (given || family) return `${given.charAt(0)}${family.charAt(0)}`.toUpperCase()
  const words = displayName(c).split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase()
}

// ---- write -----------------------------------------------------------------------------------

/** Folds a content line at 75 octets (RFC 6350 §3.2), not splitting UTF-8 sequences. */
function fold(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = encoder.encode(ch).length
    const limit = parts.length === 0 ? 75 : 74 // continuation lines start with a space
    if (bytes + n > limit) {
      parts.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

/** Properties the page edits: replaced on save, along with their Apple label siblings. */
const EDITED = new Set([
  'FN',
  'N',
  'NICKNAME',
  'ORG',
  'TITLE',
  'EMAIL',
  'TEL',
  'ADR',
  'URL',
  'BDAY',
  'NOTE',
  'CATEGORIES',
  'PHOTO',
  'REV',
])

const TYPE_PARAM: Record<'email' | 'tel' | 'adr', Record<FieldType, string>> = {
  email: { home: 'HOME', work: 'WORK', mobile: 'HOME', other: 'OTHER' },
  tel: { home: 'HOME', work: 'WORK', mobile: 'CELL', other: 'OTHER' },
  adr: { home: 'HOME', work: 'WORK', mobile: 'HOME', other: 'OTHER' },
}

function photoLine(photo: string, v4: boolean): string | null {
  if (!photo) return null
  if (v4 || !photo.startsWith('data:')) return v4 ? `PHOTO:${photo}` : `PHOTO;VALUE=URI:${photo}`
  const m = /^data:image\/([\w+.-]+);base64,(.*)$/.exec(photo)
  return m ? `PHOTO;ENCODING=b;TYPE=${m[1]!.toUpperCase()}:${m[2]}` : null
}

function birthdayLine(birthday: string, v4: boolean): string | null {
  let m = /^--(\d{2})-(\d{2})$/.exec(birthday)
  if (m)
    return v4
      ? `BDAY:--${m[1]}${m[2]}`
      : // vCard 3 has no year-less dates: Apple's placeholder year.
        `BDAY;X-APPLE-OMIT-YEAR=1604:1604-${m[1]}-${m[2]}`
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday)
  return m ? `BDAY${v4 ? '' : ';VALUE=date'}:${m[1]}-${m[2]}-${m[3]}` : null
}

function revStamp(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`
}

/**
 * Writes the fields into a card: `base` (the card as read) keeps every property the page does
 * not edit; without it a new 3.0 card with `uid` is made.
 */
export function serializeVCard(
  fields: ContactFields,
  options: { uid: string; base?: string; now?: Date; prodId?: string },
): string {
  const base = options.base
    ? unfold(options.base)
        .map(parseLine)
        .filter((p): p is Prop => p !== null)
    : []
  const version = base.find((p) => p.name === 'VERSION')?.value.trim() || '3.0'
  const v4 = version.startsWith('4')
  // Groups whose edited property goes away take their Apple labels with them.
  const droppedGroups = new Set(base.filter((p) => p.group && EDITED.has(p.name)).map((p) => p.group))
  const kept = base.filter(
    (p) =>
      !['BEGIN', 'END', 'VERSION', 'UID'].includes(p.name) &&
      !EDITED.has(p.name) &&
      !(p.group && droppedGroups.has(p.group)),
  )

  const lines: string[] = ['BEGIN:VCARD', `VERSION:${version}`]
  if (!base.some((p) => p.name === 'PRODID'))
    lines.push(`PRODID:${options.prodId ?? '-//DaisyCal//Contacts//EN'}`)
  lines.push(`UID:${options.uid}`)
  lines.push(`FN:${escapeText(displayName(fields) === 'No name' ? '' : displayName(fields))}`)
  lines.push(
    `N:${[fields.familyName, fields.givenName, fields.middleName, fields.prefix, fields.suffix]
      .map((s) => escapeText(s.trim()))
      .join(';')}`,
  )
  if (fields.nickname.trim()) lines.push(`NICKNAME:${escapeText(fields.nickname.trim())}`)
  if (fields.org.trim()) lines.push(`ORG:${escapeText(fields.org.trim())}`)
  if (fields.title.trim()) lines.push(`TITLE:${escapeText(fields.title.trim())}`)
  for (const e of fields.emails)
    if (e.value.trim())
      lines.push(`EMAIL;TYPE=${v4 ? '' : 'INTERNET,'}${TYPE_PARAM.email[e.type]}:${e.value.trim()}`)
  for (const t of fields.phones)
    if (t.value.trim())
      lines.push(`TEL;TYPE=${TYPE_PARAM.tel[t.type]}${v4 ? '' : ',VOICE'}:${t.value.trim()}`)
  for (const a of fields.addresses) {
    const parts = [a.street, a.city, a.region, a.postcode, a.country].map((s) => s.trim())
    if (parts.some(Boolean))
      lines.push(`ADR;TYPE=${TYPE_PARAM.adr[a.type]}:;;${parts.map(escapeText).join(';')}`)
  }
  for (const u of fields.urls) if (u.trim()) lines.push(`URL:${u.trim()}`)
  const bday = birthdayLine(fields.birthday, v4)
  if (bday) lines.push(bday)
  if (fields.note.trim()) lines.push(`NOTE:${escapeText(fields.note.trim())}`)
  if (fields.categories.length)
    lines.push(`CATEGORIES:${fields.categories.map((c) => escapeText(c.trim())).join(',')}`)
  const photo = photoLine(fields.photo, v4)
  if (photo) lines.push(photo)
  for (const p of kept) lines.push(p.line)
  lines.push(`REV:${revStamp(options.now ?? new Date())}`)
  lines.push('END:VCARD')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** The contact's fields alone (a copy for an edit form). */
export function fieldsOf(c: ContactFields): ContactFields {
  return {
    ...c,
    emails: c.emails.map((e) => ({ ...e })),
    phones: c.phones.map((p) => ({ ...p })),
    addresses: c.addresses.map((a) => ({ ...a })),
    urls: [...c.urls],
    categories: [...c.categories],
  }
}

/** Age the contact turns on their next birthday (or today), when the year is known. */
export function nextBirthday(
  birthday: string,
  today: Date,
): { date: Date; turns: number | null; inDays: number } | null {
  const m = /^(?:(\d{4})|--)-?(\d{2})-(\d{2})$/.exec(birthday)
  if (!m) return null
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let date = new Date(start.getFullYear(), month, day)
  if (date < start) date = new Date(start.getFullYear() + 1, month, day)
  const inDays = Math.round((date.getTime() - start.getTime()) / 86_400_000)
  return { date, turns: m[1] ? date.getFullYear() - Number(m[1]) : null, inDays }
}
