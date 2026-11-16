import { describe, expect, it } from 'vitest'
import { chordName, voiceChord } from './chord'
import { applyGroove, DEFAULT_GROOVE, GROOVES } from './grooves'
import { DEFAULT_TRACK } from '../track'
import { GENRES, numeralChord, PROGRESSIONS, progressionChords, progressionClips, progressionMusic, progressionTrack, searchProgressions } from './progressions'
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

describe('how each progression sounds', () => {
  const preset = (id: string) => GROOVES.find((g) => g.id === id)

  it('uses an existing preset, never Just chords or the 3/4 waltz', () => {
    for (const p of PROGRESSIONS) {
      expect(preset(p.groove), `${p.id}: ${p.groove}`).toBeDefined()
      expect(['just', 'waltz'], p.id).not.toContain(p.groove)
    }
  })

  it("plays at a tempo inside its preset's natural range", () => {
    for (const p of PROGRESSIONS) {
      const [min, max] = preset(p.groove)!.bpm
      expect(p.bpm, `${p.id} on ${p.groove}`).toBeGreaterThanOrEqual(min)
      expect(p.bpm, `${p.id} on ${p.groove}`).toBeLessThanOrEqual(max)
    }
  })

  it('every genre uses at least two presets', () => {
    for (const g of GENRES) {
      expect(new Set(PROGRESSIONS.filter((p) => p.genre === g).map((p) => p.groove)).size, g).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('progressionMusic', () => {
  const preset = (id: string) => GROOVES.find((g) => g.id === id)!
  const pop = PROGRESSIONS.find((p) => p.id === 'pop')!
  const jazz = PROGRESSIONS.find((p) => p.id === 'twofive')!

  it('lays the chords out one bar each in 4/4, in the key asked for', () => {
    const m = progressionMusic(pop, 'G')
    expect(m.sig).toEqual({ beats: 4, unit: 4 })
    expect(m.totalTicks).toBe(4 * BAR)
    expect(m.clips.map((c) => [c.start, c.length])).toEqual([0, 1, 2, 3].map((i) => [i * BAR, BAR]))
    expect(m.clips.map((c) => chordName(c.chord!))).toEqual(['G', 'D', 'Em', 'C'])
  })

  it('plays with its own preset and tempo', () => {
    const m = progressionMusic(jazz, 'C')
    expect(m.bpm).toBe(jazz.bpm)
    expect(m.groove).toEqual(applyGroove(DEFAULT_GROOVE, preset('jazz')))
  })

  it('or with the instruments and tempo passed in', () => {
    const mine = applyGroove(DEFAULT_GROOVE, preset('reggae'))
    const m = progressionMusic(jazz, 'C', mine, 77)
    expect(m.groove).toBe(mine)
    expect(m.bpm).toBe(77)
  })
})

describe('searchProgressions', () => {
  const ids = (genre: Parameters<typeof searchProgressions>[1], query: string, tonic = 'C') =>
    searchProgressions(PROGRESSIONS, genre, query, tonic).map((p) => p.id)

  it('with no query, lists the genre (or everything) in library order', () => {
    expect(ids('all', '')).toEqual(PROGRESSIONS.map((p) => p.id))
    expect(ids('Pop', '  ')).toEqual(PROGRESSIONS.filter((p) => p.genre === 'Pop').map((p) => p.id))
  })

  it('finds by name, feel, chord, numeral and preset, ignoring case', () => {
    expect(ids('all', 'pop ANTHEM')).toContain('pop')
    expect(ids('all', 'flamenco')).toContain('andalusian')
    expect(ids('Pop', 'bm', 'D')).toContain('pop') // D A Bm G in D
    expect(ids('Pop', 'bm')).not.toContain('pop') // C G Am F in C
    expect(ids('all', 'bVII')).toContain('minoranthem')
    expect(ids('all', '♭vii')).toContain('minoranthem')
    expect(ids('all', 'motown')).toContain('doowop')
  })

  it('needs every word to match, and keeps to the genre', () => {
    const both = ids('all', 'anthem minor')
    expect(both).toContain('minoranthem')
    expect(both).not.toContain('pop')
    expect(ids('Jazz', 'pop anthem')).toEqual([])
    expect(ids('all', 'zzz')).toEqual([])
  })
})

describe('progressionTrack', () => {
  const prog = PROGRESSIONS.find((p) => p.id === 'andalusian')!
  const preset = GROOVES.find((g) => g.id === prog.groove)!
  const track = { ...DEFAULT_TRACK, tonic: 'D', bars: 8, sig: { beats: 3, unit: 4 } }

  it('chords: its chords on your length and meter, in its scale; your instruments and tempo stay', () => {
    const t = progressionTrack(track, prog, { chords: true, instruments: false })
    expect(t.clips.map((c) => chordName(c.chord!))).toEqual(['Dm', 'C', 'Bb', 'A', 'Dm', 'C', 'Bb', 'A'])
    expect(t.clips[1].start).toBe(sigBarTicks(track.sig))
    expect(t.mode).toBe('aeolian')
    expect(t.groove).toBe(track.groove)
    expect(t.bpm).toBe(track.bpm)
  })

  it('instruments: its preset and tempo; your chords and scale stay', () => {
    const t = progressionTrack(track, prog, { chords: false, instruments: true })
    expect(t.groove).toEqual(applyGroove(track.groove, preset))
    expect(t.bpm).toBe(prog.bpm)
    expect(t.clips).toBe(track.clips)
    expect(t.mode).toBe(track.mode)
  })

  it('both: all of it; the tonic, length and meter are always yours', () => {
    const t = progressionTrack(track, prog, { chords: true, instruments: true })
    expect(t.mode).toBe('aeolian')
    expect(t.clips).toHaveLength(8)
    expect(t.groove).toEqual(applyGroove(track.groove, preset))
    expect(t.bpm).toBe(prog.bpm)
    expect([t.tonic, t.bars, t.sig]).toEqual([track.tonic, track.bars, track.sig])
  })
})
