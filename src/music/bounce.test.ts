import { describe, expect, it } from 'vitest'
import { BOUNCE_TAIL, bouncePlan, tickSeconds } from './bounce'
import { DEFAULT_GROOVE, type GrooveSettings } from './grooves'
import { parseChord } from './parse'
import { renderSegments, type Segment } from './segments'
import { TICKS_PER_BEAT, type Clip, type TimeSignature } from './timeline'

const BAR = 4 * TICKS_PER_BEAT
const FOUR: TimeSignature = { beats: 4, unit: 4 }
const ALL = ['chords', 'bass', 'drums'] as const
const clip = (name: string, start: number, length: number): Clip => ({ id: name + start, chord: parseChord(name)!, start, length })
const off = (g: GrooveSettings, part: 'chords' | 'bass' | 'drums'): GrooveSettings => ({ ...g, [part]: { ...g[part], on: false } })

/** A: C for 2 bars; B: Am then F, 2 bars, drums off. */
const A: Segment = { start: 0, length: 2 * BAR, clips: [clip('C', 0, 2 * BAR)], groove: DEFAULT_GROOVE }
const B: Segment = { start: 2 * BAR, length: 2 * BAR, clips: [clip('Am', 0, BAR), clip('F', BAR, BAR)], groove: off(DEFAULT_GROOVE, 'drums') }

describe('bouncePlan', () => {
  it('times every note in seconds at the tempo', () => {
    expect(tickSeconds(TICKS_PER_BEAT, 120)).toBe(0.5)
    expect(tickSeconds(BAR, 60)).toBe(4)
    const plan = bouncePlan({ segments: [A], sig: FOUR, bpm: 120, parts: [...ALL] })
    const rendered = renderSegments([A], FOUR)
    expect(plan.chords.map((n) => n.time)).toEqual(rendered.chords.map((e) => e.tick / TICKS_PER_BEAT / 2))
    expect(plan.chords.map((n) => n.seconds)).toEqual(rendered.chords.map((e) => e.duration / TICKS_PER_BEAT / 2))
    expect(plan.chords.map((n) => n.midi)).toEqual(rendered.chords.map((e) => e.midi))
    expect(plan.drums.map((h) => h.time)).toEqual(rendered.drums.map((e) => e.tick / TICKS_PER_BEAT / 2))
  })

  it("plays a song's later blocks from where they start, with their own levels from then on", () => {
    const plan = bouncePlan({ segments: [A, B], sig: FOUR, bpm: 120, parts: [...ALL] })
    // Two bars of 4/4 at 120 BPM = 4 s.
    expect(plan.levels).toEqual([
      { segment: 0, time: 0 },
      { segment: 1, time: 4 },
    ])
    const fromB = plan.chords.filter((n) => n.segment === 1)
    expect(fromB.length).toBeGreaterThan(0)
    expect(Math.min(...fromB.map((n) => n.time))).toBe(4)
    expect(plan.chords.filter((n) => n.segment === 0).every((n) => n.time < 4)).toBe(true)
  })

  it('a part that is off in a block is silent there', () => {
    const plan = bouncePlan({ segments: [A, B], sig: FOUR, bpm: 120, parts: [...ALL] })
    expect(plan.drums.length).toBeGreaterThan(0)
    expect(plan.drums.every((h) => h.segment === 0 && h.time < 4)).toBe(true)
  })

  it('a stem has only its own part', () => {
    const bass = bouncePlan({ segments: [A, B], sig: FOUR, bpm: 120, parts: ['bass'] })
    expect(bass.bass.length).toBeGreaterThan(0)
    expect(bass.chords).toEqual([])
    expect(bass.drums).toEqual([])
    const drums = bouncePlan({ segments: [A, B], sig: FOUR, bpm: 120, parts: ['drums'] })
    expect(drums.drums.length).toBeGreaterThan(0)
    expect(drums.chords.length + drums.bass.length).toBe(0)
  })

  it('runs to the end of the last bar plus a tail, even when the last chord ends sooner', () => {
    const short: Segment = { start: 0, length: 4 * BAR, clips: [clip('C', 0, BAR)], groove: DEFAULT_GROOVE }
    const plan = bouncePlan({ segments: [short], sig: FOUR, bpm: 120, parts: [...ALL] })
    expect(plan.end).toBe(8)
    expect(plan.seconds).toBe(8 + BOUNCE_TAIL)
    expect(bouncePlan({ segments: [A, B], sig: FOUR, bpm: 60, parts: [...ALL] }).end).toBe(16)
  })

  it('has no metronome: nothing plays in an empty section', () => {
    const empty: Segment = { start: 0, length: 2 * BAR, clips: [], groove: off(DEFAULT_GROOVE, 'drums') }
    const plan = bouncePlan({ segments: [empty], sig: FOUR, bpm: 120, parts: [...ALL] })
    expect(plan.chords.length + plan.bass.length + plan.drums.length).toBe(0)
    expect(plan.seconds).toBe(4 + BOUNCE_TAIL)
  })
})
