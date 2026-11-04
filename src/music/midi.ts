import { Midi } from '@tonejs/midi'
import { arrangementOf, type GrooveSettings } from './grooves'
import { renderTrack, type DrumVoice } from './patterns'
import { TICKS_PER_BEAT, type Clip, type TimeSignature } from './timeline'

export type MidiPart = 'chords' | 'bass' | 'drums'

/** General MIDI drum notes, so drums land on the right pads of a drum rack. */
const GM_DRUMS: Record<DrumVoice, number> = { kick: 36, rim: 37, snare: 38, hat: 42, openhat: 46, ride: 51 }
/** MIDI channel 10 (index 9) is drums in General MIDI. */
const DRUM_CHANNEL = 9

/** Pattern accents (0–1) as MIDI velocities that still sound natural on a DAW instrument. */
const velocity = (accent: number) => Math.min(1, 0.3 + 0.6 * accent)

export type MidiOptions = {
  clips: Clip[]
  totalTicks: number
  bpm: number
  sig: TimeSignature
  groove: GrooveSettings
  /** Which parts to include, each as its own track (Ableton splits them into tracks on import). */
  parts: MidiPart[]
}

/** The track as a MIDI file, with exactly the notes playback plays (patterns, swing, voicings). */
export function trackMidi({ clips, totalTicks, bpm, sig, groove, parts }: MidiOptions): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [sig.beats, sig.unit] })
  const scale = midi.header.ppq / TICKS_PER_BEAT
  const at = (ticks: number) => Math.round(ticks * scale)
  const rendered = renderTrack(clips, totalTicks, sig, arrangementOf(groove))

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

export function downloadMidi(options: MidiOptions, filename = 'progression.mid') {
  const bytes = trackMidi(options)
  const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
