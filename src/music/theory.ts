import { Chord, Mode, Note } from 'tonal'

export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export const MODES = [
  'ionian',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'aeolian',
  'locrian',
] as const

export type ModeName = (typeof MODES)[number]

export type ChordSpec = {
  /** Chord symbol Tonal understands, e.g. "Dm7" */
  symbol: string
  /** Roman numeral relative to the current key, e.g. "ii7" */
  roman: string
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

function romanFor(degree: number, symbol: string, sevenths: boolean): string {
  const chord = Chord.get(symbol)
  const base = NUMERALS[degree]
  const isLower = chord.quality === 'Minor' || chord.quality === 'Diminished'
  const numeral = isLower ? base.toLowerCase() : base

  if (chord.type === 'half-diminished') return `${numeral}ø7`
  if (chord.quality === 'Diminished') return `${numeral}°${sevenths ? '7' : ''}`
  if (chord.quality === 'Augmented') return `${numeral}+`
  if (!sevenths) return numeral
  if (chord.type === 'major seventh') return `${numeral}maj7`
  return `${numeral}7`
}

/** The seven diatonic chords of a key/mode, as triads or seventh chords. */
export function diatonicChords(tonic: string, mode: ModeName, sevenths = false): ChordSpec[] {
  const symbols = sevenths ? Mode.seventhChords(mode, tonic) : Mode.triads(mode, tonic)
  return symbols.map((symbol, i) => ({ symbol, roman: romanFor(i, symbol, sevenths) }))
}

/**
 * Close-position voicing as MIDI note numbers: root in `rootOctave`,
 * each following chord tone stacked above the previous one.
 */
export function voiceChord(symbol: string, rootOctave = 3): number[] {
  const { notes } = Chord.get(symbol)
  const midi: number[] = []
  for (const pc of notes) {
    let octave = rootOctave
    let m = Note.midi(`${pc}${octave}`)
    while (m !== null && midi.length > 0 && m <= midi[midi.length - 1]) {
      m = Note.midi(`${pc}${++octave}`)
    }
    if (m !== null) midi.push(m)
  }
  return midi
}
