import { Interval, Mode, Note } from 'tonal'
import { chordIntervals, chordType, fromIntervals, noteAt, soundingNotes, transposeChord, withBass, type Chord } from './chord'

export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const

/** The scales on offer, most common first (the order they're listed in). */
export const MODES = ['ionian', 'aeolian', 'dorian', 'mixolydian', 'lydian', 'phrygian', 'locrian'] as const

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

/** What each scale sounds like, in plain words (and the one note that gives it that sound). */
export const MODE_INFO: Record<ModeName, string> = {
  ionian: 'Bright and happy. The home of most pop.',
  aeolian: 'Sad, emotional, serious. The everyday minor.',
  dorian: 'Minor, but hopeful and a bit funky (raised 6th). Soul, jazz, house.',
  mixolydian: 'Major, but laid-back and bluesy (flat 7th). Classic rock, funk.',
  lydian: 'The brightest: dreamy and floating (raised 4th). Film, sci-fi wonder.',
  phrygian: 'Dark and exotic (flat 2nd). Metal, flamenco, film tension.',
  locrian: 'The darkest: unstable, never feels like home. Rarely used.',
}

/** "C major", "A minor", "D Dorian": how a key is named in explanations. */
export function keyName(tonic: string, mode: ModeName): string {
  if (mode === 'ionian') return `${tonic} major`
  if (mode === 'aeolian') return `${tonic} minor`
  return `${tonic} ${mode[0].toUpperCase()}${mode.slice(1)}`
}

/** How big the palette chords are: plain triads, 7ths, or 9ths. */
export type PaletteFlavor = 'triads' | '7ths' | '9ths'
export const FLAVORS: { key: PaletteFlavor; label: string; size: number; title: string }[] = [
  { key: 'triads', label: 'Triads', size: 3, title: 'Simple 3-note chords' },
  { key: '7ths', label: '7ths', size: 4, title: 'Richer 4-note chords (7th chords)' },
  { key: '9ths', label: '9ths', size: 5, title: 'Lush 5-note chords (9th chords, where they sound good)' },
]

export type ChordSpec = {
  chord: Chord
  /** Roman numeral relative to the current key, e.g. "ii7". */
  roman: string
}

export const scaleNotes = (tonic: string, mode: ModeName): string[] => Mode.notes(mode, tonic)

const chromas = (notes: string[]) => new Set(notes.map((n) => Note.chroma(n)))

/** True if a note (pitch class) is in the key. */
export const noteInKey = (note: string, tonic: string, mode: ModeName) =>
  chromas(scaleNotes(tonic, mode)).has(Note.chroma(note))

/** True if every note you hear (the chord's notes and a slash bass note) is in the key. */
export function isDiatonic(chord: Chord, tonic: string, mode: ModeName): boolean {
  const scale = chromas(scaleNotes(tonic, mode))
  return soundingNotes(chord).every((n) => scale.has(Note.chroma(n)))
}

/** Scale degree (0–6) of the chord's root, or null if the root isn't in the key. Drives chord colors. */
export function rootDegree(chord: Chord, tonic: string, mode: ModeName): number | null {
  const i = scaleNotes(tonic, mode).findIndex((n) => Note.chroma(n) === Note.chroma(chord.root))
  return i < 0 ? null : i
}

/**
 * The chord built on a scale degree by stacking every other scale note: 3 notes = the
 * triad, 4 = the 7th chord, 5 = the 9th chord. A flat 9th (e.g. on the 3rd degree of
 * major) clashes hard, so there the 9th is left off and it stays a 7th chord.
 */
export function degreeChord(tonic: string, mode: ModeName, degree: number, size: number): Chord {
  return stackChord(scaleNotes(tonic, mode), degree, size)
}

/** degreeChord for any 7-note scale (e.g. harmonic minor, which isn't one of the modes). */
export function stackChord(scale: string[], degree: number, size: number): Chord {
  const root = scale[degree]
  const intervals: string[] = []
  for (let k = 0; k < size; k++) {
    if (k === 0) {
      intervals.push('1P')
      continue
    }
    const simple = Interval.distance(root, scale[(degree + 2 * k) % 7])
    const ivl = k === 4 ? (Interval.add(simple, '8P') ?? simple) : simple
    if (k === 4 && Interval.semitones(ivl) === 13) continue
    intervals.push(ivl)
  }
  return fromIntervals(root, intervals)
}

/** The seven chords of a key/mode, at the palette's size. */
export function diatonicChords(tonic: string, mode: ModeName, flavor: PaletteFlavor = 'triads'): ChordSpec[] {
  const size = FLAVORS.find((f) => f.key === flavor)?.size ?? 3
  return Array.from({ length: 7 }, (_, d) => {
    const chord = degreeChord(tonic, mode, d, size)
    return { chord, roman: romanNumeral(chord, tonic, mode) }
  })
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

/** Semitones, normalized into -6..5 (so a difference reads as raised or lowered). */
const signed = (n: number) => ((((n + 6) % 12) + 12) % 12) - 6

/**
 * Roman numeral of any chord in a key: the root's scale degree, ♭/♯ when the root is a
 * lowered/raised scale note (♭VII = the 7th, lowered), lowercase for minor-type chords,
 * plus a suffix for the chord type (7, maj7, °, ø7, ...).
 */
export function romanNumeral(chord: Chord, tonic: string, mode: ModeName): string {
  const scale = scaleNotes(tonic, mode)
  const ivl = Interval.distance(tonic, chord.root)
  const num = Interval.get(ivl).num
  const degree = Number.isFinite(num) ? (((num - 1) % 7) + 7) % 7 : 0
  const diff = signed((Interval.semitones(ivl) ?? 0) - (Interval.semitones(Interval.distance(tonic, scale[degree])) ?? 0))
  const acc = diff > 0 ? '#'.repeat(diff) : 'b'.repeat(-diff)
  const t = chordType(chord.type)
  return acc + (t.lower ? NUMERALS[degree].toLowerCase() : NUMERALS[degree]) + t.roman
}

/**
 * Move a chord to a new key/scale, keeping its role. A chord that's all in the old key
 * keeps its scale degrees: each note moves to the same degree of the new scale (V stays
 * V; Em in C major becomes E♭ in C minor; a 7th stays a 7th; a slash bass keeps its
 * degree too). Anything else (borrowed or outside chords) is transposed by the distance
 * between the two tonics.
 */
export function chordToKey(
  chord: Chord,
  from: { tonic: string; mode: ModeName },
  to: { tonic: string; mode: ModeName },
): Chord {
  const fromScale = scaleNotes(from.tonic, from.mode)
  const toScale = scaleNotes(to.tonic, to.mode)
  const degreeOf = (note: string) => fromScale.findIndex((n) => Note.chroma(n) === Note.chroma(note))
  if (isDiatonic(chord, from.tonic, from.mode)) {
    const d = degreeOf(chord.root)
    const root = toScale[d]
    const intervals = chordIntervals(chord).map((ivl) => {
      const k = degreeOf(noteAt(chord.root, ivl))
      let moved = Interval.distance(root, toScale[k])
      // Keep compound intervals (9ths, 11ths, 13ths) compound.
      while (Interval.get(moved).num < Interval.get(ivl).num) {
        const up = Interval.add(moved, '8P')
        if (!up) break
        moved = up
      }
      return moved
    })
    const bass = chord.bass === undefined ? null : toScale[degreeOf(chord.bass)]
    return withBass(fromIntervals(root, intervals, chord.inversion), bass)
  }
  if (from.tonic === to.tonic) return chord
  return transposeChord(chord, Interval.distance(from.tonic, to.tonic))
}
