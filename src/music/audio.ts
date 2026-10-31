import * as Tone from 'tone'
import { secondsPerBeat, type ProgressionChord } from './progression'
import { voiceChord } from './theory'

let synth: Tone.PolySynth | null = null

function getSynth(): Tone.PolySynth {
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 1 },
    }).toDestination()
    synth.volume.value = -10
  }
  return synth
}

const toFreqs = (symbol: string) =>
  voiceChord(symbol).map((m) => Tone.Frequency(m, 'midi').toFrequency())

/** Browsers require audio to be started from a user gesture. */
export async function ensureAudio() {
  await Tone.start()
}

export async function previewChord(symbol: string) {
  await ensureAudio()
  getSynth().triggerAttackRelease(toFreqs(symbol), 0.8)
}

/**
 * Plays the progression on the Transport so it can be stopped cleanly.
 * `onStep` fires (in sync with audio) with the index of the sounding chord,
 * and with -1 when playback finishes.
 */
export async function playProgression(
  chords: ProgressionChord[],
  bpm: number,
  onStep: (index: number) => void,
) {
  await ensureAudio()
  stopPlayback()

  const transport = Tone.getTransport()
  const s = getSynth()
  const spb = secondsPerBeat(bpm)

  let t = 0
  chords.forEach((chord, i) => {
    const dur = chord.beats * spb
    const freqs = toFreqs(chord.symbol)
    transport.schedule((time) => {
      s.triggerAttackRelease(freqs, dur * 0.95, time)
      Tone.getDraw().schedule(() => onStep(i), time)
    }, t)
    t += dur
  })
  transport.schedule((time) => {
    Tone.getDraw().schedule(() => onStep(-1), time)
    transport.stop(time)
  }, t)

  transport.start()
}

export function stopPlayback() {
  const transport = Tone.getTransport()
  transport.stop()
  transport.cancel()
  transport.position = 0
  synth?.releaseAll()
}
