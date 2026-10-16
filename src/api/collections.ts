import type { DAVResponse } from 'tsdav'

/** The only two Radicale collection types DaisyCal supports (CHECKLIST.md §0). */
export type CollectionKind = 'calendar' | 'tasks'

export interface Collection {
  /** Absolute URL, always ending with `/`. */
  url: string
  kind: CollectionKind
  displayName: string
  /** `#rrggbb` (Apple `calendar-color` may carry an alpha suffix, which is stripped). */
  color: string | null
  ctag: string | null
  syncToken: string | null
}

const DEFAULT_COLOR = null

/** Reads a text value as tsdav parses it (string, `{ _text }` or `{ _cdata }`). */
export function davText(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    const v = value as { _text?: unknown; _cdata?: unknown }
    if (typeof v._cdata === 'string') return v._cdata
    if (typeof v._text === 'string') return v._text
  }
  return undefined
}

/** Component names from `supported-calendar-component-set` (`comp` is one object or an array). */
export function componentNames(compSet: unknown): string[] {
  const comps = (compSet as { comp?: unknown } | undefined)?.comp
  const list = Array.isArray(comps) ? comps : comps ? [comps] : []
  return list
    .map((c) => (c as { _attributes?: { name?: unknown } })?._attributes?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
    .map((n) => n.toUpperCase())
}

/**
 * Decides whether a PROPFIND response describes a supported collection and which kind.
 * Returns `null` for anything that is not exactly a Calendar (`VEVENT`) or Tasks (`VTODO`)
 * collection: address books, journals, mixed "calendar and tasks", or no component set at all.
 */
export function classifyCollection(
  props: Record<string, unknown> | undefined,
): CollectionKind | null {
  if (!props) return null
  const resourcetype = Object.keys((props.resourcetype as object | undefined) ?? {})
  if (!resourcetype.includes('calendar')) return null
  if (resourcetype.includes('addressbook')) return null

  const components = componentNames(props.supportedCalendarComponentSet)
  if (components.length !== 1) return null
  if (components[0] === 'VEVENT') return 'calendar'
  if (components[0] === 'VTODO') return 'tasks'
  return null
}

/** Normalizes a calendar-color value to `#rrggbb` or `null`. */
export function normalizeColor(value: unknown): string | null {
  const text = davText(value)?.trim()
  if (!text) return DEFAULT_COLOR
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text)
  return m ? `#${m[1]!.toLowerCase()}` : DEFAULT_COLOR
}

/** Maps one PROPFIND response to a `Collection`, or `null` when unsupported. */
export function toCollection(res: DAVResponse, baseUrl: string): Collection | null {
  const kind = classifyCollection(res.props)
  if (!kind || !res.href) return null
  const url = new URL(res.href, baseUrl).href
  const props = res.props ?? {}
  const name = davText(props.displayname)?.trim()
  return {
    url: url.endsWith('/') ? url : `${url}/`,
    kind,
    displayName: name || decodeURIComponent(url.replace(/\/$/, '').split('/').pop() ?? ''),
    color: normalizeColor(props.calendarColor),
    ctag: davText(props.getctag) ?? null,
    syncToken: davText(props.syncToken) ?? null,
  }
}
