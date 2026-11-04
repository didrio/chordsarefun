import { describe, expect, it } from 'vitest'
import {
  bassNote,
  canInvert,
  chordName,
  chordNotes,
  fromIntervals,
  invert,
  inversionName,
  isChord,
  isSlash,
  lowestNote,
  makeChord,
  sameChord,
  shiftOctave,
  soundingNotes,
  toggleNote,
  voiceChord,
  voicedNoteNames,
  withBass,
  withRoot,
  withType,
  type Chord,
} from './chord'
import { parseChord } from './parse'

const chord = (name: string) => parseChord(name)!

describe('chordName / chordNotes', () => {
  it('names plain types', () => {
    expect(chordName(makeChord('D', 'm7'))).toBe('Dm7')
    expect(chordNotes(makeChord('D', 'm7'))).toEqual(['D', 'F', 'A', 'C'])
    expect(chordNotes(makeChord('Bb', 'maj9'))).toEqual(['Bb', 'D', 'F', 'A', 'C'])
  })

  it('spells without double flats/sharps', () => {
    expect(chordNotes(makeChord('C', 'dim7'))).toEqual(['C', 'Eb', 'Gb', 'A'])
  })

  it('names edits and inversions', () => {
    expect(chordName({ ...makeChord('C', '7'), omit: ['5P'] })).toBe('C7(no 5)')
    expect(chordName({ ...makeChord('C'), add: ['11P'] })).toBe('Cadd11')
    expect(chordName({ ...makeChord('C', '7'), add: ['13M'] })).toBe('C7(add13)')
    expect(chordName({ ...makeChord('C'), bass: 'E' })).toBe('C/E')
  })

  it('never turns an inversion into a slash chord', () => {
    for (const inversion of [-2, -1, 1, 2, 3]) expect(chordName({ ...makeChord('C', 'maj7'), inversion })).toBe('Cmaj7')
  })
})

describe('voiceChord', () => {
  it('stacks notes from the root in octave 3', () => {
    expect(voiceChord(makeChord('C'))).toEqual([48, 52, 55])
    expect(voiceChord(makeChord('A', 'm7'))).toEqual([57, 60, 64, 67])
    // 9ths sit above the octave.
    expect(voiceChord(makeChord('C', 'add9'))).toEqual([48, 52, 55, 62])
  })

  it('inverts up (lowest note up an octave) and down (highest note down)', () => {
    const c = makeChord('C')
    expect(voiceChord({ ...c, inversion: 1 })).toEqual([52, 55, 60])
    expect(voiceChord({ ...c, inversion: 2 })).toEqual([55, 60, 64])
    expect(voiceChord({ ...c, inversion: 3 })).toEqual([60, 64, 67])
    expect(voiceChord({ ...c, inversion: -1 })).toEqual([43, 48, 52])
  })

  it('lists voiced note names low to high', () => {
    expect(voicedNoteNames({ ...makeChord('C'), inversion: 1 })).toEqual(['E', 'G', 'C'])
  })
})

describe('inversions', () => {
  it('names the shape from the lowest voiced note, and leaves the bass alone', () => {
    const c = makeChord('C', 'maj7')
    expect([lowestNote(c), inversionName(c)]).toEqual(['C', 'root position'])
    expect([lowestNote(invert(c, 1)), inversionName(invert(c, 1))]).toEqual(['E', '1st inversion'])
    expect(bassNote(invert(c, 1))).toBe('C')
    expect(inversionName(invert(c, -1))).toBe('3rd inversion')
    // Root position an octave up is still root position.
    expect(inversionName({ ...c, inversion: 4 })).toBe('root position')
  })

  it('stops at the edges of the playable range', () => {
    let c: Chord = makeChord('C')
    for (let i = 0; i < 20; i++) c = invert(c, -1)
    expect(canInvert(c, -1)).toBe(false)
    expect(voiceChord(c)[0]).toBeGreaterThanOrEqual(36)
    for (let i = 0; i < 40; i++) c = invert(c, 1)
    expect(canInvert(c, 1)).toBe(false)
    expect(voiceChord(c).at(-1)).toBeLessThanOrEqual(88)
  })
})

describe('shiftOctave', () => {
  it('moves every note 12 semitones, keeping the inversion', () => {
    const c = parseChord('Cmaj7/E')!
    const up = shiftOctave(c, 1)!
    expect(voiceChord(up)).toEqual(voiceChord(c).map((m) => m + 12))
    expect(chordName(up)).toBe('Cmaj7/E')
    expect(voiceChord(shiftOctave(c, -1)!)).toEqual(voiceChord(c).map((m) => m - 12))
  })

  it('moves wide chords (9ths, 13ths) exactly an octave too', () => {
    for (const name of ['Cm9', 'C13', 'Fmaj9/A']) {
      const c = parseChord(name)!
      expect(voiceChord(shiftOctave(c, 1)!)).toEqual(voiceChord(c).map((m) => m + 12))
      expect(chordName(shiftOctave(c, 1)!)).toBe(chordName(c))
    }
  })

  it('refuses to leave the playable range', () => {
    expect(shiftOctave(makeChord('C'), -1)).not.toBeNull()
    expect(shiftOctave(shiftOctave(makeChord('C'), -1)!, -1)).toBeNull()
  })
})

describe('slash chords (bass note)', () => {
  it('sets and clears a bass note, separate from the inversion', () => {
    const c = withBass(makeChord('C'), 'E')
    expect([chordName(c), bassNote(c), isSlash(c), c.inversion]).toEqual(['C/E', 'E', true, 0])
    expect(chordName(withBass(c, null))).toBe('C')
    // The root as bass is no slash at all.
    expect(withBass(c, 'C').bass).toBeUndefined()
    expect(chordName(invert(c, 1))).toBe('C/E')
  })

  it('counts a bass note outside the chord as part of the sound', () => {
    expect(soundingNotes(withBass(makeChord('F'), 'G'))).toEqual(['G', 'F', 'A', 'C'])
    expect(soundingNotes(withBass(makeChord('C'), 'E'))).toEqual(['C', 'E', 'G'])
  })

  it('keeps the bass through edits, and moves it with the root', () => {
    const c = withBass(makeChord('C'), 'E')
    expect(chordName(withType(c, 'maj7'))).toBe('Cmaj7/E')
    expect(chordName(toggleNote(c, 'D'))).toBe('Cadd9/E')
    expect(chordName(withRoot(c, 'D'))).toBe('D/F#')
  })
})

describe('fromIntervals', () => {
  it('finds the type that explains the notes', () => {
    expect(chordName(fromIntervals('C', ['1P', '3M', '5P', '7m']))).toBe('C7')
    expect(chordName(fromIntervals('C', ['1P', '4P', '5P']))).toBe('Csus4')
    // A 2nd and a 9th are the same note: C D G is sus2, however it's written.
    expect(chordName(fromIntervals('C', ['1P', '5P', '9M']))).toBe('Csus2')
  })

  it('prefers adding notes over removing them, and drops the 5th before the 3rd', () => {
    expect(chordName(fromIntervals('C', ['1P', '3M', '5P', '11P']))).toBe('Cadd11')
    expect(chordName(fromIntervals('C', ['1P', '3M', '7m']))).toBe('C7(no 5)')
    expect(chordName(fromIntervals('C', ['1P', '5P', '7m']))).toBe('C7(no 3)')
  })
})

describe('toggleNote', () => {
  it('adds notes and renames canonically', () => {
    let c = makeChord('C')
    c = toggleNote(c, 'Bb')
    expect(chordName(c)).toBe('C7')
    c = toggleNote(c, 'D')
    expect(chordName(c)).toBe('C9')
    c = toggleNote(c, 'A')
    expect(chordName(c)).toBe('C13')
  })

  it('removes notes, but never below two', () => {
    let c = toggleNote(makeChord('C'), 'E')
    expect(chordName(c)).toBe('C5')
    c = toggleNote(c, 'G')
    expect(chordName(c)).toBe('C5')
  })

  it('keeps the inversion', () => {
    const c = toggleNote({ ...makeChord('C'), inversion: 1 }, 'D')
    expect([chordName(c), c.inversion]).toEqual(['Cadd9', 1])
  })
})

describe('withType', () => {
  it('swaps the flavor, keeping root and inversion', () => {
    const c = withType({ ...makeChord('D', 'm'), inversion: 1 }, 'm7')
    expect([chordName(c), c.inversion]).toEqual(['Dm7', 1])
  })
})

describe('sameChord / isChord', () => {
  it('compares and validates', () => {
    expect(sameChord(chord('Cadd9'), chord('Cadd2'))).toBe(true)
    expect(sameChord(chord('C'), chord('C/E'))).toBe(false)
    expect(sameChord(chord('C'), { ...chord('C'), inversion: 1 })).toBe(false)
    expect(isChord({ ...makeChord('C'), bass: 'E' })).toBe(true)
    expect(isChord({ ...makeChord('C'), bass: 'H' })).toBe(false)
    expect(isChord(makeChord('C'))).toBe(true)
    expect(isChord({ ...makeChord('C'), type: 'nope' })).toBe(false)
    expect(isChord({ root: 'C' })).toBe(false)
  })
})
