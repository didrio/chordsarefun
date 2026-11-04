import { Interval, Note, Scale } from 'tonal'
import { chordIntervals, chordName, chordType, DOMINANT_TYPES, intervalLabel, isSlash, noteAt, type Chord } from './chord'
import { degreeChord, isDiatonic, keyName, noteInKey, romanNumeral, rootDegree, scaleNotes, type ModeName } from './theory'

/**
 * How a chord relates to the key, and how tense it is inside, explained in plain words
 * with the theory term as extra info. Two separate questions on purpose: a chord can be
 * far outside the key and sound sweet, or completely in key and clash.
 */

export type FitKind = 'diatonic' | 'borrowed' | 'secondary' | 'passing' | 'substitute' | 'outside'

export type ChordFit = {
  kind: FitKind
  /** Short tag for clips ("borrowed", "→ Dm"); null when in key. */
  tag: string | null
  /** Headline in plain words, e.g. "Borrowed from C minor". */
  title: string
  /** One or two plain sentences on what it is and how it's used. */
  detail: string
  /** The theory name for it, shown as extra info. */
  term: string | null
  /** A widely used technique (as opposed to a genuinely unusual choice). */
  common: boolean
  /** Roman numeral to show, e.g. "V7/ii" for a secondary dominant. */
  roman: string
}

export type NoteInfo = {
  note: string
  /** Role in the chord: "root", "3", "b7", "9", ... */
  role: string
  inKey: boolean
  /** For notes outside the key: which key note it replaces. */
  why: string | null
}

/** 0 = smooth, 1 = some bite (colorful, common), 2 = clashing (half-step rubs). */
export type TensionLevel = 0 | 1 | 2

export type Tension = { level: TensionLevel; label: string; reasons: string[] }

export type Analysis = { fit: ChordFit; notes: NoteInfo[]; tension: Tension }

export const TENSION_LABELS: Record<TensionLevel, string> = { 0: 'Smooth', 1: 'Some bite', 2: 'Clashing' }

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th']

const chroma = (note: string) => Note.chroma(note) ?? -1
const signed = (n: number) => ((((n + 6) % 12) + 12) % 12) - 6

/** "The key has F; F# is F raised a half step." */
function alteration(note: string, tonic: string, mode: ModeName): string {
  const scale = scaleNotes(tonic, mode)
  const num = Interval.get(Interval.distance(tonic, note)).num
  const degree = Number.isFinite(num) ? (((num - 1) % 7) + 7) % 7 : 0
  const keyNote = scale[degree]
  const diff = signed(chroma(note) - chroma(keyNote))
  if (diff === 0) return `${note} isn't in ${keyName(tonic, mode)}.`
  const size = Math.abs(diff) === 1 ? 'a half step' : Math.abs(diff) === 2 ? 'a whole step' : `${Math.abs(diff)} half steps`
  return `The key has ${keyNote}; ${note} is ${keyNote} ${diff > 0 ? 'raised' : 'lowered'} ${size}.`
}

/** Scales a chord can be borrowed from (same home note), in order of how they're explained. */
type Source = { scale: string; label: string; mood: string; common: boolean; mode?: ModeName }
const SOURCES: Record<string, Source> = {
  major: { scale: 'major', label: 'major', mood: 'a brighter, happier shade', common: true, mode: 'ionian' },
  minor: { scale: 'minor', label: 'minor', mood: 'a darker, bittersweet shade', common: true, mode: 'aeolian' },
  harmonic: { scale: 'harmonic minor', label: 'harmonic minor', mood: 'dramatic, classical tension', common: true },
  dorian: { scale: 'dorian', label: 'Dorian', mood: 'a hopeful, soulful lift', common: true, mode: 'dorian' },
  mixolydian: { scale: 'mixolydian', label: 'Mixolydian', mood: 'a laid-back, rock swagger', common: true, mode: 'mixolydian' },
  lydian: { scale: 'lydian', label: 'Lydian', mood: 'a dreamy, floating sparkle', common: false, mode: 'lydian' },
  phrygian: { scale: 'phrygian', label: 'Phrygian', mood: 'a dark, exotic edge', common: false, mode: 'phrygian' },
}
const MAJOR_FAMILY: ModeName[] = ['ionian', 'lydian', 'mixolydian']
const BORROW_ORDER_MAJOR = ['minor', 'mixolydian', 'dorian', 'harmonic', 'major', 'lydian', 'phrygian']
const BORROW_ORDER_MINOR = ['harmonic', 'dorian', 'major', 'minor', 'mixolydian', 'phrygian', 'lydian']

const ordinalChord = (degree: number) => `${ORDINALS[degree]} chord`

/**
 * Everything the UI explains about a chord in a key. `next` (the chord after it on the
 * track) lets "leading" chords say whether they actually resolve.
 */
export function analyzeChord(chord: Chord, tonic: string, mode: ModeName, next?: Chord | null): Analysis {
  const info = (note: string, role: string): NoteInfo => {
    const inKey = noteInKey(note, tonic, mode)
    return { note, role, inKey, why: inKey ? null : alteration(note, tonic, mode) }
  }
  const notes: NoteInfo[] = chordIntervals(chord).map((ivl) => info(noteAt(chord.root, ivl), intervalLabel(ivl)))
  // A slash bass that isn't a chord note (the G of F/G) is part of the sound too.
  if (isSlash(chord) && !notes.some((n) => chroma(n.note) === chroma(chord.bass!))) notes.unshift(info(chord.bass!, 'bass'))
  return { fit: chordFit(chord, tonic, mode, notes, next ?? null), notes, tension: chordTension(chord) }
}

function chordFit(chord: Chord, tonic: string, mode: ModeName, notes: NoteInfo[], next: Chord | null): ChordFit {
  const key = keyName(tonic, mode)
  const roman = romanNumeral(chord, tonic, mode)
  const name = chordName(chord)
  if (isDiatonic(chord, tonic, mode)) {
    const degree = rootDegree(chord, tonic, mode) ?? 0
    return {
      kind: 'diatonic',
      tag: null,
      title: 'In key',
      detail: `Every note is in ${key}. It's the ${ordinalChord(degree)} of the key.`,
      term: null,
      common: true,
      roman,
    }
  }

  const type = chordType(chord.type)
  const has3rd = !chord.omit.some((i) => i.startsWith('3'))
  const resolvesTo = (target: string) => next !== null && chroma(next.root) === chroma(target)
  const thenLine = (target: string, targetName: string) =>
    resolvesTo(target) ? ` And it does: ${chordName(next!)} comes next.` : ` Try putting ${targetName} right after it.`

  /** The key's own chord on `note`, if that's a major or minor chord (the usual targets). */
  const keyChordOn = (note: string) => {
    const degree = rootDegree({ ...chord, root: note }, tonic, mode)
    if (degree === null) return null
    const triad = degreeChord(tonic, mode, degree, 3)
    if (triad.type !== '' && triad.type !== 'm') return null
    return { degree, triad, name: chordName(triad), roman: romanNumeral(triad, tonic, mode) }
  }

  type Candidate = { fit: ChordFit; target?: string }
  /** "vii°7/ii", or plain "vii°7" when the target is the home chord itself. */
  const of = (numeral: string, t: { degree: number; roman: string }) => (t.degree === 0 ? numeral : `${numeral}/${t.roman}`)

  const secondary = (): Candidate | null => {
    if (!DOMINANT_TYPES.has(chord.type) || !has3rd) return null
    const target = noteAt(chord.root, '4P')
    const t = keyChordOn(target)
    if (!t || t.degree === 0) return null
    return {
      target,
      fit: {
        kind: 'secondary',
        tag: `→ ${t.name}`,
        title: `Leads to ${t.name}`,
        detail:
          `Not in ${key}, but it works like a "V" chord for ${t.name} (the ${ordinalChord(t.degree)}): ` +
          `it builds tension that resolves when ${t.name} comes next.` +
          thenLine(target, t.name),
        term: 'secondary dominant',
        common: true,
        roman: `V${type.roman}/${t.roman}`,
      },
    }
  }

  const passing = (): Candidate | null => {
    if (chord.type !== 'dim' && chord.type !== 'dim7') return null
    const target = noteAt(chord.root, '2m')
    const t = keyChordOn(target)
    if (!t) return null
    return {
      target,
      fit: {
        kind: 'passing',
        tag: `→ ${t.name}`,
        title: `Slides up into ${t.name}`,
        detail:
          `A diminished chord a half step below ${t.name}: a passing chord that pulls up into it. ` +
          `Common in gospel, soul and jazz.` +
          thenLine(target, t.name),
        term: 'passing diminished (leading-tone chord)',
        common: true,
        roman: of(`vii${type.roman}`, t),
      },
    }
  }

  const substitute = (): Candidate | null => {
    if (!DOMINANT_TYPES.has(chord.type) || chord.type === '' || !has3rd) return null
    const target = noteAt(chord.root, '7M')
    const t = keyChordOn(target)
    if (!t) return null
    return {
      target,
      fit: {
        kind: 'substitute',
        tag: `→ ${t.name}`,
        title: `Slides down into ${t.name}`,
        detail:
          `A dominant chord a half step above ${t.name}: a jazzy stand-in for its usual "V" chord ` +
          `that slides down into it.` +
          thenLine(target, t.name),
        term: 'tritone substitution',
        common: true,
        roman: of(`subV${type.roman}`, t),
      },
    }
  }

  const ownScale = new Set(scaleNotes(tonic, mode).map(chroma))
  const borrowed = (common: boolean) => (): Candidate | null => {
    const order = MAJOR_FAMILY.includes(mode) ? BORROW_ORDER_MAJOR : BORROW_ORDER_MINOR
    for (const id of order) {
      const s = SOURCES[id]
      if (s.common !== common || s.mode === mode) continue
      const scale = new Set(Scale.get(`${tonic} ${s.scale}`).notes.map(chroma))
      if ([...scale].every((c) => ownScale.has(c))) continue
      if (!notes.every((n) => scale.has(chroma(n.note)))) continue
      return {
        fit: {
          kind: 'borrowed',
          tag: 'borrowed',
          title: `Borrowed from ${tonic} ${s.label}`,
          detail:
            `Not in ${key}, but every note is in ${tonic} ${s.label} (same home note). ` +
            `Borrowing from it gives ${s.mood}. ` +
            (common ? 'Very common in pop, rock and film music.' : 'Less common, but a recognizable color.'),
          term: 'borrowed chord (modal interchange)',
          common,
          roman,
        },
      }
    }
    return null
  }

  const leading = [secondary, passing, substitute]
  // A leading chord that actually resolves to the next chord is the best explanation.
  for (const make of leading) {
    const c = make()
    if (c?.target && resolvesTo(c.target)) return c.fit
  }
  // Dominant 7ths are explained by where they lead first, diminished chords by the chord
  // they slide into (Edim in C fits C Mixolydian on paper, but it's used as a passing
  // chord into F), everything else by where it's borrowed from.
  const isDom7 = DOMINANT_TYPES.has(chord.type) && chord.type !== ''
  const isDim = chord.type === 'dim' || chord.type === 'dim7'
  const order = isDom7
    ? [secondary, borrowed(true), substitute, passing, borrowed(false)]
    : isDim
      ? [passing, borrowed(true), secondary, substitute, borrowed(false)]
      : [borrowed(true), secondary, passing, substitute, borrowed(false)]
  for (const make of order) {
    const c = make()
    if (c) return c.fit
  }

  const out = notes.filter((n) => !n.inKey).map((n) => n.note)
  return {
    kind: 'outside',
    tag: 'outside',
    title: 'Outside the key',
    detail:
      `${out.join(' and ')} ${out.length === 1 ? "isn't" : "aren't"} in ${key}, and ${name} isn't one of the usual ` +
      `borrowed or "leading" chords. It will sound surprising, which can be great if you mean it.`,
    term: 'chromatic chord',
    common: false,
    roman,
  }
}

/** Semitones (0–11) of a note above the chord's root. */
const semitonesFromRoot = (chord: Chord, note: string) => (((chroma(note) - chroma(chord.root)) % 12) + 12) % 12

/** Chord types that are tense by design (unstable, wanting to move), whatever the notes around them. */
const TENSE_TYPES = new Set(['dim', 'dim7', 'aug', '7b5', '7#5'])

/**
 * Tension inside the chord. Mostly about half steps between chord notes: some are
 * standard colors (a maj7 under the root, a 13 next to the ♭7), some are classic
 * "spicy" sounds (♭9 on a dominant, #11, #9), and some clash (an 11 right above a major
 * 3rd, a ♭7 and maj7 together).
 */
export function chordTension(chord: Chord): Tension {
  const ivls = chordIntervals(chord)
  const at = new Map(ivls.map((i) => [((Interval.semitones(i) ?? 0) % 12 + 12) % 12, noteAt(chord.root, i)]))
  const dominant = at.has(4) && at.has(10)
  const reasons: string[] = []
  let level: TensionLevel = 0
  const raise = (l: TensionLevel, why: string) => {
    if (l > level) level = l
    reasons.push(why)
  }

  for (const [low, a] of at) {
    const b = at.get((low + 1) % 12)
    if (!b) continue
    switch (low) {
      case 0:
        if (dominant) raise(1, `${b} sits a half step above the root (${a}): the classic dark tension of a 7♭9 chord.`)
        else raise(2, `${b} rubs a half step above the root (${a}).`)
        break
      case 3:
        raise(1, `${a} and ${b} are both kinds of 3rd (minor and major): a gritty, bluesy rub.`)
        break
      case 4:
        raise(
          2,
          `The 11 (${b}) rubs a half step above the 3rd (${a}). Players usually drop the 3rd (sus4) or raise the 11 (#11).`,
        )
        break
      case 6:
        raise(1, `${a} sits a half step below the 5th (${b}): a shimmering, dreamy rub.`)
        break
      case 7:
        raise(1, `${b} sits a half step above the 5th (${a}): dark and tense.`)
        break
      case 10:
        raise(2, `Both a ♭7 (${a}) and a major 7 (${b}): they clash.`)
        break
      case 2: // 9 with a minor 3rd: the standard minor 9 sound
      case 9: // 13 with a ♭7: the standard 13 chord
      case 11: // maj7 under the root: the standard maj7 sound
        break
      default:
        raise(2, `${a} and ${b} are a half step apart, so they rub.`)
    }
  }
  // A slash bass that isn't a chord note can rub against the chord above it.
  if (chord.bass !== undefined && !at.has(semitonesFromRoot(chord, chord.bass))) {
    const s = semitonesFromRoot(chord, chord.bass)
    const above = at.get((s + 1) % 12)
    const below = at.get((s + 11) % 12)
    if (s === 11) raise(1, `${chord.bass} in the bass sits a half step under the root (${chord.root}): a bittersweet, passing sound.`)
    else if (above || below) raise(2, `${chord.bass} in the bass rubs a half step against ${above ?? below}.`)
  }
  if (TENSE_TYPES.has(chord.type)) {
    const t = chordType(chord.type)
    raise(1, `${t.name[0].toUpperCase()}${t.name.slice(1)} chords are unstable on purpose: they want to move somewhere.`)
  }
  return { level, label: TENSION_LABELS[level], reasons }
}
