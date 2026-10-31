import { Midi } from '@tonejs/midi'
import type { ProgressionChord } from './progression'
import { voiceChord } from './theory'

export function progressionToMidi(chords: ProgressionChord[], bpm: number): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  const ppq = midi.header.ppq
  const track = midi.addTrack()
  track.name = 'Chords'

  let ticks = 0
  for (const chord of chords) {
    const durationTicks = chord.beats * ppq
    for (const note of voiceChord(chord.symbol)) {
      track.addNote({ midi: note, ticks, durationTicks, velocity: 0.8 })
    }
    ticks += durationTicks
  }
  return midi.toArray()
}

export function downloadMidi(chords: ProgressionChord[], bpm: number, filename = 'progression.mid') {
  const bytes = progressionToMidi(chords, bpm)
  const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
