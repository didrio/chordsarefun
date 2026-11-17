import { arrangementOf, type GrooveSettings } from './grooves'
import { renderTrack, type DrumEvent, type NoteEvent } from './patterns'
import { playbackEnd, type Clip, type TimeSignature } from './timeline'

/**
 * What plays, as a list of segments laid end to end: a section's chords with its own
 * instruments, from `start` for `length` ticks. Playing one section is one segment; playing
 * the song is one segment per block of the arrangement. Pure, so playback, MIDI and audio
 * export can share it.
 */
export type Segment = { start: number; length: number; clips: Clip[]; groove: GrooveSettings }

/** Every note of every segment, at its time in the whole (ticks), tagged with its segment's index. */
export type SegmentNotes = {
  chords: (NoteEvent & { segment: number })[]
  bass: (NoteEvent & { segment: number })[]
  drums: (DrumEvent & { segment: number })[]
}

/** A part sounds only when it's on and not at zero volume. */
export const audible = (part: { on: boolean; volume: number }) => part.on && part.volume > 0

/**
 * Render each segment with its own patterns, swing and parts (renderTrack), moved to where it
 * starts. Patterns and swing restart at every segment (segments start on bar lines). Parts
 * that are off in a segment play nothing there.
 */
export function renderSegments(segments: Segment[], sig: TimeSignature): SegmentNotes {
  const out: SegmentNotes = { chords: [], bass: [], drums: [] }
  segments.forEach((seg, i) => {
    const r = renderTrack(seg.clips, seg.length, sig, arrangementOf(seg.groove))
    const at = <T extends { tick: number }>(e: T) => ({ ...e, tick: e.tick + seg.start, segment: i })
    if (audible(seg.groove.chords)) out.chords.push(...r.chords.map(at))
    if (audible(seg.groove.bass)) out.bass.push(...r.bass.map(at))
    if (audible(seg.groove.drums)) out.drums.push(...r.drums.map(at))
  })
  return out
}

/** The index of the segment playing at `tick`, or -1 outside them all. */
export const segmentAt = (segments: Segment[], tick: number) => segments.findIndex((s) => s.start <= tick && tick < s.start + s.length)

/** Total length of the segments in ticks. */
export const segmentsLength = (segments: Segment[]) => segments.reduce((end, s) => Math.max(end, s.start + s.length), 0)

/**
 * Where play-once playback ends: with the last chord of the last segment (or that segment's
 * end when it has no chords), as a single track ends with its last clip.
 */
export function segmentsEnd(segments: Segment[]): number {
  const last = segments.at(-1)
  return last ? last.start + playbackEnd(last.clips, last.length) : 0
}
