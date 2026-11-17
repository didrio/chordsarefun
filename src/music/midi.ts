import { Midi } from '@tonejs/midi'
import { downloadFile } from '../download'
import type { GrooveSettings } from './grooves'
import type { DrumVoice } from './patterns'
import { renderSegments, type Segment } from './segments'
import { TICKS_PER_BEAT, type Clip, type TimeSignature } from './timeline'

export type MidiPart = 'chords' | 'bass' | 'drums'

/** The parts' names on screen and in exported file names. */
export const PART_LABELS: Record<MidiPart, string> = { chords: 'Chords', bass: 'Bass', drums: 'Drums' }

/** General MIDI drum notes, so drums land on the right pads of a drum rack. */
const GM_DRUMS: Record<DrumVoice, number> = { kick: 36, rim: 37, snare: 38, hat: 42, openhat: 46, ride: 51 }
/** MIDI channel 10 (index 9) is drums in General MIDI. */
const DRUM_CHANNEL = 9

/** Pattern accents (0–1) as MIDI velocities that still sound natural on a DAW instrument. */
const velocity = (accent: number) => Math.min(1, 0.3 + 0.6 * accent)

export type SongMidiOptions = {
  /** What plays: one segment for a section, one per block for the song (see segments.ts). */
  segments: Segment[]
  /** Named points in the file (a song's blocks), which a DAW shows as locators/markers. Ticks. */
  markers?: { tick: number; text: string }[]
  bpm: number
  sig: TimeSignature
  /** Which parts to include, each as its own track (Ableton splits them into tracks on import). */
  parts: MidiPart[]
}

/**
 * Segments as a MIDI file, with exactly the notes playback plays (patterns, swing, voicings,
 * each segment with its own instruments' parts on or off), tempo and time signature, and a
 * marker per named point. A song is one arrangement: its blocks' notes at their song times.
 */
export function songMidi({ segments, markers = [], bpm, sig, parts }: SongMidiOptions): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [sig.beats, sig.unit] })
  const scale = midi.header.ppq / TICKS_PER_BEAT
  const at = (ticks: number) => Math.round(ticks * scale)
  for (const m of markers) midi.header.meta.push({ ticks: at(m.tick), type: 'marker', text: m.text })
  const rendered = renderSegments(segments, sig)

  for (const part of ['chords', 'bass'] as const) {
    if (!parts.includes(part)) continue
    const track = midi.addTrack()
    track.name = part === 'chords' ? 'Chords' : 'Bass'
    track.channel = part === 'chords' ? 0 : 1
    for (const e of rendered[part]) {
      track.addNote({ midi: e.midi, ticks: at(e.tick), durationTicks: Math.max(1, at(e.duration)), velocity: velocity(e.velocity) })
    }
  }
  if (parts.includes('drums')) {
    const track = midi.addTrack()
    track.name = 'Drums'
    track.channel = DRUM_CHANNEL
    for (const e of rendered.drums) {
      track.addNote({ midi: GM_DRUMS[e.voice], ticks: at(e.tick), durationTicks: at(TICKS_PER_BEAT / 4), velocity: velocity(e.velocity) })
    }
  }
  return midi.toArray()
}

/** One progression as a MIDI file: a song of one segment (see songMidi). */
export function trackMidi({ clips, totalTicks, bpm, sig, groove, parts }: { clips: Clip[]; totalTicks: number; bpm: number; sig: TimeSignature; groove: GrooveSettings; parts: MidiPart[] }): Uint8Array {
  return songMidi({ segments: [{ start: 0, length: totalTicks, clips, groove }], bpm, sig, parts })
}

export function downloadMidi(options: SongMidiOptions, filename: string) {
  downloadFile(songMidi(options) as BlobPart, 'audio/midi', filename)
}
