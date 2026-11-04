import { Interval, Note } from 'tonal'

/**
 * A chord on a clip, as a description rather than raw notes: what it is (root + type)
 * plus edits on top (added/removed notes, inversion). Notes, the name and the voicing
 * are all derived from it, so key changes can keep the chord's role, names stay
 * readable, and every note edit is one clear change.
 *
 * Kept canonical by `fromIntervals`: the type is whichever known chord type explains
 * the notes best, so adding a B♭ to C gives C7, not "C add ♭7".
 */
export type Chord = {
  /** Pitch class, e.g. "D", "F#", "Bb". */
  root: string
  /** A CHORD_TYPES symbol, e.g. "" (major), "m7", "sus4". */
  type: string
  /** Extra intervals on top of the type, e.g. ["9M"] (add9). */
  add: string[]
  /** Intervals of the type left out, e.g. ["5P"] (no 5). */
  omit: string[]
  /**
   * The shape of the chord part's voicing: 0 = root position, each +1 moves the lowest
   * note up an octave (1st inversion shape, 2nd, ...), each -1 the highest note down.
   * It never changes the bass note: inverting is voicing, not a slash chord.
   */
  inversion: number
  /**
   * A bass note other than the root (pitch class), making a slash chord: C/E, F/G.
   * Absent = the root. A deliberate choice, separate from the inversion.
   */
  bass?: string
}

export type ChordGroup = 'basic' | 'open' | 'sixth' | 'seventh' | 'ninth' | 'eleventh' | 'thirteenth' | 'tense'

export type ChordType = {
  /** Suffix after the root in the chord name, e.g. "m7". Also the type's id. */
  symbol: string
  /** Theory name, e.g. "minor 7th". */
  name: string
  /** Intervals from the root, in Tonal notation. */
  intervals: string[]
  group: ChordGroup
  /** How it sounds, in plain words. */
  feel: string
  /** Roman numeral written in lowercase (minor-ish chords). */
  lower: boolean
  /** Roman numeral suffix, e.g. "7", "°", "ø7". */
  roman: string
}

const type = (
  symbol: string,
  name: string,
  intervals: string,
  group: ChordGroup,
  feel: string,
  lower: boolean,
  roman = symbol,
): ChordType => ({ symbol, name, intervals: intervals.split(' '), group, feel, lower, roman })

/**
 * The chord vocabulary, in the order variations are offered (and preferred when two
 * types explain the same notes equally well).
 */
export const CHORD_TYPES: ChordType[] = [
  type('', 'major', '1P 3M 5P', 'basic', 'Bright and stable', false),
  type('m', 'minor', '1P 3m 5P', 'basic', 'Darker and softer', true, ''),
  type('dim', 'diminished', '1P 3m 5d', 'basic', 'Tense and unstable', true, '°'),
  type('aug', 'augmented', '1P 3M 5A', 'basic', 'Dreamy and unresolved', false, '+'),
  type('sus2', 'suspended 2nd', '1P 2M 5P', 'open', 'Open and airy', false),
  type('sus4', 'suspended 4th', '1P 4P 5P', 'open', 'Hanging; wants to settle back to major', false),
  type('5', 'power chord', '1P 5P', 'open', 'No 3rd: neither happy nor sad', false),
  type('7sus4', 'suspended dominant 7th', '1P 4P 5P 7m', 'open', 'Floating; wants to move on', false),
  type('6', 'major 6th', '1P 3M 5P 6M', 'sixth', 'Sweet and vintage', false),
  type('m6', 'minor 6th', '1P 3m 5P 6M', 'sixth', 'Minor with a bittersweet lift', true, '6'),
  type('6/9', 'six-nine', '1P 3M 5P 6M 9M', 'sixth', 'Lush, jazzy major', false),
  type('maj7', 'major 7th', '1P 3M 5P 7M', 'seventh', 'Soft and dreamy', false),
  type('7', 'dominant 7th', '1P 3M 5P 7m', 'seventh', 'Bluesy; wants to move on', false),
  type('m7', 'minor 7th', '1P 3m 5P 7m', 'seventh', 'Mellow and smooth', true, '7'),
  type('mMaj7', 'minor-major 7th', '1P 3m 5P 7M', 'seventh', 'Dark and mysterious', true, '(maj7)'),
  type('m7b5', 'half-diminished 7th', '1P 3m 5d 7m', 'seventh', 'Moody; leads somewhere', true, 'ø7'),
  type('dim7', 'diminished 7th', '1P 3m 5d 7d', 'seventh', 'Very tense and dramatic', true, '°7'),
  type('add9', 'major add 9', '1P 3M 5P 9M', 'ninth', 'Major with sparkle', false),
  type('madd9', 'minor add 9', '1P 3m 5P 9M', 'ninth', 'Wistful minor', true, 'add9'),
  type('maj9', 'major 9th', '1P 3M 5P 7M 9M', 'ninth', 'Lush and warm', false),
  type('9', 'dominant 9th', '1P 3M 5P 7m 9M', 'ninth', 'Funky and soulful', false),
  type('m9', 'minor 9th', '1P 3m 5P 7m 9M', 'ninth', 'Smooth, neo-soul', true, '9'),
  type('maj7#11', 'major 7th sharp 11', '1P 3M 5P 7M 11A', 'eleventh', 'Floating and magical', false),
  type('11', 'dominant 11th', '1P 5P 7m 9M 11P', 'eleventh', 'Big and open (no 3rd)', false),
  type('m11', 'minor 11th', '1P 3m 5P 7m 9M 11P', 'eleventh', 'Open, modern minor', true, '11'),
  type('maj13', 'major 13th', '1P 3M 5P 7M 9M 13M', 'thirteenth', 'Very lush', false),
  type('13', 'dominant 13th', '1P 3M 5P 7m 9M 13M', 'thirteenth', 'Rich and jazzy', false),
  type('m13', 'minor 13th', '1P 3m 5P 7m 9M 13M', 'thirteenth', 'Silky minor', true, '13'),
  type('7b9', 'dominant 7th flat 9', '1P 3M 5P 7m 9m', 'tense', 'Dark, dramatic pull', false),
  type('7#9', 'dominant 7th sharp 9', '1P 3M 5P 7m 9A', 'tense', 'Gritty and bluesy', false),
  type('7b5', 'dominant 7th flat 5', '1P 3M 5d 7m', 'tense', 'Strange and slippery', false),
  type('7#5', 'augmented 7th', '1P 3M 5A 7m', 'tense', 'Restless; pushes forward', false, '+7'),
]

const TYPES = new Map(CHORD_TYPES.map((t) => [t.symbol, t]))

/** True if `symbol` is one of CHORD_TYPES. */
export const isChordType = (symbol: string) => TYPES.has(symbol)

/** The type of a chord (unknown types read as major, so bad data can't crash rendering). */
export const chordType = (symbol: string): ChordType => TYPES.get(symbol) ?? CHORD_TYPES[0]

/** "Dominant" chords: major 3rd + flat 7th (or plain major), the ones that pull to a chord a 5th below. */
export const DOMINANT_TYPES = new Set(['', '7', '9', '13', '7b9', '7#9', '7b5', '7#5'])

const semis = (ivl: string) => Interval.semitones(ivl) ?? 0
const pc = (ivl: string) => ((semis(ivl) % 12) + 12) % 12
const bySemis = (a: string, b: string) => semis(a) - semis(b)

/** The chord's intervals from the root, low to high (type - omit + add). */
export function chordIntervals(chord: Chord): string[] {
  const omitted = new Set(chord.omit)
  return [...chordType(chord.type).intervals.filter((i) => !omitted.has(i)), ...chord.add].sort(bySemis)
}

/** Note name for root + interval, spelled from the root but without double sharps/flats. */
export function noteAt(root: string, ivl: string): string {
  const note = Note.pitchClass(Note.transpose(root, ivl))
  return /##|bb/.test(note) ? Note.simplify(note) : note
}

/** The chord's notes in root position, e.g. ["D", "F", "A", "C"]. */
export const chordNotes = (chord: Chord) => chordIntervals(chord).map((i) => noteAt(chord.root, i))

/**
 * A short label for an interval's role in a chord: "root", "3", "b3", "5", "7",
 * "maj7", "9", "#11", ...
 */
export function intervalLabel(ivl: string): string {
  const { num, alt } = Interval.get(ivl)
  if (num === 1) return 'root'
  if (num === 7) return alt === 0 ? 'maj7' : alt === -1 ? '7' : 'bb7'
  const acc = alt > 0 ? '#'.repeat(alt) : 'b'.repeat(-alt)
  return `${acc}${num}`
}

/** MIDI note of the root in octave 3 (C3 = 48), where voicings start. */
const rootMidi = (root: string, octave = 3) => Note.midi(`${root}${octave}`) ?? 48

/**
 * Close-position voicing as MIDI notes, low to high: the chord's intervals stacked
 * from the root in `octave`, then inverted `chord.inversion` times.
 */
export function voiceChord(chord: Chord, octave = 3): number[] {
  const base = rootMidi(chord.root, octave)
  const notes = chordIntervals(chord).map((i) => base + semis(i))
  return invertVoicing(notes, chord.inversion)
}

/**
 * Inversion k = q full turns (whole octaves) + r rotations (lowest note up an octave,
 * r < note count). Splitting it this way keeps "inversion + note count" exactly one
 * octave up, even for chords wider than an octave (9ths, 13ths).
 */
function invertVoicing(notes: number[], inversion: number): number[] {
  const out = [...notes].sort((a, b) => a - b)
  const n = out.length
  if (n < 2) return out
  const turns = Math.floor(inversion / n)
  for (let i = 0; i < inversion - turns * n; i++) {
    out.push(out.shift()! + 12)
    // The raised note can land below others in wide chords; keep it sorted.
    out.sort((a, b) => a - b)
  }
  return out.map((m) => m + 12 * turns)
}

/** Lowest and highest MIDI notes a voicing may use (keeps inversions musical). */
export const VOICE_RANGE = { low: 36, high: 88 }

export const inRange = (notes: number[]) =>
  notes.length > 0 && notes[0] >= VOICE_RANGE.low && notes[notes.length - 1] <= VOICE_RANGE.high

/** True if the chord can move one inversion up (1) or down (-1) and stay in range. */
export const canInvert = (chord: Chord, dir: 1 | -1) =>
  inRange(voiceChord({ ...chord, inversion: chord.inversion + dir }))

/** One inversion up (1) or down (-1); unchanged if that would leave the playable range. */
export const invert = (chord: Chord, dir: 1 | -1): Chord =>
  canInvert(chord, dir) ? { ...chord, inversion: chord.inversion + dir } : chord

/** Note names as voiced, low to high (so inversions show: C/E reads "E G C"). */
export function voicedNoteNames(chord: Chord): string[] {
  const notes = chordNotes(chord)
  return voiceChord(chord).map((m) => notes.find((n) => Note.chroma(n) === ((m % 12) + 12) % 12) ?? '')
}

/**
 * The same voicing an octave up (1) or down (-1): shifting the inversion by the number
 * of notes moves every note exactly 12 semitones. Null if it would leave the range.
 */
export function shiftOctave(chord: Chord, dir: 1 | -1): Chord | null {
  const next = { ...chord, inversion: chord.inversion + dir * chordIntervals(chord).length }
  return inRange(voiceChord(next)) ? next : null
}

/** The bass note (pitch class): the slash note if one is set, else the root. Inversions don't change it. */
export const bassNote = (chord: Chord): string => chord.bass ?? chord.root

/** True if the chord has a bass note other than its root (a slash chord). */
export const isSlash = (chord: Chord) => chord.bass !== undefined && Note.chroma(chord.bass) !== Note.chroma(chord.root)

/** Pitch class (note name) of the lowest note of the chord part's voicing (what the inversion puts on the bottom). */
export function lowestNote(chord: Chord): string {
  const notes = chordNotes(chord)
  const low = voiceChord(chord)[0]
  const lowPc = ((low % 12) + 12) % 12
  return notes.find((n) => Note.chroma(n) === lowPc) ?? chord.root
}

const ORDINALS = ['root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion', '5th inversion']

/**
 * The voicing's shape in words: "root position", "1st inversion" (3rd on the bottom),
 * ... From the lowest voiced note, so it's right however far the chord was inverted.
 */
export function inversionName(chord: Chord): string {
  const ivls = chordIntervals(chord)
  const low = Note.chroma(lowestNote(chord))
  const index = ivls.findIndex((i) => Note.chroma(noteAt(chord.root, i)) === low)
  return ORDINALS[index] ?? `${index}th inversion`
}

/**
 * The same chord over another bass note (a slash chord), or back on its root with null
 * (or the root itself). The voicing is untouched.
 */
export function withBass(chord: Chord, note: string | null): Chord {
  const { bass: _old, ...rest } = chord
  if (note === null || Note.chroma(note) === Note.chroma(chord.root)) return rest
  return { ...rest, bass: Note.pitchClass(note) }
}

/** The notes you hear: the chord's notes, plus a slash bass note that isn't one of them (F/G adds G). */
export function soundingNotes(chord: Chord): string[] {
  const notes = chordNotes(chord)
  if (!isSlash(chord) || notes.some((n) => Note.chroma(n) === Note.chroma(chord.bass!))) return notes
  return [chord.bass!, ...notes]
}

/** Chord name, e.g. "Dm7", "Cadd9", "C7(no 5)", "Cmaj7/E". */
export function chordName(chord: Chord): string {
  const t = chordType(chord.type)
  let name = chord.root + t.symbol
  const adds = chord.add.map(intervalLabel)
  if (adds.length === 1 && (t.symbol === '' || t.symbol === 'm')) name += `add${adds[0]}`
  else if (adds.length) name += `(add${adds.join(', ')})`
  if (chord.omit.length) {
    const omits = chord.omit.map((i) => (Interval.get(i).num === 1 ? 'root' : String(Interval.get(i).num)))
    name += `(no ${omits.join(', ')})`
  }
  if (isSlash(chord)) name += `/${chord.bass}`
  return name
}

/**
 * The interval a pitch class (semitones above the root) is added as, given the chord's
 * other notes: 2 is a 9th, 5 an 11th next to a 3rd (else a sus 4th), 9 a 13th on a 7th
 * chord (else a 6th), and so on, so names read the way players write them.
 */
export function addedInterval(semitone: number, others: Set<number>): string {
  const hasThird = others.has(3) || others.has(4)
  const hasSeventh = others.has(10) || others.has(11)
  switch (semitone) {
    case 0:
      return '1P'
    case 1:
      return '9m'
    case 2:
      return '9M'
    case 3:
      return others.has(4) ? '9A' : '3m'
    case 4:
      return '3M'
    case 5:
      return hasThird ? '11P' : '4P'
    case 6:
      return others.has(7) ? '11A' : '5d'
    case 7:
      return '5P'
    case 8:
      return others.has(7) ? '13m' : '5A'
    case 9:
      return hasSeventh ? '13M' : '6M'
    case 10:
      return '7m'
    default:
      return '7M'
  }
}

/**
 * How much leaving out an interval of a type counts against explaining notes with it:
 * dropping the 5th is normal, dropping the root or a sus chord's defining note isn't.
 */
const OMIT_COSTS: Record<string, number> = { '5P': 0.8, '1P': 2, '3M': 1.5, '3m': 1.5, '4P': 1.7, '2M': 1.7 }
const omitCost = (ivl: string) => OMIT_COSTS[ivl] ?? 1.2

/**
 * The canonical chord for a root and a set of intervals: the known type that explains
 * the notes with the fewest added/removed notes (earlier types win ties), plus those
 * adds/omits. Compares pitch classes, so a 2nd and a 9th count as the same note.
 */
export function fromIntervals(root: string, intervals: string[], inversion = 0): Chord {
  return explainIntervals(root, intervals, inversion).chord
}

/**
 * fromIntervals plus how well the notes fit a known type (0 = exactly a type; each
 * added/removed note costs about 1). Used to guess the root of a bare list of notes.
 */
export function explainIntervals(root: string, intervals: string[], inversion = 0): { chord: Chord; cost: number } {
  const pcs = new Set(intervals.map(pc))
  let best = { cost: Infinity, type: CHORD_TYPES[0], add: [] as number[], omit: [] as string[] }
  for (const [index, t] of CHORD_TYPES.entries()) {
    const typePcs = new Set(t.intervals.map(pc))
    const add = [...pcs].filter((p) => !typePcs.has(p))
    const omit = t.intervals.filter((i) => !pcs.has(pc(i)))
    // A power chord is a poor base for extras: C G B♭ reads better as C7(no 3).
    const cost =
      add.length + omit.reduce((s, i) => s + omitCost(i), 0) + (t.symbol === '5' && add.length ? 1 : 0) + index * 1e-3
    if (cost < best.cost) best = { cost, type: t, add, omit }
  }
  const chord = {
    root,
    type: best.type.symbol,
    add: best.add.map((p) => addedInterval(p, pcs)).sort(bySemis),
    omit: best.omit,
    inversion,
  }
  return { chord, cost: best.cost }
}

/** Build a chord from a root and a type symbol (no edits, root position). */
export const makeChord = (root: string, typeSymbol = ''): Chord => ({
  root,
  type: chordType(typeSymbol).symbol,
  add: [],
  omit: [],
  inversion: 0,
})

/** Every chord needs at least this many notes (removing more is not allowed). */
export const MIN_NOTES = 2

/** Semitones of a note above the chord's root (0–11). */
const semitonesAbove = (root: string, note: string) =>
  ((((Note.chroma(note) ?? 0) - (Note.chroma(root) ?? 0)) % 12) + 12) % 12

/** True if the chord contains this pitch class (note name, any octave). */
export const hasNote = (chord: Chord, note: string) =>
  chordNotes(chord).some((n) => Note.chroma(n) === Note.chroma(note))

/**
 * Add a note (pitch class) to the chord, or remove it if it's there. The result is
 * renamed canonically (C + B♭ = C7). Removing is refused below MIN_NOTES notes.
 */
export function toggleNote(chord: Chord, note: string): Chord {
  const ivls = chordIntervals(chord)
  const s = semitonesAbove(chord.root, note)
  if (ivls.some((i) => pc(i) === s)) {
    if (ivls.length <= MIN_NOTES) return chord
    return withBass(fromIntervals(chord.root, ivls.filter((i) => pc(i) !== s), chord.inversion), chord.bass ?? null)
  }
  const others = new Set(ivls.map(pc))
  return withBass(fromIntervals(chord.root, [...ivls, addedInterval(s, others)], chord.inversion), chord.bass ?? null)
}

/** Same chord edits, different type (adds/omits are dropped; inversion and bass kept, the inversion if it fits). */
export function withType(chord: Chord, typeSymbol: string): Chord {
  const next = withBass({ ...makeChord(chord.root, typeSymbol), inversion: chord.inversion }, chord.bass ?? null)
  return inRange(voiceChord(next)) ? next : { ...next, inversion: 0 }
}

/** Same chord on a different root. A slash bass moves along with it (C/E on D is D/F#). */
export function withRoot(chord: Chord, root: string): Chord {
  const moved = chord.bass === undefined ? undefined : spell(Note.transpose(chord.bass, Interval.distance(chord.root, root)))
  const next = withBass({ ...chord, root }, moved ?? null)
  return inRange(voiceChord(next)) ? next : { ...next, inversion: 0 }
}

/** A pitch class without double sharps/flats. */
const spell = (note: string) => {
  const p = Note.pitchClass(note)
  return /##|bb/.test(p) ? Note.simplify(p) : p
}

/** Move the root by an interval (e.g. "2M"), keeping everything else. */
export function transposeChord(chord: Chord, ivl: string): Chord {
  return withRoot(chord, Note.simplify(Note.transpose(chord.root, ivl)))
}

/** True if two chords are the same (same description, so same notes and voicing). */
export function sameChord(a: Chord, b: Chord): boolean {
  return (
    a === b ||
    (a.root === b.root &&
      a.type === b.type &&
      a.inversion === b.inversion &&
      Note.chroma(bassNote(a)) === Note.chroma(bassNote(b)) &&
      a.add.join() === b.add.join() &&
      a.omit.join() === b.omit.join())
  )
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string')

/** True if `v` is a note name Tonal reads (it returns NaN, not undefined, for nonsense like "H"). */
export const isNoteName = (v: unknown): v is string => typeof v === 'string' && Number.isInteger(Note.chroma(v))

/** Guards chords loaded from storage. */
export const isChord = (v: unknown): v is Chord => {
  const c = v as Chord
  return (
    typeof c === 'object' &&
    c !== null &&
    typeof c.root === 'string' &&
    isNoteName(c.root) &&
    TYPES.has(c.type) &&
    isStringArray(c.add) &&
    isStringArray(c.omit) &&
    Number.isInteger(c.inversion) &&
    (c.bass === undefined || isNoteName(c.bass))
  )
}
