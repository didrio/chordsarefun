import { Chord as TonalChord, Interval, Note } from 'tonal'
import {
  chordIntervals,
  explainIntervals,
  fromIntervals,
  hasNote,
  inRange,
  isNoteName,
  isChordType,
  lowestNote,
  makeChord,
  MIN_NOTES,
  noteAt,
  toggleNote,
  voiceChord,
  withBass,
  type Chord,
} from './chord'
import { scaleNotes, type ModeName } from './theory'

/**
 * Reading chords people type. Forgiving on purpose: musicians write the same chord many
 * ways (Cmaj7, CM7, CΔ, C major 7), and people who don't know names can type the notes
 * ("C E G") or, with a home key, a roman numeral ("V7", "bVII").
 */

/** How a typed chord was read, so the UI can say "read as C major (from the notes)". */
export type ParsedChord = { chord: Chord; from: 'name' | 'notes' | 'numeral' }

/** Unicode accidentals and symbols, dashes and trailing punctuation, made plain. */
function normalize(text: string): string {
  return text
    .trim()
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/[−–—]/g, '-')
    .replace(/△/g, 'Δ')
    .replace(/[º˚]/g, '°')
    .replace(/[.!?;:]+$/, '')
    .trim()
}

/** A note name at the start, allowing words: "C", "c#", "Bb", "E flat", "F-sharp". */
const NOTE = String.raw`[A-Ga-g](?:#|b|\s*-?\s*sharp\b|\s*-?\s*flat\b)*`
const ROOT_RE = new RegExp(String.raw`^(${NOTE})(.*)$`, 'i')
/** A trailing bass note: "C/E", "C over E". Only a note name counts, so "6/9" stays a type. */
const SLASH_RE = new RegExp(String.raw`^(.*?)\s*(?:\/|\bover\b)\s*(${NOTE})\s*$`, 'i')

/** "c sharp" -> "C#", "e-flat" -> "Eb", "bb" -> "Bb". Null if it isn't a note. */
function readNote(text: string): string | null {
  const t = text.replace(/\s|-/g, '').replace(/sharp/gi, '#').replace(/flat/gi, 'b')
  const note = t[0].toUpperCase() + t.slice(1).toLowerCase()
  if (!isNoteName(note)) return null
  const p = Note.pitchClass(note)
  return /##|bb/.test(p) ? Note.simplify(p) : p
}

/** Words and alternate spellings in a chord suffix, rewritten to standard symbols. */
const WORDS: [RegExp, string][] = [
  [/half[\s-]*dim(inished)?/gi, 'ø'],
  [/dominant/gi, 'dom'],
  [/diminished/gi, 'dim'],
  [/augmented/gi, 'aug'],
  [/suspended/gi, 'sus'],
  [/major/gi, 'maj'],
  [/minor/gi, 'min'],
  [/power(\s*chord)?/gi, '5'],
  [/\bchord\b/gi, ''],
  [/thirteenth|thirteen/gi, '13'],
  [/eleventh|eleven/gi, '11'],
  [/ninth|nine/gi, '9'],
  [/seventh|seven/gi, '7'],
  [/sixth|six/gi, '6'],
  [/fifth|five/gi, '5'],
  [/flat/gi, 'b'],
  [/sharp/gi, '#'],
  [/added|add/gi, 'add'],
  [/omit|without|no(?=\s*(?:[#b]?\d|root))/gi, 'no'],
]
/** Words that are case-insensitive (MAJ7 = maj7), unlike a lone M (major) vs m (minor). */
const LOWERCASE_WORDS = /maj|min|dim|aug|sus|alt|dom|add/gi

/** Common ways of writing chord suffixes that Tonal doesn't map to our symbols directly. */
const ALIASES: Record<string, string> = {
  M: '',
  maj: '',
  min: 'm',
  '-': 'm',
  mi: 'm',
  M7: 'maj7',
  '7M': 'maj7',
  Δ: 'maj7',
  Δ7: 'maj7',
  '^': 'maj7',
  '^7': 'maj7',
  ma7: 'maj7',
  mj7: 'maj7',
  maj6: '6',
  'm(maj7)': 'mMaj7',
  mmaj7: 'mMaj7',
  'm/maj7': 'mMaj7',
  'm-maj7': 'mMaj7',
  mM7: 'mMaj7',
  'mΔ7': 'mMaj7',
  'mΔ': 'mMaj7',
  '-Δ7': 'mMaj7',
  '-maj7': 'mMaj7',
  min7: 'm7',
  '-7': 'm7',
  '-6': 'm6',
  '-9': 'm9',
  ø: 'm7b5',
  ø7: 'm7b5',
  'm7(b5)': 'm7b5',
  '°': 'dim',
  o: 'dim',
  '°7': 'dim7',
  o7: 'dim7',
  '+': 'aug',
  '+7': '7#5',
  '7+': '7#5',
  aug7: '7#5',
  sus: 'sus4',
  '7sus': '7sus4',
  sus7: '7sus4',
  '69': '6/9',
  add2: 'add9',
  madd2: 'madd9',
  '2': 'sus2',
  '4': 'sus4',
}

/** Semitones above the root for a chord degree like "9", "b13", "#11". */
function degreeSemitones(label: string): number | null {
  // Our labels: "7" is the flat 7th (as in C7), "maj7" the major 7th, "bb7" a diminished 7th.
  if (label === 'maj7') return 11
  if (label === 'b7') return 10
  if (label === 'bb7') return 9
  const m = /^([#b]*)(\d+)$/.exec(label)
  const BASE: Record<string, number> = { 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 10, 9: 14, 11: 17, 13: 21 }
  if (!m || BASE[m[2]] === undefined) return null
  const shift = [...m[1]].reduce((s, ch) => s + (ch === '#' ? 1 : -1), 0)
  return (((BASE[m[2]] + shift) % 12) + 12) % 12
}

/** The base part of a suffix ("m7", "maj9", "7b9#11") as a chord, via our types or Tonal. */
function parseBase(root: string, suffix: string): Chord | null {
  const symbol = ALIASES[suffix] ?? suffix
  if (isChordType(symbol)) return makeChord(root, symbol)
  const parsed = TonalChord.get(root + symbol)
  if (parsed.empty || parsed.intervals.length < MIN_NOTES) return null
  return fromIntervals(root, parsed.intervals)
}

/** Alterations written after a base chord ("maj7b5", "7sus2", "m7b9"), and what each does to it. */
const ALTERATIONS: { re: RegExp; remove: string[]; add: string | null }[] = [
  { re: /sus2$/, remove: ['3M', '3m', '4P'], add: '2M' },
  { re: /sus4?$/, remove: ['3M', '3m', '2M'], add: '4P' },
  { re: /b5$/, remove: ['5P', '5A'], add: '5d' },
  { re: /#5$/, remove: ['5P', '5d'], add: '5A' },
  { re: /b9$/, remove: [], add: '9m' },
  { re: /#9$/, remove: [], add: '9A' },
  { re: /#11$/, remove: [], add: '11A' },
  { re: /b13$/, remove: [], add: '13m' },
  { re: /b6$/, remove: [], add: '6m' },
]

/** A suffix Tonal can't read as a whole: peel known alterations off the end and apply them to the base. */
function parseAltered(root: string, suffix: string): Chord | null {
  for (const alt of ALTERATIONS) {
    if (!alt.re.test(suffix)) continue
    const base = suffix.replace(alt.re, '')
    const chord = parseBase(root, base) ?? (base ? parseAltered(root, base) : makeChord(root))
    if (!chord) return null
    const removed = new Set(alt.remove.map((i) => Interval.semitones(i)))
    const ivls = chordIntervals(chord).filter((i) => !removed.has(Interval.semitones(i)))
    return fromIntervals(root, alt.add ? [...ivls, alt.add] : ivls)
  }
  return null
}

const DEGREE = String.raw`(?:maj7|[#b]*\d+|root)`
const LIST = String.raw`${DEGREE}(?:\s*,\s*${DEGREE})*`
const ADD_RE = new RegExp(String.raw`add\s*(${LIST})`, 'g')
const NO_RE = new RegExp(String.raw`no\s*(${LIST})`, 'g')

/** The suffix after the root, with words and alternate spellings made standard. */
function cleanSuffix(text: string): string {
  let s = text
  for (const [re, to] of WORDS) s = s.replace(re, to)
  s = s
    .replace(LOWERCASE_WORDS, (w) => w.toLowerCase())
    .replace(/\s+/g, '')
    // "-5", "+9" after a number or "(" are alterations (Cm7-5, C7+9); a leading "-" is minor (C-7).
    .replace(/([\d(,])-(\d)/g, '$1b$2')
    .replace(/([\d(,])\+(\d)/g, '$1#$2')
    .replace(/^min/, 'm')
    .replace(/Δ(?=\d)/, 'maj')
    .replace(/^dom(?=\d)/, '')
    .replace(/^dom$/, '7')
  return s
}

/**
 * Read a typed chord name: "F#m7b5", "Bbmaj9", "C/E", "Am(add9)", "C7(no 3)", any name
 * chordName produces, and looser spellings ("c sharp minor 7", "Cmaj7b5", "C7-9", "Eb
 * over G"). A slash note becomes the bass (a slash chord), never an inversion. Null if
 * unreadable.
 */
export function parseChord(text: string): Chord | null {
  const clean = normalize(text)
  const slash = SLASH_RE.exec(clean)
  const body = slash ? slash[1] : clean
  const m = ROOT_RE.exec(body)
  if (!m) return null
  const root = readNote(m[1])
  if (!root) return null

  // Pull out "add9", "(add9, 11)", "(no 5)", then read what's left as the base type.
  const adds: string[] = []
  const omits: string[] = []
  let rest = cleanSuffix(m[2])
  rest = rest.replace(ADD_RE, (_, list: string) => (adds.push(...list.split(/\s*,\s*/)), ' '))
  rest = rest.replace(NO_RE, (_, list: string) => (omits.push(...list.split(/\s*,\s*/)), ' '))
  // Brackets around alterations are optional: C7(b9) = C7b9.
  rest = rest.replace(/[()\s,]/g, '')
  let chord = parseBase(root, rest) ?? parseAltered(root, rest)
  if (!chord) return null

  for (const label of adds) {
    const s = degreeSemitones(label)
    if (s === null) return null
    const note = noteAt(root, Interval.fromSemitones(s))
    if (!hasNote(chord, note)) chord = toggleNote(chord, note)
  }
  for (const label of omits) {
    const ivl = chordIntervals(chord).find((i) =>
      label === 'root' ? Interval.get(i).num === 1 : Interval.get(i).num % 7 === Number(label.replace(/\D/g, '')) % 7,
    )
    if (!ivl) return null
    chord = toggleNote(chord, noteAt(root, ivl))
  }

  if (slash) {
    const bass = readNote(slash[2])
    if (!bass) return null
    chord = withBass(chord, bass)
  }
  return chord
}

/**
 * The chord a set of notes makes, e.g. ["E", "G", "C"] -> C major. Every note is tried
 * as the root; the one that explains the notes with the fewest extras wins, the first
 * typed note on ties (people usually type the root first). The typed order is kept as
 * the voicing: E G C gives C with E on the bottom (an inversion, not a slash chord).
 */
export function chordFromNotes(names: string[]): Chord | null {
  const notes = names.map(readNote)
  if (notes.some((n) => n === null)) return null
  const distinct = (notes as string[]).filter((n, i, all) => all.findIndex((x) => Note.chroma(x) === Note.chroma(n)) === i)
  if (distinct.length < MIN_NOTES) return null
  let best: { chord: Chord; cost: number } | null = null
  for (const [i, root] of distinct.entries()) {
    const ivls = distinct.map((n) => Interval.fromSemitones((((Note.chroma(n)! - Note.chroma(root)!) % 12) + 12) % 12))
    const { chord, cost } = explainIntervals(root, ivls)
    const score = cost + i * 0.01
    if (!best || score < best.cost) best = { chord, cost: score }
  }
  const chord = best!.chord
  const n = chordIntervals(chord).length
  const first = Note.chroma(distinct[0])
  for (let inversion = 0; inversion < n; inversion++) {
    const v = { ...chord, inversion }
    if (Note.chroma(lowestNote(v)) === first && inRange(voiceChord(v))) return v
  }
  return chord
}

/** Notes typed as a list: "C E G", "c-e-g", "C, Eb, G", or run together ("ceg"). */
function parseNoteList(text: string): Chord | null {
  const clean = normalize(text)
  const tokens = clean.split(/[\s,\-+]+/).filter(Boolean)
  const NOTE_ONLY = /^[A-Ga-g](?:#|b)*$/
  if (tokens.length >= 2 && tokens.every((t) => NOTE_ONLY.test(t))) return chordFromNotes(tokens)
  const compact = /^(?:[A-Ga-g](?:#|b)?){2,}$/.test(clean) ? clean.match(/[A-Ga-g](?:#|b)?/g) : null
  return compact ? chordFromNotes(compact) : null
}

const NUMERAL_RE = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/
const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']
const MAJOR_STEPS = ['1P', '2M', '3M', '4P', '5P', '6M', '7M']

type Home = { tonic: string; mode: ModeName }

/**
 * The root a numeral names in a home. Plain numerals are degrees of the home scale (III
 * in C minor is E♭); with ♭/♯ they're measured from the major scale, the pop convention
 * (♭VII is a whole step below the tonic in any mood).
 */
function numeralRoot(acc: string, numeral: string, home: Home): string {
  const degree = NUMERALS.indexOf(numeral.toLowerCase())
  let root = acc ? Note.transpose(home.tonic, MAJOR_STEPS[degree]) : scaleNotes(home.tonic, home.mode)[degree]
  if (acc === 'b') root = Note.transpose(root, '-1A')
  if (acc === '#') root = Note.transpose(root, '1A')
  const p = Note.pitchClass(root)
  return /##|bb/.test(p) ? Note.simplify(p) : p
}

/**
 * A roman numeral in a home: "IV", "vi7", "bVII", "V7/ii" (the V7 of ii). Uppercase is
 * major, lowercase minor; anything after it reads like a chord suffix.
 */
export function parseNumeral(text: string, home: Home): Chord | null {
  const clean = normalize(text).replace(/\s+/g, '')
  const [main, of] = clean.split('/')
  const m = NUMERAL_RE.exec(main)
  if (!m) return null
  const [, acc, numeral, suffix] = m
  let key = home
  if (of !== undefined) {
    const t = NUMERAL_RE.exec(of)
    if (!t || t[3]) return null
    // A secondary chord is measured from its target as a major home.
    key = { tonic: numeralRoot(t[1], t[2], home), mode: 'ionian' }
  }
  const root = numeralRoot(acc, numeral, key)
  const lower = numeral === numeral.toLowerCase()
  const diminished = /^(°|ø|o|dim)/.test(suffix)
  return parseChord(root + (lower && !diminished ? `m${suffix}` : suffix))
}

/**
 * Anything typed into a chord box: a chord name, a list of notes, or (with a home key) a
 * roman numeral. Says which, so the UI can explain how it was read. Null if none fit.
 */
export function readChordInput(text: string, home?: Home): ParsedChord | null {
  if (!text.trim()) return null
  const named = parseChord(text)
  if (named) return { chord: named, from: 'name' }
  const numeral = home ? parseNumeral(text, home) : null
  if (numeral) return { chord: numeral, from: 'numeral' }
  const notes = parseNoteList(text)
  return notes ? { chord: notes, from: 'notes' } : null
}
