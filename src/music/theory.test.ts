import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { progressionToMidi } from './midi'
import { diatonicChords, voiceChord } from './theory'

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

describe('progressionToMidi', () => {
  it('writes one note per chord tone at the right ticks', () => {
    const bytes = progressionToMidi(
      [
        { id: 'a', symbol: 'C', roman: 'I', beats: 4 },
        { id: 'b', symbol: 'G', roman: 'V', beats: 4 },
      ],
      120,
    )
    const parsed = new Midi(bytes)
    const notes = parsed.tracks[0].notes
    expect(notes).toHaveLength(6)
    expect(notes[3].ticks).toBe(4 * parsed.header.ppq)
  })
})
