import { Note } from 'tonal'
import { analyzeChord } from './analysis'
import { chordName, chordNotes, chordType, DOMINANT_TYPES, makeChord, noteAt, type Chord } from './chord'
import { spiceChords } from './home'
import { degreeChord, FLAVORS, isDiatonic, romanNumeral, type ModeName, type PaletteFlavor } from './theory'

/**
 * Ideas for an empty spot in the progression: chords that fit where it is (the chords
 * before and after it, the start or the end), grouped by what you want the moment to
 * do. Each idea says why, in plain words. Pure, so it's testable.
 */

export type Intent = 'home' | 'tension' | 'flow' | 'color'

export type Idea = { chord: Chord; roman: string; why: string }

export type IdeaGroup = { intent: Intent; title: string; hint: string; ideas: Idea[] }

export type Spot = {
  /** The nearest chord before the spot (empty clips skipped), if any. */
  prev: Chord | null
  /** The nearest chord after it, if any. */
  next: Chord | null
  /** With nothing after it on a looping track: the chord the loop goes back to. */
  loopTo: Chord | null
  tonic: string
  mode: ModeName
  /** Chord size, as in the palette. */
  flavor: PaletteFlavor
}

export const INTENTS: Record<Intent, { title: string; hint: string }> = {
  home: { title: 'Feel at home', hint: 'Rest, resolve, land' },
  tension: { title: 'Build tension', hint: 'Pull toward what comes next' },
  flow: { title: 'Flow smoothly', hint: 'Small moves, shared notes' },
  color: { title: 'Add color', hint: 'Borrowed and surprising chords' },
}

/** Most ideas per group. */
const PER_GROUP = 3

const chroma = (n: string) => Note.chroma(n) ?? -1
const MAJOR_TYPE: ModeName[] = ['ionian', 'lydian', 'mixolydian']

/** Notes two chords share, as names from `a`. */
const shared = (a: Chord, b: Chord) => {
  const other = new Set(chordNotes(b).map(chroma))
  return chordNotes(a).filter((n) => other.has(chroma(n)))
}

const list = (notes: string[]) => (notes.length <= 1 ? notes.join('') : `${notes.slice(0, -1).join(', ')} and ${notes.at(-1)}`)

/** Does `a` pull into `b`? A major/dominant chord a 5th above it, or a diminished chord a half step below. */
export function pullsInto(a: Chord, b: Chord): boolean {
  const up = (((chroma(a.root) - chroma(b.root)) % 12) + 12) % 12
  const has3rd = !a.omit.some((i) => i.startsWith('3'))
  if (DOMINANT_TYPES.has(a.type) && has3rd && up === 7) return true
  return ['dim', 'dim7', 'm7b5'].includes(a.type) && up === 11
}

/** Chords dominants can resolve to: major or minor ones (not diminished, sus, ...). */
const isResolvable = (c: Chord) => ['', 'm', '7', 'm7', 'maj7', 'mMaj7', '6', 'm6', 'add9', 'madd9', 'maj9', 'm9', '9'].includes(c.type)

/** Where the spot is, in words: "Between Am and F.", "After G, at the end." */
export function spotContext({ prev, next, loopTo }: Spot): string {
  const n = (c: Chord) => chordName(c)
  if (prev && next) return `Between ${n(prev)} and ${n(next)}.`
  if (prev) return loopTo ? `After ${n(prev)}, at the end (the loop goes back to ${n(loopTo)}).` : `After ${n(prev)}, at the end.`
  if (next) return `Before ${n(next)}, at the start.`
  return 'Nothing around it yet: good chords to start from.'
}

export function suggestForSpot(spot: Spot): { context: string; groups: IdeaGroup[] } {
  const { prev, next, loopTo, tonic, mode, flavor } = spot
  const size = FLAVORS.find((f) => f.key === flavor)?.size ?? 3
  const domType = size >= 5 ? '9' : size === 4 ? '7' : ''
  const key = Array.from({ length: 7 }, (_, d) => degreeChord(tonic, mode, d, size))
  const home = key[0]
  const name = chordName
  // Numerals read in context: Edim before F is vii°/IV (a passing chord), not just "iii°".
  const roman = (c: Chord) =>
    isDiatonic(c, tonic, mode) ? romanNumeral(c, tonic, mode) : analyzeChord(c, tonic, mode, next ?? loopTo).fit.roman
  const seen = new Set<string>()
  // Never suggest the chord that's already right next to the spot.
  for (const c of [prev, next]) if (c) seen.add(name({ ...c, inversion: 0 }))
  const take = (ideas: (Idea | null)[]) => {
    const out: Idea[] = []
    for (const idea of ideas) {
      if (!idea || out.length === PER_GROUP) continue
      const id = name(idea.chord)
      if (seen.has(id)) continue
      seen.add(id)
      out.push(idea)
    }
    return out
  }
  const idea = (chord: Chord, why: string): Idea => ({ chord, roman: roman(chord), why })

  // Feel at home: the home chord, and its "twin" (relative major/minor) as a softer landing.
  const homeWhy = () => {
    if (prev && pullsInto(prev, home)) return `${name(prev)} pulls here: the strongest landing, the tension lets go.`
    if (!prev) return 'Starting at home tells the ear what the key is.'
    if (!next && !loopTo) return 'Ending at home makes the song sound finished.'
    return 'Home base: rest and stability.'
  }
  const twinDegrees = MAJOR_TYPE.includes(mode) ? [5, 2] : [2, 5]
  const homeTriad = degreeChord(tonic, mode, 0, 3)
  const twin = twinDegrees
    .map((d) => key[d])
    .find((c) => {
      const triad = { ...c, type: chordType(c.type).lower ? 'm' : '' }
      return shared(triad, homeTriad).length === 2 && chordType(c.type).lower !== chordType(home.type).lower
    })
  const twinWhy = (c: Chord) =>
    prev && pullsInto(prev, home)
      ? `A fake-out: after ${name(prev)} the ear expects ${name(home)} and gets ${name(c)} instead (a deceptive cadence).`
      : `Shares ${list(shared(c, home))} with ${name(home)}: settled, but ${chordType(c.type).lower ? 'sadder' : 'brighter'}.`
  const homeIdeas = take([idea(home, homeWhy()), twin ? idea(twin, twinWhy(twin)) : null])

  // Build tension: chords that pull into what comes next (or back to the top of the loop, or home).
  const target = next ?? loopTo ?? home
  const targetName = name(target)
  const where = next ? `${targetName}, next` : loopTo ? `${targetName} at the top of the loop` : `home (${targetName})`
  const tensionIdeas: (Idea | null)[] = []
  if (isResolvable(target)) {
    const fifthUp = noteAt(target.root, '5P')
    // If the plain V is already next to the spot, its 7th version still pulls (C _ F: C7).
    const plainV = makeChord(fifthUp, domType)
    const v = seen.has(name(plainV)) && domType === '' ? makeChord(fifthUp, '7') : plainV
    const why = next || loopTo
      ? `The classic pull: the "V" of ${targetName}, it resolves into ${where}.`
      : prev
        ? `Ends on the "V" of the key, leaving the music hanging: it wants to go home to ${targetName} (a half cadence).`
        : `The "V" of the key: restless, it wants to go home to ${targetName}.`
    tensionIdeas.push(idea(v, why))
    const below = Note.simplify(Note.transpose(target.root, '-2m'))
    tensionIdeas.push(idea(makeChord(below, size >= 4 ? 'dim7' : 'dim'), `A diminished chord a half step below ${targetName}: it slides up into ${where}.`))
    if (size >= 4) {
      const above = Note.simplify(Note.transpose(target.root, '2m'))
      tensionIdeas.push(idea(makeChord(above, '7'), `Jazzy: stands in for the "V" and slides down a half step into ${where} (tritone sub).`))
    }
    tensionIdeas.push(idea(makeChord(fifthUp, 'sus4'), `Hangs in the air: a suspended "V" of ${targetName} that wants to settle.`))
  }
  // The key's own dominant, if the target pull wasn't possible.
  tensionIdeas.push(idea(key[4], `The key's own "V" chord: restless, it wants to go home to ${name(home)}.`))
  const tensionGroup = take(tensionIdeas)

  // Flow smoothly: chords of the key that share the most notes with their neighbors.
  const neighbors = [prev, next ?? loopTo].filter((c): c is Chord => c !== null)
  const flowIdeas = key
    .slice(1)
    .map((c) => {
      const keep = neighbors.map((nb) => shared(c, nb))
      const common = keep.reduce((s, k) => s + k.length, 0)
      // Diminished chords share notes easily but don't sound smooth; rank them last.
      const score = common - (chordType(c.type).symbol.startsWith('dim') || c.type === 'm7b5' ? 1.5 : 0)
      const parts = neighbors.flatMap((nb, j) => (keep[j].length ? [`${list(keep[j])} with ${name(nb)}`] : []))
      return { c, common, score, why: `Shares ${parts.join(', and ')}: notes that stay put make a smooth move.` }
    })
    .filter((f) => f.common > 0)
    .sort((a, b) => b.score - a.score)
  // Without neighbors, the most-used chords (IV, V, vi in major) are the natural picks.
  const order = neighbors.length === 0 ? (MAJOR_TYPE.includes(mode) ? [3, 4, 5] : [3, 5, 6]).map((d) => key[d]) : null
  const flowGroup = take(
    order
      ? order.map((c) => idea(c, 'One of the most-used chords in the key.'))
      : flowIdeas.map(({ c, why }) => idea(c, why)),
  )

  // Add color: borrowed and "leading" chords from outside the key, ones that move well into the next chord first.
  const colorTarget = next ?? loopTo
  const color = spiceChords(tonic, mode, flavor)
    .map((s) => {
      const leads = colorTarget ? pullsInto(s.chord, colorTarget) : false
      const common = colorTarget ? shared(s.chord, colorTarget).length : 0
      const fit = analyzeChord(s.chord, tonic, mode, colorTarget).fit
      const into = colorTarget
        ? leads
          ? ` Pulls into ${name(colorTarget)}.`
          : common >= 2
            ? ` Shares ${list(shared(s.chord, colorTarget))} with ${name(colorTarget)}.`
            : ''
        : ''
      const why = `${fit.title}.${into}`
      return { idea: idea(s.chord, why), score: (leads ? 3 : 0) + common }
    })
    .sort((a, b) => b.score - a.score)
  const colorGroup = take(color.map((c) => c.idea))

  const groups: IdeaGroup[] = [
    { intent: 'home', ...INTENTS.home, ideas: homeIdeas },
    { intent: 'tension', ...INTENTS.tension, ideas: tensionGroup },
    { intent: 'flow', ...INTENTS.flow, ideas: flowGroup },
    { intent: 'color', ...INTENTS.color, ideas: colorGroup },
  ]
  return { context: spotContext(spot), groups: groups.filter((g) => g.ideas.length > 0) }
}
