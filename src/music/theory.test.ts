import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { clipsToMidi } from './midi'
import { chordInKey, chordToKey, diatonicChords, voiceChord } from './theory'
import { TICKS_PER_BAR } from './timeline'

describe('diatonicChords', () => {
  it('builds C major triads with roman numerals', () => {
    expect(diatonicChords('C', 'ionian')).toEqual([
      { symbol: 'C', roman: 'I' },
      { symbol: 'Dm', roman: 'ii' },
      { symbol: 'Em', roman: 'iii' },
      { symbol: 'F', roman: 'IV' },
      { symbol: 'G', roman: 'V' },
      { symbol: 'Am', roman: 'vi' },
      { symbol: 'Bdim', roman: 'vii°' },
    ])
  })

  it('builds seventh chords', () => {
    expect(diatonicChords('C', 'ionian', true).map((c) => c.roman)).toEqual([
      'Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7',
    ])
  })
})

describe('voiceChord', () => {
  it('stacks notes ascending from the root', () => {
    expect(voiceChord('C')).toEqual([48, 52, 55])
    expect(voiceChord('Am7')).toEqual([57, 60, 64, 67])
  })
})

describe('chordInKey', () => {
  it('finds degree and numeral, matching enharmonics', () => {
    expect(chordInKey('G7', 'C', 'ionian')).toEqual({ degree: 4, roman: 'V7', sevenths: true })
    expect(chordInKey('C#m', 'E', 'ionian')).toEqual({ degree: 5, roman: 'vi', sevenths: false })
    expect(chordInKey('Dbm', 'E', 'ionian')).toEqual({ degree: 5, roman: 'vi', sevenths: false })
    expect(chordInKey('Bb', 'C', 'ionian')).toBeNull()
  })
})

describe('chordToKey', () => {
  const C = { tonic: 'C', mode: 'ionian' as const }

  it('keeps scale degree and chord size when changing key', () => {
    expect(chordToKey('G', C, { tonic: 'D', mode: 'ionian' })).toBe('A')
    expect(chordToKey('Dm7', C, { tonic: 'Eb', mode: 'ionian' })).toBe('Fm7')
  })

  it('keeps scale degree when changing scale', () => {
    expect(chordToKey('Em', C, { tonic: 'C', mode: 'aeolian' })).toBe('Eb')
  })

  it('transposes non-diatonic chords by the tonic distance', () => {
    expect(chordToKey('Bb', C, { tonic: 'D', mode: 'ionian' })).toBe('C')
    expect(chordToKey('Bb', C, { tonic: 'C', mode: 'dorian' })).toBe('Bb')
  })
})

describe('clipsToMidi', () => {
  it('writes one note per chord tone at the right ticks', () => {
    const bytes = clipsToMidi(
      [
        { id: 'a', symbol: 'C', start: 0, length: TICKS_PER_BAR },
        { id: 'b', symbol: 'G', start: TICKS_PER_BAR, length: TICKS_PER_BAR },
      ],
      120,
    )
    const parsed = new Midi(bytes)
    expect(parsed.header.timeSignatures[0].timeSignature).toEqual([4, 4])
    const notes = parsed.tracks[0].notes
    expect(notes).toHaveLength(6)
    expect(notes[3].ticks).toBe(4 * parsed.header.ppq)
  })
})
