/**
 * Birthdays from contacts (vCard BDAY), shown as read-only all-day events in their own
 * "Contact birthdays" calendar.
 */
import type { EventInstance } from '@/api/ical'
import { addDays, type DateRange } from './dates'

/** Pseudo collection URL of the birthdays calendar (visibility, color, chips). */
export const BIRTHDAYS_URL = 'daisycal:contact-birthdays/'
export const BIRTHDAYS_NAME = 'Contact birthdays'
export const BIRTHDAYS_COLOR = '#d9467a'

export interface Birthday {
  uid: string
  name: string
  month: number // 1-12
  day: number
  /** Birth year, or null when the contact has only day and month. */
  year: number | null
}

/** Joins folded lines (RFC 6350 §3.2) and splits into content lines. */
function lines(vcard: string): string[] {
  return vcard.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
}

function unescape(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .trim()
}

/** Property `name` of a vCard: params (upper-cased keys) and value. */
function prop(
  all: string[],
  name: string,
): { params: Record<string, string>; value: string } | null {
  for (const line of all) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const [head, ...rest] = line.slice(0, colon).split(';')
    // Grouped properties look like "item1.BDAY".
    if (head!.split('.').pop()!.toUpperCase() !== name) continue
    const params: Record<string, string> = {}
    for (const p of rest) {
      const [k, v = ''] = p.split('=')
      params[k!.toUpperCase()] = v.replace(/^"|"$/g, '')
    }
    return { params, value: line.slice(colon + 1) }
  }
  return null
}

/**
 * The contact's birthday, or null. Understands `19900315`, `1990-03-15`, date-times, and no
 * year: `--0315` / `--03-15`, or Apple's `X-APPLE-OMIT-YEAR=1604` placeholder year.
 */
export function parseBirthday(vcard: string, fallbackUid = ''): Birthday | null {
  const all = lines(vcard)
  const bday = prop(all, 'BDAY')
  if (!bday) return null
  const raw = bday.value.trim()
  let year: number | null = null
  let month: number
  let day: number
  let m = /^--(\d{2})-?(\d{2})/.exec(raw)
  if (m) {
    month = Number(m[1])
    day = Number(m[2])
  } else {
    m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(raw)
    if (!m) return null
    year = Number(m[1])
    month = Number(m[2])
    day = Number(m[3])
    const omit = bday.params['X-APPLE-OMIT-YEAR']
    if ((omit && Number(omit) === year) || year < 1800) year = null
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const fn = prop(all, 'FN')?.value
  const n = prop(all, 'N')?.value
  const name =
    (fn && unescape(fn)) ||
    (n && unescape(n.split(';').slice(0, 2).reverse().filter(Boolean).join(' '))) ||
    'Someone'
  const uid = prop(all, 'UID')?.value.trim() || fallbackUid
  return { uid, name, month, day, year }
}

/** The day of the birthday in `year`; 29 February falls on the 28th in other years. */
function dateIn(b: Birthday, year: number): Date {
  const leap = new Date(year, 1, 29).getMonth() === 1
  const day = b.month === 2 && b.day === 29 && !leap ? 28 : b.day
  return new Date(year, b.month - 1, day)
}

/** Read-only all-day occurrences of the birthdays inside `range`, with the age when known. */
export function birthdayInstances(birthdays: Birthday[], range: DateRange): EventInstance[] {
  const out: EventInstance[] = []
  for (let y = range.start.getFullYear(); y <= range.end.getFullYear(); y++) {
    for (const b of birthdays) {
      const start = dateIn(b, y)
      if (start < range.start && addDays(start, 1) <= range.start) continue
      if (start >= range.end) continue
      if (b.year != null && y < b.year) continue
      const age = b.year != null ? y - b.year : null
      out.push({
        uid: `birthday-${b.uid}`,
        objectUrl: `${BIRTHDAYS_URL}${encodeURIComponent(b.uid)}/${y}`,
        collectionUrl: BIRTHDAYS_URL,
        etag: '',
        summary: age != null && age > 0 ? `🎂 ${b.name} (${age})` : `🎂 ${b.name}`,
        description: '',
        location: '',
        start,
        end: addDays(start, 1),
        allDay: true,
        tzid: null,
        recurrenceId: null,
        isException: false,
        isRecurring: false,
        repeat: null,
        alarm: null,
        travel: null,
        status: null,
        readOnly: true,
      })
    }
  }
  return out.sort((a, b) => +a.start - +b.start || a.summary.localeCompare(b.summary))
}
