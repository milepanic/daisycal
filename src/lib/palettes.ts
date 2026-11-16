/**
 * Color themes for calendars and task lists (Settings → Colors). A theme hands its colors out
 * in order: calendars first, then task lists. With more collections than colors the theme goes
 * round again, a step lighter each time, so no two collections share a color.
 */

export interface Palette {
  id: string
  name: string
  colors: string[]
}

export const PALETTES: Palette[] = [
  {
    id: 'prussian',
    name: 'Prussian',
    colors: ['#245a85', '#d9467a', '#0f9488', '#c2620e', '#7c3aed', '#566c86', '#2f855a', '#b4235a'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: ['#0b4f6c', '#0891b2', '#1d7874', '#3e6990', '#0ea5e9', '#1d3557', '#2a9d8f', '#5b7db1'],
  },
  {
    id: 'earth',
    name: 'Earth',
    colors: ['#8a5a44', '#b5651d', '#6b705c', '#606c38', '#bc6c25', '#7f5539', '#a0522d', '#8d7b68'],
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: ['#2d6a4f', '#40916c', '#1b4332', '#52796f', '#386641', '#6a994e', '#354f52', '#588157'],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: ['#d1495b', '#e07a2f', '#00798c', '#30638e', '#9e2a2b', '#c9a227', '#ef8354', '#6d597a'],
  },
  {
    id: 'vivid',
    name: 'Vivid',
    colors: ['#e63946', '#2a9d8f', '#8338ec', '#3a86ff', '#ff006e', '#fb5607', '#06a77d', '#f4a261'],
  },
  {
    id: 'pastel',
    name: 'Pastel',
    colors: ['#8e9ae6', '#ef8fa0', '#6fc2aa', '#f0b35e', '#7fb2de', '#b99ad6', '#e69f7a', '#93c39b'],
  },
  {
    id: 'mono',
    name: 'Slate',
    colors: ['#1f2937', '#475569', '#64748b', '#334155', '#6b7280', '#4b5563', '#94a3b8', '#52525b'],
  },
  // ---- Pinterest trends ---------------------------------------------------------------------
  // The official Pinterest Palettes (built from what people search and save), and color schemes
  // that keep topping Pinterest boards. Pale official shades (e.g. Cool Blue #D7EFFF, Butter
  // Yellow #FFEDA8) are taken a step deeper so they work as event colors.
  {
    id: 'pinterest-2026',
    name: 'Pinterest 2026',
    // Persimmon, Plum Noir, Cool Blue, Jade, Wasabi, and deeper / mid steps of them.
    colors: ['#ff5c34', '#351e28', '#5f93c0', '#7d8b6a', '#9aa31c', '#c2410c', '#6b3a52', '#3f6f96'],
  },
  {
    id: 'pinterest-2025',
    name: 'Pinterest 2025',
    // Cherry Red, Dill Green, Aura Indigo, Butter Yellow, Alpine Oat, and their companions.
    colors: ['#74070e', '#4e6813', '#7d6fc4', '#c9a227', '#9c8a6e', '#b5313a', '#6b7f3a', '#5a4fa0'],
  },
  {
    id: 'sage-terracotta',
    name: 'Sage & Terracotta',
    colors: ['#7f9c68', '#c66b3d', '#5f7a61', '#e07a5f', '#9aa77f', '#9c4a2e', '#3d5a40', '#c9925f'],
  },
  {
    id: 'dusty-rose',
    name: 'Dusty Rose',
    colors: ['#c47e7e', '#8e5c6b', '#b5838d', '#6d4c5b', '#d08f98', '#9e6b5a', '#7f6a93', '#a65f73'],
  },
  {
    id: 'mocha-mousse',
    name: 'Mocha Mousse',
    colors: ['#a47864', '#6f4e37', '#c19a6b', '#8b5e3c', '#5c4033', '#b08968', '#7f5539', '#cf9f6f'],
  },
  {
    id: 'coastal',
    name: 'Coastal',
    colors: ['#1b4965', '#3d7fa6', '#5fa8d3', '#2a9d8f', '#3d5a80', '#c08b5c', '#4f8a8b', '#6c91bf'],
  },
  {
    id: 'boho',
    name: 'Boho',
    colors: ['#d08c60', '#b5651d', '#8a9a5b', '#386641', '#c9a227', '#a44a3f', '#5e8c7a', '#7f5539'],
  },
  {
    id: 'dark-academia',
    name: 'Dark Academia',
    colors: ['#3d2b1f', '#6b2737', '#4a5d23', '#2f3e46', '#7b5e3c', '#5b3a29', '#354f52', '#8c6d46'],
  },
]

/** `#rrggbb` mixed toward white by `amount` (0–1). */
export function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const channel = (shift: number) => {
    const v = (n >> shift) & 255
    return Math.round(v + (255 - v) * amount)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(16)}${channel(8)}${channel(0)}`
}

/** The color a theme gives the `index`-th collection. */
export function paletteColor(palette: Palette, index: number): string {
  const n = palette.colors.length
  const round = Math.floor(index / n)
  const base = palette.colors[index % n]!
  return round === 0 ? base : lighten(base, Math.min(0.2 * round, 0.6))
}

/** Every collection's color under a theme, by URL (in the order given). */
export function assignPalette(palette: Palette, urls: string[]): Map<string, string> {
  return new Map(urls.map((url, i) => [url, paletteColor(palette, i)]))
}

/**
 * Gives `url` the color `color`; when another collection already has it, the two swap, so a
 * theme's colors can be moved around without doubling up.
 */
export function setColor(
  colors: Map<string, string>,
  url: string,
  color: string,
): Map<string, string> {
  const next = new Map(colors)
  const previous = next.get(url)
  for (const [other, c] of next)
    if (other !== url && c.toLowerCase() === color.toLowerCase() && previous) next.set(other, previous)
  next.set(url, color)
  return next
}

/** The same colors in a new random order (Fisher–Yates). */
export function shuffleColors(
  colors: Map<string, string>,
  random: () => number = Math.random,
): Map<string, string> {
  const urls = [...colors.keys()]
  const values = [...colors.values()]
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[values[i], values[j]] = [values[j]!, values[i]!]
  }
  return new Map(urls.map((u, i) => [u, values[i]!]))
}
