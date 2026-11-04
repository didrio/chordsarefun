import { describe, expect, it } from 'vitest'
import { chordName, voiceChord } from './chord'
import { GENRES, numeralChord, PROGRESSIONS, progressionChords, progressionClips } from './progressions'
import { isDiatonic } from './theory'
import { sigBarTicks, TICKS_PER_BAR } from './timeline'

const BAR = TICKS_PER_BAR
const name = (numeral: string, tonic: string) => {
  const c = numeralChord(numeral, tonic)
  return c && chordName(c)
}

describe('numeralChord', () => {
  it('reads numerals relative to the major scale', () => {
    expect(name('I', 'C')).toBe('C')
    expect(name('vi', 'C')).toBe('Am')
    expect(name('bVII', 'C')).toBe('Bb')
    expect(name('bVI', 'A')).toBe('F')
    expect(name('iiø7', 'C')).toBe('Dm7b5')
    expect(name('V7', 'Eb')).toBe('Bb7')
    expect(name('IVmaj7', 'F#')).toBe('Bmaj7')
    expect(name('nope', 'C')).toBeNull()
  })
})

describe('PROGRESSIONS', () => {
  it('arrive an octave up, in root position', () => {
    const pop = PROGRESSIONS.find((p) => p.id === 'pop')!
    expect(voiceChord(progressionChords(pop, 'C')[0])).toEqual([60, 64, 67])
  })

  it('has no duplicates (same chords in the same mood)', () => {
    const seen = new Map<string, string>()
    for (const p of PROGRESSIONS) {
      const key = `${p.mode}: ${p.numerals.join(' ')}`
      expect(seen.get(key), `${p.id} duplicates ${seen.get(key)}`).toBeUndefined()
      seen.set(key, p.id)
    }
  })

  it('has unique ids, and every genre has progressions', () => {
    expect(new Set(PROGRESSIONS.map((p) => p.id)).size).toBe(PROGRESSIONS.length)
    for (const g of GENRES) expect(PROGRESSIONS.some((p) => p.genre === g)).toBe(true)
  })

  it('all parse, in every key', () => {
    for (const p of PROGRESSIONS) {
      for (const tonic of ['C', 'F#', 'Bb', 'E']) {
        expect(progressionChords(p, tonic)).toHaveLength(p.numerals.length)
      }
    }
  })

  it('mostly sit in their own scale (borrowed chords are marked in the text)', () => {
    const pop = PROGRESSIONS.find((p) => p.id === 'pop')!
    expect(progressionChords(pop, 'G').every((c) => isDiatonic(c, 'G', pop.mode))).toBe(true)
    const epic = PROGRESSIONS.find((p) => p.id === 'epic')!
    expect(progressionChords(epic, 'A').map(chordName)).toEqual(['Am', 'F', 'C', 'G'])
    expect(progressionChords(epic, 'A').every((c) => isDiatonic(c, 'A', 'aeolian'))).toBe(true)
  })
})

describe('progressionClips', () => {
  const pop = PROGRESSIONS.find((p) => p.id === 'pop')!
  const layout = (clips: ReturnType<typeof progressionClips>) => clips.map((c) => [chordName(c.chord!), c.start, c.length])

  it('one chord per bar, repeated while it fits', () => {
    expect(layout(progressionClips(pop, 'C', 4 * BAR, BAR))).toEqual([
      ['C', 0, BAR],
      ['G', BAR, BAR],
      ['Am', 2 * BAR, BAR],
      ['F', 3 * BAR, BAR],
    ])
    expect(progressionClips(pop, 'C', 8 * BAR, BAR)).toHaveLength(8)
  })

  it('shares a shorter track evenly', () => {
    expect(layout(progressionClips(pop, 'C', 2 * BAR, BAR)).map((c) => c[2])).toEqual([BAR / 2, BAR / 2, BAR / 2, BAR / 2])
    const bar = sigBarTicks({ beats: 3, unit: 4 })
    const clips = progressionClips(pop, 'C', bar, bar)
    expect(clips.reduce((s, c) => s + c.length, 0)).toBe(bar)
  })
})
