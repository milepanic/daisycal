import { describe, expect, it } from 'vitest'

import { matches, normalize } from '../search'

describe('search matching', () => {
  it('ignores case and diacritics, đ included', () => {
    expect(normalize('Ćevapi kod Đure')).toBe('cevapi kod djure')
    expect(matches('cevapi', 'Ćevapi')).toBe(true)
    expect(matches('ĆEVAPI', 'cevapi')).toBe(true)
    expect(matches('djure', 'Kod Đure')).toBe(true)
  })

  it('needs every word, in any field and order', () => {
    expect(matches('zubar banja', 'Zubar', 'Banja Luka')).toBe(true)
    expect(matches('zubar mostar', 'Zubar', 'Banja Luka')).toBe(false)
    expect(matches('   ', 'anything')).toBe(false)
  })
})
