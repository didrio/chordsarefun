import { Note } from 'tonal'
import { bassNote, isSlash, voiceChord, type Chord } from './chord'
import { chordClips, clipEnd, sigBarTicks, sigBeatTicks, TICKS_PER_BEAT, type Clip, type TimeSignature } from './timeline'

/**
 * Patterns: how each part (chords, bass, drums) turns the track into notes. Everything
 * here is pure and shared by playback and MIDI export, so the MIDI matches what you hear.
 *
 * Rhythms sit on the bar grid and restart at every bar line (like the grid), so they
 * stay aligned in any meter: a pattern written for a 4/4 bar is cut short in 3/4 and
 * repeats its start in 5/4.
 */

export type NoteEvent = {
  tick: number
  duration: number
  midi: number
  /** Accent, 0–1 (playback also scales by chord size; see chordVelocity). */
  velocity: number
  /** How many notes were struck together with this one (for loudness normalization). */
  group: number
}

export type DrumVoice = 'kick' | 'snare' | 'hat' | 'openhat' | 'rim' | 'ride'
export type DrumEvent = { tick: number; voice: DrumVoice; velocity: number }

/** A clip's time span plus the meter it's in. */
type Span = { start: number; end: number; barTicks: number; beatTicks: number }

/** Notes struck together. Without `duration` a hit lasts until the next hit (times the pattern's gate). */
type Hit = { tick: number; notes: number[]; velocity: number; duration?: number; stagger?: number }

const EIGHTH = TICKS_PER_BEAT / 2
const SIXTEENTH = TICKS_PER_BEAT / 4
/** Time between strings in a strum (~20 ms at 120 BPM). */
const STRUM_TICKS = 18

/**
 * Grid positions in the span: cells of `step` ticks counted from each bar line, keeping
 * those whose index (mod `cycle`) is in `cells`.
 */
function grid(span: Span, step: number, cells: number[], cycle: number): number[] {
  const out: number[] = []
  const perBar = Math.round(span.barTicks / step)
  for (let bar = Math.floor(span.start / span.barTicks) * span.barTicks; bar < span.end; bar += span.barTicks) {
    for (let k = 0; k < perBar; k++) {
      const t = bar + k * step
      if (cells.includes(k % cycle) && t >= span.start && t < span.end) out.push(t)
    }
  }
  return out
}

const every = (span: Span, step: number) => grid(span, step, [0], 1)
const bars = (span: Span) => every(span, span.barTicks)
/** Make sure the chord sounds when it starts, even if the rhythm has no hit there. */
const onChange = (ticks: number[], span: Span) => (ticks.includes(span.start) ? ticks : [span.start, ...ticks])

/** Accent by position: the 1 of a bar is strongest, then beats, then offbeats. */
function accent(tick: number, span: Span): number {
  if (tick % span.barTicks === 0) return 1
  if (tick % span.beatTicks === 0) return 0.85
  return 0.7
}

/** Hits at `ticks` playing `pick(i)` notes, accented by position. */
const hits = (ticks: number[], span: Span, pick: (i: number) => number[], scale = 1): Hit[] =>
  ticks.map((tick, i) => ({ tick, notes: pick(i), velocity: accent(tick, span) * scale }))

/** Notes of `hits` with durations: until the next hit (or the span end), times `gate`. */
function expand(list: Hit[], span: Span, gate: number): NoteEvent[] {
  const sorted = [...list].sort((a, b) => a.tick - b.tick)
  return sorted.flatMap((hit, i) => {
    const until = Math.min(sorted.find((h, j) => j > i && h.tick > hit.tick)?.tick ?? span.end, span.end)
    const length = hit.duration ?? Math.max(SIXTEENTH / 4, (until - hit.tick) * gate)
    return hit.notes.flatMap((midi, n) => {
      const tick = hit.tick + (hit.stagger ?? 0) * n
      const room = span.end - tick
      // Never past the clip's end (a strum's last strings can fall off a very short clip).
      if (room <= 0) return []
      const duration = Math.min(room, Math.max(SIXTEENTH / 4, length - (tick - hit.tick)))
      return [{ tick, duration, midi, velocity: hit.velocity, group: hit.notes.length }]
    })
  })
}

export type PatternInfo = { id: string; label: string; description: string }

type ChordPattern = PatternInfo & { render: (notes: number[], span: Span) => NoteEvent[] }

/** Note order for a broken chord: bottom, top, middle(s), top. */
const brokenOrder = (n: number) => (n < 3 ? [0, n - 1] : [0, n - 1, ...Array.from({ length: n - 2 }, (_, i) => i + 1).flatMap((i) => [i, n - 1])])
const upDown = (n: number) => (n < 3 ? [0, n - 1] : [...Array.from({ length: n }, (_, i) => i), ...Array.from({ length: n - 2 }, (_, i) => n - 2 - i)])

/** Chord patterns, most common first. The first is the plain "hit the chord and hold it". */
export const CHORD_PATTERNS: ChordPattern[] = [
  {
    id: 'block',
    label: 'Whole chord',
    description: 'The full chord on each change, held. The clearest way to hear the harmony.',
    render: (notes, span) => expand([{ tick: span.start, notes, velocity: 1 }], span, 0.97),
  },
  {
    id: 'bar',
    label: 'Once per bar',
    description: 'The chord again at every bar line, so long chords keep sounding.',
    render: (notes, span) => expand(hits(onChange(bars(span), span), span, () => notes), span, 0.97),
  },
  {
    id: 'beats',
    label: 'Every beat',
    description: 'A steady chord on each beat, like a simple piano or guitar part.',
    render: (notes, span) => expand(hits(onChange(every(span, span.beatTicks), span), span, () => notes), span, 0.85),
  },
  {
    id: 'pulse8',
    label: 'Pulsing 8ths',
    description: 'Short chords on every 8th note: driving pop and rock.',
    render: (notes, span) => expand(hits(onChange(every(span, EIGHTH), span), span, () => notes), span, 0.55),
  },
  {
    id: 'sixteenths',
    label: 'Driving 16ths',
    description: 'Short chords on every 16th: relentless trance and EDM energy.',
    render: (notes, span) => expand(hits(onChange(every(span, SIXTEENTH), span), span, () => notes, 0.85), span, 0.4),
  },
  {
    id: 'pushes',
    label: 'Pop 3-3-2',
    description: 'Hits on 1, the "and" of 2, and 4: the syncopated feel of modern pop.',
    render: (notes, span) => expand(hits(onChange(grid(span, EIGHTH, [0, 3, 6], 8), span), span, () => notes), span, 0.9),
  },
  {
    id: 'ballad',
    label: 'Ballad piano',
    description: 'Bass note held on the 1, the rest of the chord on every beat: like a pianist\'s two hands.',
    render: (notes, span) => {
      const [low, ...upper] = notes
      const left = hits(onChange(bars(span), span), span, () => [low])
      const right = hits(onChange(every(span, span.beatTicks), span), span, () => (upper.length ? upper : [low]), 0.75)
      return [...expand(left, span, 0.97), ...expand(right, span, 0.9)]
    },
  },
  {
    id: 'strum',
    label: 'Strum',
    description: 'Down, down-up, up-down strums with the strings spread out, like a guitar.',
    render: (notes, span) => {
      const ticks = onChange(grid(span, EIGHTH, [0, 2, 3, 5, 6], 8), span)
      return expand(
        ticks.map((tick) => {
          const up = (tick % span.barTicks) % TICKS_PER_BEAT !== 0
          return { tick, notes: up ? [...notes].reverse() : notes, velocity: accent(tick, span) * (up ? 0.75 : 1), stagger: STRUM_TICKS }
        }),
        span,
        0.95,
      )
    },
  },
  {
    id: 'broken',
    label: 'Broken chord',
    description: 'Bottom, top, middle, top in 8ths: classic flowing piano accompaniment.',
    render: (notes, span) => {
      const order = brokenOrder(notes.length)
      return expand(hits(onChange(every(span, EIGHTH), span), span, (i) => [notes[order[i % order.length]]]), span, 0.95)
    },
  },
  {
    id: 'arpUp',
    label: 'Arpeggio up',
    description: 'One note at a time, low to high, in 8ths.',
    render: (notes, span) => expand(hits(onChange(every(span, EIGHTH), span), span, (i) => [notes[i % notes.length]]), span, 0.95),
  },
  {
    id: 'arpUpDown',
    label: 'Arpeggio up & down',
    description: 'Up through the chord and back down, in 8ths: dreamy and flowing.',
    render: (notes, span) => {
      const order = upDown(notes.length)
      return expand(hits(onChange(every(span, EIGHTH), span), span, (i) => [notes[order[i % order.length]]]), span, 0.95)
    },
  },
  {
    id: 'arpDown',
    label: 'Arpeggio down',
    description: 'One note at a time, high to low, in 8ths: wistful and falling.',
    render: (notes, span) => {
      const down = [...notes].reverse()
      return expand(hits(onChange(every(span, EIGHTH), span), span, (i) => [down[i % down.length]]), span, 0.95)
    },
  },
  {
    id: 'arp16',
    label: 'Sparkle arpeggio',
    description: 'A fast arpeggio in 16ths: shimmering synth or harp.',
    render: (notes, span) => expand(hits(onChange(every(span, SIXTEENTH), span), span, (i) => [notes[i % notes.length]], 0.8), span, 0.85),
  },
  {
    id: 'offbeat',
    label: 'Offbeat stabs',
    description: 'Short chords between the beats only: reggae skank and house piano.',
    render: (notes, span) => expand(hits(grid(span, EIGHTH, [1, 3, 5, 7], 8), span, () => notes), span, 0.6),
  },
  {
    id: 'backbeat',
    label: 'Backbeat stabs',
    description: 'Short chords on 2 and 4 only, with the snare: ska, gospel, blues.',
    render: (notes, span) => expand(hits(grid(span, EIGHTH, [2, 6], 8), span, () => notes), span, 0.4),
  },
  {
    id: 'charleston',
    label: 'Jazz comping',
    description: 'Hits on 1 and the "and" of 2 (the Charleston rhythm): how jazz pianists comp.',
    render: (notes, span) => expand(hits(onChange(grid(span, EIGHTH, [0, 3], 8), span), span, () => notes), span, 0.5),
  },
  {
    id: 'bossa',
    label: 'Bossa comp',
    description: 'The syncopated guitar rhythm of bossa nova.',
    render: (notes, span) => expand(hits(onChange(grid(span, SIXTEENTH, [0, 3, 6, 10, 13], 16), span), span, () => notes), span, 0.5),
  },
  {
    id: 'tresillo',
    label: 'Tresillo',
    description: 'The 3-3-2 Latin rhythm twice a bar: reggaeton, dancehall, Afrobeats.',
    render: (notes, span) => expand(hits(onChange(grid(span, SIXTEENTH, [0, 3, 6, 8, 11, 14], 16), span), span, () => notes), span, 0.5),
  },
  {
    id: 'funk',
    label: 'Funky 16ths',
    description: 'Short, choppy 16th-note stabs: funk guitar and clavinet.',
    render: (notes, span) => expand(hits(onChange(grid(span, SIXTEENTH, [0, 3, 6, 7, 10, 14], 16), span), span, () => notes), span, 0.35),
  },
]

type BassContext = { bass: number; tones: number[]; next: number | null }
type BassPattern = PatternInfo & { render: (ctx: BassContext, span: Span) => NoteEvent[] }

/** A 5th above the bass if it's in the chord, else the octave. */
const fifthOf = (ctx: BassContext) => (ctx.tones.includes(ctx.bass + 7) ? ctx.bass + 7 : ctx.bass + 12)

/** Bass patterns, most common first. The bass plays the chord's bass note: the root, or a slash chord's bass (inversions don't move it). */
export const BASS_PATTERNS: BassPattern[] = [
  {
    id: 'root',
    label: 'Held notes',
    description: 'The bass note on each change (and each bar), held. Fits anything.',
    render: (ctx, span) => expand(hits(onChange(bars(span), span), span, () => [ctx.bass]), span, 0.97),
  },
  {
    id: 'eighths',
    label: 'Driving 8ths',
    description: 'The bass note on every 8th: rock and pop energy.',
    render: (ctx, span) => expand(hits(onChange(every(span, EIGHTH), span), span, () => [ctx.bass]), span, 0.6),
  },
  {
    id: 'quarters',
    label: 'Steady beats',
    description: 'The bass note on every beat.',
    render: (ctx, span) => expand(hits(onChange(every(span, span.beatTicks), span), span, () => [ctx.bass]), span, 0.8),
  },
  {
    id: 'rootFifth',
    label: 'Root–fifth',
    description: 'Bass note, then the 5th, every other beat: country, folk, bossa.',
    render: (ctx, span) => {
      const ticks = onChange(grid(span, span.beatTicks, [0], 2), span)
      return expand(hits(ticks, span, (i) => [i % 2 === 0 ? ctx.bass : fifthOf(ctx)]), span, 0.85)
    },
  },
  {
    id: 'syncopated',
    label: 'Pop 3-3-2',
    description: 'Hits on 1, the "and" of 2, and 4, locking with the pop chord rhythm.',
    render: (ctx, span) => expand(hits(onChange(grid(span, EIGHTH, [0, 3, 6], 8), span), span, () => [ctx.bass]), span, 0.85),
  },
  {
    id: 'octaves',
    label: 'Octave pump',
    description: 'Low and high octaves bouncing in 8ths: disco and house.',
    render: (ctx, span) =>
      expand(hits(onChange(every(span, EIGHTH), span), span, (i) => [i % 2 === 0 ? ctx.bass : ctx.bass + 12]), span, 0.5),
  },
  {
    id: 'offbeat',
    label: 'Rolling offbeat',
    description: 'The bass note between the beats, under a four-on-the-floor kick: trance, techno.',
    render: (ctx, span) => expand(hits(grid(span, EIGHTH, [1, 3, 5, 7], 8), span, () => [ctx.bass]), span, 0.5),
  },
  {
    id: 'walking',
    label: 'Walking bass',
    description: 'A note per beat climbing through the chord, then stepping into the next one: jazz and blues.',
    render: (ctx, span) => {
      const ticks = onChange(every(span, span.beatTicks), span)
      const climb = [...ctx.tones.slice(1), ...ctx.tones.slice(1, -1).reverse(), ctx.bass]
      return expand(
        hits(ticks, span, (i) => {
          if (i === 0) return [ctx.bass]
          // The last beat before the next chord steps into it by a half step.
          if (i === ticks.length - 1 && ctx.next !== null && ticks.length > 1) {
            const below = ctx.next - 1
            const from = climb[(i - 1) % climb.length]
            return [Math.abs(below - from) <= Math.abs(ctx.next + 1 - from) ? below : ctx.next + 1]
          }
          return [climb[(i - 1) % climb.length]]
        }),
        span,
        0.9,
      )
    },
  },
  {
    id: 'hiphop',
    label: 'Hip-hop bounce',
    description: 'A few syncopated hits that leave space for the drums.',
    render: (ctx, span) => expand(hits(onChange(grid(span, SIXTEENTH, [0, 7, 10], 16), span), span, () => [ctx.bass]), span, 0.7),
  },
  {
    id: 'tresillo',
    label: 'Tresillo',
    description: 'Bass note and 5th in the 3-3-2 rhythm: reggaeton, dancehall, Afrobeats.',
    render: (ctx, span) => {
      const notes = [ctx.bass, ctx.bass, fifthOf(ctx)]
      return expand(hits(onChange(grid(span, SIXTEENTH, [0, 3, 6, 8, 11, 14], 16), span), span, (i) => [notes[i % 3]]), span, 0.7)
    },
  },
  {
    id: 'gallop',
    label: 'Gallop',
    description: 'An 8th and two 16ths, over and over: metal and hard rock drive.',
    render: (ctx, span) =>
      expand(hits(onChange(grid(span, SIXTEENTH, [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15], 16), span), span, () => [ctx.bass]), span, 0.6),
  },
  {
    id: 'funk',
    label: 'Funk',
    description: 'Busy 16th-note bass with octave pops.',
    render: (ctx, span) => {
      const notes = [ctx.bass, ctx.bass, ctx.bass + 12, ctx.bass, ctx.bass, fifthOf(ctx)]
      return expand(hits(onChange(grid(span, SIXTEENTH, [0, 3, 6, 10, 11, 14], 16), span), span, (i) => [notes[i % notes.length]]), span, 0.4)
    },
  },
]

/**
 * Drum patterns on a 16th-note grid, one string per voice: X = accent, x = normal,
 * o = soft (ghost), . = rest. They restart every bar.
 */
type DrumPattern = PatternInfo & { voices: Partial<Record<DrumVoice, string>> }

/** Drum patterns, most common first. */
export const DRUM_PATTERNS: DrumPattern[] = [
  {
    id: 'pop',
    label: 'Pop beat',
    description: 'Kick on 1 and 3 with a push, snare on 2 and 4, steady hi-hats.',
    voices: { kick: 'X.....x.X.......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
  },
  {
    id: 'rock',
    label: 'Rock',
    description: 'The straight-ahead rock beat.',
    voices: { kick: 'X.......X.x.....', snare: '....X.......X...', hat: 'X.x.X.x.X.x.X.x.' },
  },
  {
    id: 'four',
    label: 'Four on the floor',
    description: 'Kick on every beat, open hats between: house and disco.',
    voices: { kick: 'X...X...X...X...', snare: '....x.......x...', openhat: '..x...x...x...x.', hat: 'o.o.o.o.o.o.o.o.' },
  },
  {
    id: 'halftime',
    label: 'Half-time',
    description: 'Snare only on 3: slow, heavy, big ballads.',
    voices: { kick: 'X.........x.....', snare: '........X.......', hat: 'x.x.x.x.x.x.x.x.' },
  },
  {
    id: 'boombap',
    label: 'Boom-bap',
    description: 'Classic hip-hop: punchy kick, cracking snare. Great with swing.',
    voices: { kick: 'X......x..x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
  },
  {
    id: 'trap',
    label: 'Trap',
    description: 'Half-time snare with rapid hi-hats.',
    voices: { kick: 'X......x..X.....', snare: '........X.......', hat: 'xoxoxoxoxoxxxoxo' },
  },
  {
    id: 'funk',
    label: 'Funk',
    description: 'Syncopated kick, ghost notes on the snare, busy 16th hats.',
    voices: { kick: 'X..x..x...X..x..', snare: '....X..o.o..X..o', hat: 'xoxoxoxoxoxoxoxo' },
  },
  {
    id: 'bossa',
    label: 'Bossa nova',
    description: 'Soft, rolling kick and a rim-click clave.',
    voices: { kick: 'x..xx..xx..xx..x', rim: 'x..x..x...x..x..', hat: 'o.o.o.o.o.o.o.o.' },
  },
  {
    id: 'swing',
    label: 'Jazz swing',
    description: 'Ride cymbal "ding, ding-a-ding", hi-hat on 2 and 4. Use with swing.',
    voices: { ride: 'X...x.x.X...x.x.', hat: '....x.......x...', kick: 'o...o...o...o...' },
  },
  {
    id: 'onedrop',
    label: 'Reggae one drop',
    description: 'Kick and rim together on 3, nothing on 1.',
    voices: { kick: '........X.......', rim: '........X.......', hat: 'o.x.o.x.o.x.o.x.' },
  },
  {
    id: 'motown',
    label: 'Motown',
    description: 'Snare on every beat over a steady kick: classic soul and Motown.',
    voices: { kick: 'X.......X.....x.', snare: 'x...X...x...X...', hat: 'x.x.x.x.x.x.x.x.' },
  },
  {
    id: 'train',
    label: 'Train beat',
    description: 'Brushed 16ths on the snare with accents on 2 and 4: country and rockabilly.',
    voices: { kick: 'X.......X.......', snare: 'oxoxXxoxoxoxXxox' },
  },
  {
    id: 'dembow',
    label: 'Dembow',
    description: 'Four-on-the-floor kick with the boom-ch-boom-chick snare: reggaeton.',
    voices: { kick: 'X...X...X...X...', snare: '...x..x....x..x.', hat: 'x.x.x.x.x.x.x.x.' },
  },
  {
    id: 'afrobeat',
    label: 'Afrobeats',
    description: 'Rolling kick, clave-like rim and busy shaker: Afrobeats and Afro-pop.',
    voices: { kick: 'X.....x.X.....x.', rim: '...x..x...x..x..', hat: 'xoxoxoxoxoxoxoxo' },
  },
  {
    id: 'garage',
    label: '2-step garage',
    description: 'Skippy, syncopated kick with offbeat hats: UK garage. Great with swing.',
    voices: { kick: 'X......x..X.....', snare: '....X.......X...', openhat: '..x...x...x...x.', hat: 'o.o.o.o.o.o.o.o.' },
  },
  {
    id: 'breakbeat',
    label: 'Breakbeat',
    description: 'A chopped, funky break: big beat, jungle, old-school hip-hop.',
    voices: { kick: 'X.x.......xx....', snare: '....X..x.x..X..x', hat: 'x.x.x.x.x.x.x.x.' },
  },
  {
    id: 'dnb',
    label: 'Drum & bass',
    description: 'Fast two-step: kick on 1 and the "and" of 3, snare on 2 and 4. Use at 160–180 BPM.',
    voices: { kick: 'X.........X.....', snare: '....X.......X...', hat: 'xoxoxoxoxoxoxoxo' },
  },
  {
    id: 'punk',
    label: 'Punk',
    description: 'Kick on the beat, snare between: fast and frantic. Use at 160+ BPM.',
    voices: { kick: 'X...X...X...X...', snare: '..X...X...X...X.', hat: 'x.x.x.x.x.x.x.x.' },
  },
  {
    id: 'brushes',
    label: 'Jazz brushes',
    description: 'Soft brushed snare, gentle ride, hi-hat on 2 and 4: jazz ballads.',
    voices: { ride: 'x...o.o.x...o.o.', snare: 'oooooooooooooooo', hat: '....x.......x...', kick: 'o.......o.......' },
  },
  {
    id: 'waltz',
    label: 'Waltz',
    description: 'Boom-tap-tap, for 3/4 time.',
    voices: { kick: 'X...........', snare: '....x...x...', hat: 'x.x.x.x.x.x.' },
  },
]

const STRENGTH: Record<string, number> = { X: 1, x: 0.75, o: 0.4 }

export const chordPattern = (id: string) => CHORD_PATTERNS.find((p) => p.id === id) ?? CHORD_PATTERNS[0]
export const bassPattern = (id: string) => BASS_PATTERNS.find((p) => p.id === id) ?? BASS_PATTERNS[0]
export const drumPattern = (id: string) => DRUM_PATTERNS.find((p) => p.id === id) ?? DRUM_PATTERNS[0]

/** Drum hits for the whole track: each voice's string, restarted at every bar line. */
export function drumEvents(pattern: DrumPattern, totalTicks: number, sig: TimeSignature): DrumEvent[] {
  const barTicks = sigBarTicks(sig)
  const perBar = Math.round(barTicks / SIXTEENTH)
  const out: DrumEvent[] = []
  for (let bar = 0; bar < totalTicks; bar += barTicks) {
    for (let k = 0; k < perBar; k++) {
      const tick = bar + k * SIXTEENTH
      if (tick >= totalTicks) break
      for (const [voice, steps] of Object.entries(pattern.voices) as [DrumVoice, string][]) {
        const velocity = STRENGTH[steps[k % steps.length]]
        if (velocity) out.push({ tick, voice, velocity })
      }
    }
  }
  return out
}

/** The bass part's note for a chord: its bass note (root, or the slash note) in the bass register (A1–G#2). */
export function bassNoteFor(chord: Chord): number {
  let m = (Note.chroma(bassNote(chord)) ?? 0) + 24
  while (m < 33) m += 12
  return m
}

/**
 * What the chords part plays for a chord: its voicing (shaped by the inversion). A slash
 * chord's bass note is always heard: by the bass part when it's on, else by the chords
 * part itself, as one low note under the voicing (like a pianist's left hand).
 */
export function chordPartVoicing(chord: Chord, bassOn: boolean): number[] {
  const voicing = voiceChord(chord)
  if (bassOn || !isSlash(chord)) return voicing
  const pc = Note.chroma(chord.bass!) ?? 0
  const gap = (((voicing[0] - pc) % 12) + 12) % 12 || 12
  return [voicing[0] - gap, ...voicing]
}

/** The chord's notes (pitch classes) laid out in the octave above the bass note. */
function bassTones(voicing: number[], bass: number): number[] {
  const pcs = new Set(voicing.map((m) => ((m % 12) + 12) % 12))
  return Array.from({ length: 12 }, (_, i) => bass + i).filter((m) => pcs.has(m % 12))
}

/**
 * Swing: 8th-note offbeats are pushed late, up to a triplet feel at `swing` = 1
 * (an offbeat lands 2/3 of the way through the beat instead of halfway).
 */
export function swingTick(tick: number, swing: number): number {
  if (swing <= 0 || tick % TICKS_PER_BEAT !== EIGHTH) return tick
  return tick + Math.round((swing * TICKS_PER_BEAT) / 6)
}

export type Arrangement = {
  chordPattern: string
  bassPattern: string
  drumPattern: string
  swing: number
  /** Whether the bass part plays (if not, slash chords carry their own bass note). Default on. */
  bassOn?: boolean
}

export type Rendered = { chords: NoteEvent[]; bass: NoteEvent[]; drums: DrumEvent[] }

/** Every note the three parts play over the track. */
export function renderTrack(clips: Clip[], totalTicks: number, sig: TimeSignature, arr: Arrangement): Rendered {
  const barTicks = sigBarTicks(sig)
  const beatTicks = sigBeatTicks(sig)
  // Empty clips are silent.
  const sorted = chordClips(clips).sort((a, b) => a.start - b.start)
  const cp = chordPattern(arr.chordPattern)
  const bp = bassPattern(arr.bassPattern)
  const chords: NoteEvent[] = []
  const bass: NoteEvent[] = []
  sorted.forEach((clip, i) => {
    const span = { start: clip.start, end: clipEnd(clip), barTicks, beatTicks }
    const voicing = voiceChord(clip.chord)
    chords.push(...cp.render(chordPartVoicing(clip.chord, arr.bassOn ?? true), span))
    const after = sorted[i + 1]
    const b = bassNoteFor(clip.chord)
    const next = after && after.start === span.end ? bassNoteFor(after.chord) : null
    bass.push(...bp.render({ bass: b, tones: bassTones(voicing, b), next }, span))
  })
  const swing = <T extends { tick: number }>(e: T): T => ({ ...e, tick: swingTick(e.tick, arr.swing) })
  return {
    chords: chords.map(swing),
    bass: bass.map(swing),
    drums: drumEvents(drumPattern(arr.drumPattern), totalTicks, sig).map(swing),
  }
}
