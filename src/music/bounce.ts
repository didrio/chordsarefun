import type { DrumVoice } from './patterns'
import { renderSegments, segmentsLength, type Segment } from './segments'
import { TICKS_PER_BEAT, type TimeSignature } from './timeline'

/**
 * What an audio export (a "bounce", as a DAW calls it) plays, in seconds: the same notes as
 * playback (renderSegments), on the clock of a file that starts at 0. Pure, so the timing is
 * tested without Web Audio; renderAudio in audio.ts only turns it into sound.
 */

export type BouncePart = 'chords' | 'bass' | 'drums'

/** How long the file runs past the last bar, so the last chord rings out (trimmed if it's silent sooner). */
export const BOUNCE_TAIL = 2

export type BounceNote = { segment: number; midi: number; velocity: number; group: number; time: number; seconds: number }
export type BounceHit = { segment: number; voice: DrumVoice; velocity: number; time: number }

export type BouncePlan = {
  chords: BounceNote[]
  bass: BounceNote[]
  drums: BounceHit[]
  /** Where each segment starts: its instruments' levels and brightness apply from then on. */
  levels: { segment: number; time: number }[]
  /** The end of the last bar (seconds): the file never stops before it. */
  end: number
  /** The whole render: the bars plus the tail. */
  seconds: number
}

export type BounceOptions = {
  /** What plays: one segment for a section, one per block for the song. */
  segments: Segment[]
  sig: TimeSignature
  bpm: number
  /** Which parts sound: every part for the mix, one for a stem. Parts that are off stay silent anyway. */
  parts: BouncePart[]
}

/** Ticks to seconds at a tempo (quarter notes per minute, in every meter). */
export const tickSeconds = (ticks: number, bpm: number) => (ticks / TICKS_PER_BEAT) * (60 / bpm)

/** Every note and drum hit of the parts asked for, and each segment's start, in seconds. No metronome. */
export function bouncePlan({ segments, sig, bpm, parts }: BounceOptions): BouncePlan {
  const sec = (ticks: number) => tickSeconds(ticks, bpm)
  const rendered = renderSegments(segments, sig)
  const notes = (part: 'chords' | 'bass') =>
    parts.includes(part)
      ? rendered[part].map((e) => ({ segment: e.segment, midi: e.midi, velocity: e.velocity, group: e.group, time: sec(e.tick), seconds: sec(e.duration) }))
      : []
  const end = sec(segmentsLength(segments))
  return {
    chords: notes('chords'),
    bass: notes('bass'),
    drums: parts.includes('drums') ? rendered.drums.map((e) => ({ segment: e.segment, voice: e.voice, velocity: e.velocity, time: sec(e.tick) })) : [],
    levels: segments.map((seg, i) => ({ segment: i, time: sec(seg.start) })),
    end,
    seconds: end + BOUNCE_TAIL,
  }
}
