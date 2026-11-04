import { describe, expect, it } from 'vitest'
import { chordName, lowestNote, voiceChord } from './chord'
import { parseChord } from './parse'
import { chordVelocity, fitToNeighbors, movement, smoothVoicing } from './voicing'

const chords = (names: string) => names.split(' ').map((n) => parseChord(n)!)

describe('movement', () => {
  it('is 0 for the same notes and counts semitones moved', () => {
    expect(movement([48, 52, 55], [48, 52, 55])).toBe(0)
    expect(movement([48, 52, 55], [48, 53, 57])).toBe(3)
  })
})

describe('smoothVoicing', () => {
  it('keeps the first chord and moves the rest as little as possible', () => {
    const out = smoothVoicing(chords('C F G C'))
    // Inverted shapes (F with C on the bottom, G with B), still plain F and G: no slash chords.
    expect(out.map(chordName)).toEqual(['C', 'F', 'G', 'C'])
    expect(out.map(lowestNote)).toEqual(['C', 'C', 'B', 'C'])
  })

  it('moves less than root position does', () => {
    const input = chords('C Am F G Em Dm7 G7 C')
    const total = (cs: typeof input) =>
      cs.slice(1).reduce((s, c, i) => s + movement(voiceChord(cs[i]), voiceChord(c)), 0)
    expect(total(smoothVoicing(input))).toBeLessThan(total(input))
  })

  it('leaves a single chord alone', () => {
    const one = chords('C/E')
    expect(smoothVoicing(one)).toEqual(one)
  })
})

describe('chordVelocity', () => {
  it('keeps total power the same for any chord size', () => {
    for (const n of [1, 3, 4, 7]) expect(n * chordVelocity(n) ** 2).toBeCloseTo(1)
    expect(chordVelocity(0)).toBe(1)
  })
})

describe('fitToNeighbors', () => {
  const c = (n: string) => parseChord(n)!
  it('lands a new chord in the register of its neighbors', () => {
    const high = { ...c('C'), inversion: 3 } // C an octave up (60 64 67)
    const fitted = fitToNeighbors(c('F'), high, null)
    expect(Math.min(...voiceChord(fitted))).toBeGreaterThanOrEqual(57)
    expect([chordName(fitted), lowestNote(fitted)]).toEqual(['F', 'C'])
  })

  it('leaves a chord with no neighbors alone', () => {
    expect(fitToNeighbors(c('G'))).toEqual(c('G'))
  })
})
