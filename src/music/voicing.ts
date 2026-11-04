import { chordIntervals, voiceChord, VOICE_RANGE, type Chord } from './chord'

/**
 * How far one voicing moves to the next: each note's distance (in semitones) to the
 * nearest note of the other chord, counted both ways and halved. 0 = same notes.
 */
export function movement(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const near = (n: number, set: number[]) => Math.min(...set.map((m) => Math.abs(m - n)))
  return (a.reduce((s, n) => s + near(n, b), 0) + b.reduce((s, n) => s + near(n, a), 0)) / 2
}

const center = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length

/**
 * Inversions that make a progression move as little as possible between chords (what
 * players call voice leading): the first chord keeps its voicing, each next one takes
 * the inversion closest to the chord before it. A small pull toward the first chord's
 * register keeps long progressions from drifting up or down.
 */
export function smoothVoicing(chords: Chord[]): Chord[] {
  if (chords.length < 2) return chords
  const out = [chords[0]]
  let prev = voiceChord(chords[0])
  const home = center(prev)
  for (const chord of chords.slice(1)) {
    const n = chordIntervals(chord).length
    let best = { cost: Infinity, chord, voicing: voiceChord(chord) }
    for (let inversion = -2 * n; inversion <= 2 * n; inversion++) {
      const c = { ...chord, inversion }
      const v = voiceChord(c)
      if (v[0] < VOICE_RANGE.low || v[v.length - 1] > VOICE_RANGE.high) continue
      const cost = movement(prev, v) + 0.3 * Math.abs(center(v) - home) + 0.01 * Math.abs(inversion)
      if (cost < best.cost) best = { cost, chord: c, voicing: v }
    }
    out.push(best.chord)
    prev = best.voicing
  }
  return out
}

/**
 * Per-note velocity (0–1) for a chord of `count` notes, so chords sound equally loud
 * however many notes they have: notes add up in power, so each is scaled by 1/√count
 * (1 note = 1, a triad ≈ 0.58, 7 notes ≈ 0.38).
 */
export const chordVelocity = (count: number) => 1 / Math.sqrt(Math.max(1, count))

/**
 * Voice a newly placed chord to fit the chords around it: the inversion (and so octave)
 * that moves least from its neighbors, so new chords land in the register the track is
 * already in. With no neighbors the chord is left as is.
 */
export function fitToNeighbors(chord: Chord, prev?: Chord | null, next?: Chord | null): Chord {
  const around = [prev, next].filter((c): c is Chord => !!c).map((c) => voiceChord(c))
  if (around.length === 0) return chord
  const n = chordIntervals(chord).length
  let best = { cost: Infinity, chord }
  for (let inversion = -2 * n; inversion <= 3 * n; inversion++) {
    const c = { ...chord, inversion }
    const v = voiceChord(c)
    if (v[0] < VOICE_RANGE.low || v[v.length - 1] > VOICE_RANGE.high) continue
    const cost = around.reduce((s, a) => s + movement(a, v), 0) + 0.01 * Math.abs(inversion)
    if (cost < best.cost) best = { cost, chord: c }
  }
  return best.chord
}
