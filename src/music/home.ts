import { Note, Scale } from 'tonal'
import { analyzeChord } from './analysis'
import { chordName, chordType, makeChord, noteAt, soundingNotes, type Chord } from './chord'
import {
  degreeChord,
  FLAVORS,
  isDiatonic,
  KEYS,
  MODES,
  scaleNotes,
  stackChord,
  type ModeName,
  type PaletteFlavor,
} from './theory'
import { chordClips, type Clip } from './timeline'

/**
 * Home: the key + mood a song is measured against (colors, numerals, "in key"). Home is
 * context, not content: changing it re-labels the chords, it never changes them. Moving
 * the chords to a new home is a separate, explicit action (chordToKey).
 */
export type Home = { tonic: string; mode: ModeName }

const chromas = (notes: string[]) => [...new Set(notes.map((n) => Note.chroma(n)))].sort((a, b) => a! - b!).join()

/** True if two homes use exactly the same notes (relative keys, like C major and A minor). */
export const sameNotes = (a: Home, b: Home) => chromas(scaleNotes(a.tonic, a.mode)) === chromas(scaleNotes(b.tonic, b.mode))

/** What "move my chords" would do going from `from` to `to`. */
export type HomeMove = 'none' | 'same-notes' | 'transpose' | 'reshape' | 'move'

export function homeMove(from: Home, to: Home): HomeMove {
  const sameTonic = Note.chroma(from.tonic) === Note.chroma(to.tonic)
  if (sameTonic && from.mode === to.mode) return 'none'
  if (sameNotes(from, to)) return 'same-notes'
  if (from.mode === to.mode) return 'transpose'
  return sameTonic ? 'reshape' : 'move'
}

/** How common each mood is as a home (tie-breaker when several fit equally). */
const MODE_COMMONNESS: Record<ModeName, number> = {
  ionian: 1,
  aeolian: 0.9,
  dorian: 0.7,
  mixolydian: 0.7,
  lydian: 0.5,
  phrygian: 0.5,
  locrian: 0.1,
}

/** Share (0–1) of the track's sounding notes, weighted by length, that are in the home's scale. */
export function homeFit(clips: Clip[], home: Home): number {
  const scale = new Set(scaleNotes(home.tonic, home.mode).map((n) => Note.chroma(n)))
  let inside = 0
  let total = 0
  for (const c of chordClips(clips)) {
    for (const n of soundingNotes(c.chord)) {
      total += c.length
      if (scale.has(Note.chroma(n))) inside += c.length
    }
  }
  return total ? inside / total : 1
}

/** How strongly the track points at a home: fit first, then whether its home chord is there (and first/last). */
function homeScore(clips: Clip[], home: Home): number {
  const sorted = chordClips(clips).sort((a, b) => a.start - b.start)
  const tonicTriad = degreeChord(home.tonic, home.mode, 0, 3)
  const isHomeChord = (c: Chord) =>
    Note.chroma(c.root) === Note.chroma(home.tonic) && chordType(c.type).lower === chordType(tonicTriad.type).lower
  const total = sorted.reduce((s, c) => s + c.length, 0) || 1
  const homeShare = sorted.filter((c) => isHomeChord(c.chord)).reduce((s, c) => s + c.length, 0) / total
  return (
    homeFit(sorted, home) * 10 +
    homeShare * 2 +
    (sorted[0] && isHomeChord(sorted[0].chord) ? 0.6 : 0) +
    (sorted.length > 1 && isHomeChord(sorted[sorted.length - 1].chord) ? 0.3 : 0) +
    MODE_COMMONNESS[home.mode] * 0.1
  )
}

/** The home the chords point to most strongly, or null for an empty track. */
export function detectHome(clips: Clip[]): Home | null {
  if (chordClips(clips).length === 0) return null
  let best: { home: Home; score: number } | null = null
  for (const tonic of KEYS) {
    for (const mode of MODES) {
      const home = { tonic, mode }
      const score = homeScore(clips, home)
      if (!best || score > best.score) best = { home, score }
    }
  }
  return best!.home
}

/**
 * A better home to suggest, if the chords fit one noticeably better than the current
 * home. Equal fits (C major vs A minor, same notes) never nag.
 */
export function suggestHome(clips: Clip[], current: Home): Home | null {
  const best = detectHome(clips)
  if (!best) return null
  return homeFit(clips, best) > homeFit(clips, current) + 0.05 ? best : null
}

/** Ways to find a spice chord: a chord of another scale with the same home note, or a "V of" a key chord. */
type Recipe = { borrow: ModeName | 'harmonic'; degree: number } | { leadTo: number }

/** Spice for major-type homes, most useful first: minor iv, ♭VII, V of V, ♭VI, V of vi, ♭III, V of ii, V of IV, V of iii. */
const MAJOR_SPICE: Recipe[] = [
  { borrow: 'aeolian', degree: 3 },
  { borrow: 'aeolian', degree: 6 },
  { leadTo: 4 },
  { borrow: 'aeolian', degree: 5 },
  { leadTo: 5 },
  { borrow: 'aeolian', degree: 2 },
  { leadTo: 1 },
  { leadTo: 3 },
  { leadTo: 2 },
]

/** Spice for minor-type homes: major V, major IV, major I, V of iv, ♭II, V of v, V of VI. */
const MINOR_SPICE: Recipe[] = [
  { borrow: 'harmonic', degree: 4 },
  { borrow: 'dorian', degree: 3 },
  { borrow: 'ionian', degree: 0 },
  { leadTo: 3 },
  { borrow: 'phrygian', degree: 1 },
  { leadTo: 4 },
  { leadTo: 5 },
]

const MAJOR_TYPE: ModeName[] = ['ionian', 'lydian', 'mixolydian']

/** Most spice chords shown at once. */
export const MAX_SPICE = 8

export type SpiceChord = {
  chord: Chord
  roman: string
  /** Short reason, as on clips: "borrowed", "→ G". */
  tag: string
}

/**
 * Popular chords from outside the home key, ready to borrow (borrowed from the same
 * home note's other moods, or "leading" chords that pull into a chord of the key), at
 * the palette's size. Chords that are already in the key are skipped.
 */
export function spiceChords(tonic: string, mode: ModeName, flavor: PaletteFlavor = 'triads'): SpiceChord[] {
  const size = FLAVORS.find((f) => f.key === flavor)?.size ?? 3
  const recipes = MAJOR_TYPE.includes(mode) ? MAJOR_SPICE : MINOR_SPICE
  const seen = new Set<string>()
  const out: SpiceChord[] = []
  for (const r of recipes) {
    let chord: Chord
    if ('borrow' in r) {
      const scale = r.borrow === 'harmonic' ? Scale.get(`${tonic} harmonic minor`).notes : scaleNotes(tonic, r.borrow)
      chord = stackChord(scale, r.degree, size)
    } else {
      const target = scaleNotes(tonic, mode)[r.leadTo]
      const triad = degreeChord(tonic, mode, r.leadTo, 3)
      if (triad.type !== '' && triad.type !== 'm') continue
      chord = makeChord(noteAt(target, '5P'), size >= 5 ? '9' : size === 4 ? '7' : '')
    }
    if (isDiatonic(chord, tonic, mode)) continue
    const name = chordName(chord)
    if (seen.has(name)) continue
    seen.add(name)
    const { fit } = analyzeChord(chord, tonic, mode)
    out.push({ chord, roman: fit.roman, tag: fit.tag ?? '' })
    if (out.length === MAX_SPICE) break
  }
  return out
}
