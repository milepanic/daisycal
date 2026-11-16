import { describe, expect, it } from 'vitest'

import { PALETTES, assignPalette, lighten, paletteColor, setColor, shuffleColors } from '../palettes'

const P = PALETTES[0]!

describe('palettes', () => {
  it('hands colors out in order and goes round lighter, never repeating', () => {
    const urls = Array.from({ length: P.colors.length + 2 }, (_, i) => `u${i}`)
    const colors = assignPalette(P, urls)
    expect(colors.get('u0')).toBe(P.colors[0])
    expect(colors.get(`u${P.colors.length}`)).toBe(lighten(P.colors[0]!, 0.2))
    expect(new Set(colors.values()).size).toBe(urls.length)
    expect(paletteColor(P, 1)).toBe(P.colors[1])
    expect(lighten('#000000', 0.5)).toBe('#808080')
  })

  it('every theme color is a #rrggbb', () => {
    for (const p of PALETTES) for (const c of p.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('swaps when the picked color is taken', () => {
    const colors = new Map([
      ['a', '#111111'],
      ['b', '#222222'],
    ])
    const next = setColor(colors, 'a', '#222222')
    expect([...next]).toEqual([
      ['a', '#222222'],
      ['b', '#111111'],
    ])
    expect(setColor(colors, 'a', '#333333').get('b')).toBe('#222222')
  })

  it('shuffles the same colors', () => {
    const colors = new Map([
      ['a', '#1'],
      ['b', '#2'],
      ['c', '#3'],
    ])
    const out = shuffleColors(colors, () => 0)
    expect([...out.keys()]).toEqual(['a', 'b', 'c'])
    expect([...out.values()].sort()).toEqual(['#1', '#2', '#3'])
    expect([...out.values()]).not.toEqual(['#1', '#2', '#3'])
  })
})
