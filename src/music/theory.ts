import { Chord, Interval, Mode, Note } from 'tonal'

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

/** Friendlier names so non-theory users recognize major/minor. */
export const MODE_LABELS: Record<ModeName, string> = {
  ionian: 'Major (Ionian)',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  aeolian: 'Minor (Aeolian)',
  locrian: 'Locrian',
}

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

const chromas = (symbol: string) => Chord.get(symbol).notes.map(Note.chroma).join(',')

/**
 * Where a chord sits in a key: its scale degree (0-6), roman numeral, and whether it's
 * the seventh-chord form; or null if it isn't diatonic. Compares pitch classes, so
 * enharmonics match.
 */
export function chordInKey(
  symbol: string,
  tonic: string,
  mode: ModeName,
): { degree: number; roman: string; sevenths: boolean } | null {
  const target = chromas(symbol)
  for (const sevenths of [false, true]) {
    const chords = diatonicChords(tonic, mode, sevenths)
    const degree = chords.findIndex((c) => chromas(c.symbol) === target)
    if (degree >= 0) return { degree, roman: chords[degree].roman, sevenths }
  }
  return null
}

/**
 * Move a chord to a new key/scale, keeping its role: a diatonic chord becomes the chord
 * at the same scale degree in the new key (V stays V); anything else is transposed by
 * the distance between the two tonics.
 */
export function chordToKey(
  symbol: string,
  from: { tonic: string; mode: ModeName },
  to: { tonic: string; mode: ModeName },
): string {
  const info = chordInKey(symbol, from.tonic, from.mode)
  if (info) return diatonicChords(to.tonic, to.mode, info.sevenths)[info.degree].symbol
  if (from.tonic === to.tonic) return symbol
  const [root, type] = Chord.tokenize(Chord.transpose(symbol, Interval.distance(from.tonic, to.tonic)))
  return root ? Note.simplify(root) + type : symbol
}

export const chordNotes = (symbol: string) => Chord.get(symbol).notes

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
