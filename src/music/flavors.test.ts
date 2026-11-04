import { describe, expect, it } from 'vitest'
import { parseChord } from './parse'
import { FIT_MARKS, flavorOptions } from './flavors'

describe('flavorOptions', () => {
  const opts = flavorOptions(parseChord('C')!, 'C', 'ionian')

  it('never mixes categories: in key, then borrowed/leading, then outside', () => {
    const order = opts.map((o) => FIT_MARKS.indexOf(o.mark))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('lists every chord type once', () => {
    expect(new Set(opts.map((o) => o.t.symbol)).size).toBe(opts.length)
  })

  it('puts the plain, expected chords first within a category', () => {
    const inKey = opts.filter((o) => o.mark === 'in').map((o) => o.t.symbol)
    expect(inKey[0]).toBe('')
    expect(inKey.indexOf('maj7')).toBeLessThan(inKey.indexOf('maj13'))
  })
})
