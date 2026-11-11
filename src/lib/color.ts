/**
 * Text color on a colored chip (events, tasks in the grid): white, as Google and Apple use on
 * calendar colors, unless white drops below 3:1 contrast (the WCAG minimum for large text and
 * UI parts) on a light color such as yellow or light green; then near-black.
 *
 * A plain "whichever contrasts more" would already pick black for mid tones like Apple's blue
 * (#007aff: 4.0 vs 4.4), which looks out of place next to the other chips.
 */

export const LIGHT_TEXT = '#ffffff'
/** Tailwind gray-900, the app's text color. */
export const DARK_TEXT = '#111827'

/** sRGB channels 0-255 of a `#rgb` / `#rrggbb` (alpha suffix ignored), or null. */
function parseHex(color: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(color.trim())
  if (!m) return null
  let hex = m[1]!
  if (hex.length === 3 || hex.length === 4) hex = Array.from(hex.slice(0, 3), (c) => c + c).join('')
  if (hex.length !== 6 && hex.length !== 8) return null
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color)
  if (!rgb) return null
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a) ?? 0
  const lb = relativeLuminance(b) ?? 0
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const cache = new Map<string, string>()

/** Below this contrast with white, chips switch to near-black text. */
export const MIN_WHITE_CONTRAST = 3

/** White text, or near-black on colors too light for white (see top of file). */
export function textOn(background: string): string {
  const hit = cache.get(background)
  if (hit) return hit
  const result =
    relativeLuminance(background) == null
      ? LIGHT_TEXT
      : contrastRatio(background, LIGHT_TEXT) >= MIN_WHITE_CONTRAST ||
          contrastRatio(background, LIGHT_TEXT) >= contrastRatio(background, DARK_TEXT)
        ? LIGHT_TEXT
        : DARK_TEXT
  cache.set(background, result)
  return result
}
