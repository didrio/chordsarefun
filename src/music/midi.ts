import { Midi } from '@tonejs/midi'
import { TICKS_PER_BEAT, type Clip, type TimeSignature } from './timeline'
import { voiceChord } from './theory'

export function clipsToMidi(clips: Clip[], bpm: number, sig: TimeSignature = { beats: 4, unit: 4 }): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [sig.beats, sig.unit] })
  const scale = midi.header.ppq / TICKS_PER_BEAT
  const track = midi.addTrack()
  track.name = 'Chords'

  for (const clip of clips) {
    for (const note of voiceChord(clip.symbol)) {
      track.addNote({
        midi: note,
        ticks: Math.round(clip.start * scale),
        durationTicks: Math.round(clip.length * scale),
        velocity: 0.8,
      })
    }
  }
  return midi.toArray()
}

export function downloadMidi(clips: Clip[], bpm: number, sig: TimeSignature, filename = 'progression.mid') {
  const bytes = clipsToMidi(clips, bpm, sig)
  const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
