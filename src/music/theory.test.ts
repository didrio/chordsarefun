import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { chordName, makeChord } from './chord'
import { parseChord } from './parse'
import { applyGroove, DEFAULT_GROOVE, GROOVES } from './grooves'
import { trackMidi } from './midi'
import { chordToKey, diatonicChords, isDiatonic, keyName, MODES, romanNumeral, rootDegree } from './theory'
import { TICKS_PER_BAR } from './timeline'

const names = (tonic: string, mode: (typeof MODES)[number], flavor?: 'triads' | '7ths' | '9ths') =>
  diatonicChords(tonic, mode, flavor).map((c) => chordName(c.chord))
const chord = (name: string) => parseChord(name)!

describe('diatonicChords', () => {
  it('builds C major triads with roman numerals', () => {
    expect(names('C', 'ionian')).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'])
    expect(diatonicChords('C', 'ionian').map((c) => c.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
  })

  it('builds seventh chords', () => {
    expect(names('C', 'ionian', '7ths')).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5'])
    expect(diatonicChords('C', 'ionian', '7ths').map((c) => c.roman)).toEqual([
      'Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7',
    ])
  })

  it('builds ninth chords, leaving off flat 9ths (they clash)', () => {
    expect(names('C', 'ionian', '9ths')).toEqual(['Cmaj9', 'Dm9', 'Em7', 'Fmaj9', 'G9', 'Am9', 'Bm7b5'])
    expect(names('A', 'aeolian', '9ths')).toEqual(['Am9', 'Bm7b5', 'Cmaj9', 'Dm9', 'Em7', 'Fmaj9', 'G9'])
  })

  it('works in every mode and key', () => {
    for (const mode of MODES) {
      for (const tonic of ['C', 'F#', 'Bb', 'Eb']) {
        for (const spec of diatonicChords(tonic, mode, '9ths')) expect(isDiatonic(spec.chord, tonic, mode)).toBe(true)
      }
    }
  })
})

describe('romanNumeral', () => {
  it('marks lowered and raised roots and chord types', () => {
    expect(romanNumeral(chord('Bb'), 'C', 'ionian')).toBe('bVII')
    expect(romanNumeral(chord('Fm'), 'C', 'ionian')).toBe('iv')
    expect(romanNumeral(chord('Ab'), 'C', 'aeolian')).toBe('VI')
    expect(romanNumeral(chord('F#dim7'), 'C', 'ionian')).toBe('#iv°7')
    expect(romanNumeral(chord('Dm9'), 'C', 'ionian')).toBe('ii9')
  })
})

describe('rootDegree', () => {
  it('finds the degree of the root, matching enharmonics', () => {
    expect(rootDegree(chord('G7'), 'C', 'ionian')).toBe(4)
    expect(rootDegree(chord('D'), 'C', 'ionian')).toBe(1)
    expect(rootDegree(chord('Dbm'), 'E', 'ionian')).toBe(5)
    expect(rootDegree(chord('Bb'), 'C', 'ionian')).toBeNull()
  })
})

describe('keyName', () => {
  it('names keys the way people say them', () => {
    expect(keyName('C', 'ionian')).toBe('C major')
    expect(keyName('A', 'aeolian')).toBe('A minor')
    expect(keyName('D', 'dorian')).toBe('D Dorian')
  })
})

describe('isDiatonic with a slash bass', () => {
  it('counts the bass note', () => {
    expect(isDiatonic(chord('F/G'), 'C', 'ionian')).toBe(true)
    expect(isDiatonic(chord('C/Bb'), 'C', 'ionian')).toBe(false)
  })
})

describe('chordToKey', () => {
  const C = { tonic: 'C', mode: 'ionian' as const }
  const to = (name: string, tonic: string, mode: (typeof MODES)[number]) => chordName(chordToKey(chord(name), C, { tonic, mode }))

  it('keeps scale degree and chord size when changing key', () => {
    expect(to('G', 'D', 'ionian')).toBe('A')
    expect(to('Dm7', 'Eb', 'ionian')).toBe('Fm7')
    expect(to('Cmaj9', 'G', 'ionian')).toBe('Gmaj9')
  })

  it('keeps scale degree when changing scale', () => {
    expect(to('Em', 'C', 'aeolian')).toBe('Eb')
    expect(to('Cmaj9', 'C', 'aeolian')).toBe('Cm9')
    expect(to('G7', 'C', 'aeolian')).toBe('Gm7')
  })

  it('keeps slash basses, inversions and edits', () => {
    expect(to('C/E', 'D', 'ionian')).toBe('D/F#')
    // The bass keeps its degree too: in C minor, C/E (3rd in the bass) becomes Cm/E♭.
    expect(to('C/E', 'C', 'aeolian')).toBe('Cm/Eb')
    expect(chordToKey({ ...chord('C'), inversion: 2 }, C, { tonic: 'D', mode: 'ionian' }).inversion).toBe(2)
    expect(to('Bb/D', 'D', 'ionian')).toBe('C/E')
    expect(to('Cadd9', 'F', 'ionian')).toBe('Fadd9')
    expect(to('G7(no 5)', 'A', 'ionian')).toBe('E7(no 5)')
  })

  it('transposes non-diatonic chords by the tonic distance', () => {
    expect(to('Bb', 'D', 'ionian')).toBe('C')
    expect(to('Bb', 'C', 'dorian')).toBe('Bb')
    expect(to('D7', 'G', 'ionian')).toBe('A7')
  })
})

describe('trackMidi', () => {
  it('writes one note per chord tone at the right ticks', () => {
    const bytes = trackMidi({
      clips: [
        { id: 'a', chord: makeChord('C'), start: 0, length: TICKS_PER_BAR },
        { id: 'b', chord: { ...makeChord('G'), inversion: 1 }, start: TICKS_PER_BAR, length: TICKS_PER_BAR },
      ],
      totalTicks: 2 * TICKS_PER_BAR,
      bpm: 120,
      sig: { beats: 4, unit: 4 },
      groove: applyGroove(DEFAULT_GROOVE, GROOVES[0]),
      parts: ['chords'],
    })
    const parsed = new Midi(bytes)
    expect(parsed.header.timeSignatures[0].timeSignature).toEqual([4, 4])
    const notes = parsed.tracks[0].notes
    expect(notes).toHaveLength(6)
    expect(notes[3].ticks).toBe(4 * parsed.header.ppq)
    // G/B: the same voicing as playback (B in the bass).
    expect(notes.slice(3).map((n) => n.midi)).toEqual([59, 62, 67])
  })
})

describe('trackMidi parts', () => {
  it('writes chords, bass and drums as separate tracks, drums on channel 10', () => {
    const bytes = trackMidi({
      clips: [{ id: 'a', chord: makeChord('C'), start: 0, length: TICKS_PER_BAR }],
      totalTicks: TICKS_PER_BAR,
      bpm: 120,
      sig: { beats: 4, unit: 4 },
      groove: DEFAULT_GROOVE,
      parts: ['chords', 'bass', 'drums'],
    })
    const tracks = new Midi(bytes).tracks
    expect(tracks.map((t) => t.name)).toEqual(['Chords', 'Bass', 'Drums'])
    expect(tracks[2].channel).toBe(9)
    expect(tracks[1].notes[0].midi).toBe(36)
    expect(tracks[2].notes.some((n) => n.midi === 36)).toBe(true)
  })
})
