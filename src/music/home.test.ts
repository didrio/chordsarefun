import { describe, expect, it } from 'vitest'
import { chordName } from './chord'
import { parseChord } from './parse'
import { detectHome, homeFit, homeMove, homeReason, keyCandidates, rankHomes, sameNotes, spiceChords, suggestHome } from './home'
import { isDiatonic, MODES } from './theory'
import { TICKS_PER_BAR, type Clip } from './timeline'

const track = (names: string) =>
  names.split(' ').map((n, i): Clip => ({ id: String(i), chord: parseChord(n)!, start: i * TICKS_PER_BAR, length: TICKS_PER_BAR }))
const C = { tonic: 'C', mode: 'ionian' as const }

describe('home changes', () => {
  it('knows relative keys use the same notes', () => {
    expect(sameNotes(C, { tonic: 'A', mode: 'aeolian' })).toBe(true)
    expect(sameNotes(C, { tonic: 'D', mode: 'dorian' })).toBe(true)
    expect(sameNotes(C, { tonic: 'C', mode: 'aeolian' })).toBe(false)
  })

  it('names what moving the chords would do', () => {
    expect(homeMove(C, C)).toBe('none')
    expect(homeMove(C, { tonic: 'A', mode: 'aeolian' })).toBe('same-notes')
    expect(homeMove(C, { tonic: 'D', mode: 'ionian' })).toBe('transpose')
    expect(homeMove(C, { tonic: 'C', mode: 'dorian' })).toBe('reshape')
    expect(homeMove(C, { tonic: 'D', mode: 'aeolian' })).toBe('move')
  })
})

describe('detectHome', () => {
  it('finds the home a progression points to', () => {
    expect(detectHome(track('C G Am F'))).toEqual(C)
    expect(detectHome(track('Am F C G'))).toEqual({ tonic: 'A', mode: 'aeolian' })
    expect(detectHome(track('Cm7 F7'))).toEqual({ tonic: 'C', mode: 'dorian' })
    expect(detectHome(track('G D Em C'))).toEqual({ tonic: 'G', mode: 'ionian' })
    expect(detectHome([])).toBeNull()
  })

  it('measures how much of the music fits a home', () => {
    expect(homeFit(track('C F G'), C)).toBe(1)
    expect(homeFit(track('C Fm'), C)).toBeLessThan(1)
  })

  it('only suggests a home that fits clearly better', () => {
    // Same notes as C major: no nagging.
    expect(suggestHome(track('Am F C G'), C)).toBeNull()
    // Chords written in E major while home is C major.
    expect(suggestHome(track('E B C#m A'), C)).toEqual({ tonic: 'E', mode: 'ionian' })
  })
})

describe('keyCandidates (Detect from your chords)', () => {
  const names = (t: string) => keyCandidates(track(t)).map((r) => `${r.home.tonic} ${r.home.mode}`)

  it('offers the best key, then major/minor second opinions that fit as well', () => {
    expect(names('C G Am F')).toEqual(['C ionian', 'A aeolian'])
    expect(names('Am F C G')).toEqual(['A aeolian', 'C ionian'])
    // Rare moods only when they are the best match.
    expect(names('Cm7 F7')[0]).toBe('C dorian')
    expect(names('Cm7 F7')).not.toContain('F mixolydian')
  })

  it('handles chords from outside any one key', () => {
    const [best] = keyCandidates(track('C Fm G C'))
    expect(best.home).toEqual(C)
    expect(best.fit).toBeLessThan(1)
    expect(homeReason(best)).toMatch(/^\d+% of the notes fit · starts and ends on C$/)
  })

  it('says why in plain words', () => {
    const [c, a] = keyCandidates(track('C G Am F'))
    expect(homeReason(c)).toBe('Every note fits · starts on C')
    expect(homeReason(a)).toBe('Every note fits')
    expect(homeReason(keyCandidates(track('Am F G Am'))[0])).toBe('Every note fits · starts and ends on Am')
  })

  it('ranks every key and mood, and nothing for an empty track', () => {
    expect(rankHomes(track('C G'))).toHaveLength(12 * MODES.length)
    expect(rankHomes([])).toEqual([])
    expect(keyCandidates([])).toEqual([])
  })
})

describe('spiceChords', () => {
  const names = (tonic: string, mode: (typeof MODES)[number], flavor?: 'triads' | '7ths' | '9ths') =>
    spiceChords(tonic, mode, flavor).map((s) => chordName(s.chord))

  it('offers popular borrowed and leading chords for a major home', () => {
    expect(names('C', 'ionian')).toEqual(['Fm', 'Bb', 'D', 'Ab', 'E', 'Eb', 'A', 'B'])
    expect(spiceChords('C', 'ionian').map((s) => s.tag).slice(0, 3)).toEqual(['borrowed', 'borrowed', '→ G'])
  })

  it('follows the palette size', () => {
    expect(names('C', 'ionian', '7ths').slice(0, 4)).toEqual(['Fm7', 'Bb7', 'D7', 'Abmaj7'])
  })

  it('offers the classic minor-key borrowings', () => {
    expect(names('A', 'aeolian').slice(0, 3)).toEqual(['E', 'D', 'A'])
  })

  it('never offers chords that are already in the key, in any home', () => {
    for (const mode of MODES) {
      for (const tonic of ['C', 'F#', 'Bb']) {
        const spice = spiceChords(tonic, mode, '7ths')
        expect(spice.length).toBeGreaterThan(2)
        for (const s of spice) expect(isDiatonic(s.chord, tonic, mode)).toBe(false)
      }
    }
  })
})
