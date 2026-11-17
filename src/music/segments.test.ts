import { describe, expect, it } from 'vitest'
import { arrangementOf, DEFAULT_GROOVE, type GrooveSettings } from './grooves'
import { parseChord } from './parse'
import { renderTrack } from './patterns'
import { renderSegments, segmentAt, segmentsEnd, segmentsLength, type Segment } from './segments'
import { TICKS_PER_BEAT, type Clip, type TimeSignature } from './timeline'

const BAR = 4 * TICKS_PER_BEAT
const FOUR: TimeSignature = { beats: 4, unit: 4 }
const clip = (name: string, start: number, length: number): Clip => ({ id: name + start, chord: parseChord(name)!, start, length })
const off = (g: GrooveSettings, part: 'chords' | 'bass' | 'drums'): GrooveSettings => ({ ...g, [part]: { ...g[part], on: false } })

/** A: C for 2 bars (default instruments); B: Am for 1 bar of a 2-bar section, drums off. */
const A: Segment = { start: 0, length: 2 * BAR, clips: [clip('C', 0, 2 * BAR)], groove: DEFAULT_GROOVE }
const B: Segment = { start: 2 * BAR, length: 2 * BAR, clips: [clip('Am', 0, BAR)], groove: off(DEFAULT_GROOVE, 'drums') }

describe('segments', () => {
  it('each segment plays as its own track would, moved to where it starts', () => {
    const notes = renderSegments([A, B], FOUR)
    const alone = renderTrack(B.clips, B.length, FOUR, arrangementOf(B.groove))
    const fromB = notes.chords.filter((e) => e.segment === 1)
    expect(fromB.map((e) => e.tick)).toEqual(alone.chords.map((e) => e.tick + 2 * BAR))
    expect(fromB.map((e) => e.midi)).toEqual(alone.chords.map((e) => e.midi))
    expect(notes.chords.filter((e) => e.segment === 0).every((e) => e.tick < 2 * BAR)).toBe(true)
  })

  it('a part that is off (or silent) in a segment plays nothing there', () => {
    const notes = renderSegments([A, B], FOUR)
    expect(notes.drums.length).toBeGreaterThan(0)
    expect(notes.drums.every((e) => e.segment === 0)).toBe(true)
    const quiet: Segment = { ...A, groove: { ...A.groove, bass: { ...A.groove.bass, volume: 0 } } }
    expect(renderSegments([quiet], FOUR).bass).toEqual([])
  })

  it('finds the segment at a tick, the total length and where play-once ends', () => {
    expect(segmentAt([A, B], 0)).toBe(0)
    expect(segmentAt([A, B], 2 * BAR)).toBe(1)
    expect(segmentAt([A, B], 4 * BAR)).toBe(-1)
    expect(segmentsLength([A, B])).toBe(4 * BAR)
    // B's only chord ends after its first bar.
    expect(segmentsEnd([A, B])).toBe(3 * BAR)
    expect(segmentsEnd([A, { ...B, clips: [] }])).toBe(4 * BAR)
    expect(segmentsEnd([])).toBe(0)
  })
})
