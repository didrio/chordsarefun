import * as Tone from 'tone'
import { clipEnd, metronomeClicks, playbackEnd, TICKS_PER_BEAT, type ClickAccent, type Clip, type TimeSignature } from './timeline'
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

// Metronome: a short click, louder and higher on the 1 of each bar (and a little on
// group starts in compound meters like 6/8).
const CLICKS: Record<ClickAccent, { freq: number; velocity: number }> = {
  bar: { freq: 1760, velocity: 1 },
  group: { freq: 1397, velocity: 0.75 },
  beat: { freq: 1175, velocity: 0.55 },
}
let click: Tone.Synth | null = null
let clickVolume: Tone.Volume | null = null
let metronomeOn = false

function getClick(): Tone.Synth {
  if (!click) {
    clickVolume = new Tone.Volume().toDestination()
    click = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    }).connect(clickVolume)
  }
  return click
}

/** Turn the metronome on/off and set its volume (0–1). Applies immediately, even mid-playback. */
export function setMetronome(on: boolean, volume: number) {
  metronomeOn = on
  getClick()
  clickVolume!.mute = volume <= 0
  clickVolume!.volume.value = Tone.gainToDb(Math.max(volume, 0.0001))
}

const transport = () => Tone.getTransport()

/** Our ticks -> Tone transport ticks ("i" notation), so BPM changes apply live. */
const toneTicks = (ticks: number) => Math.round((ticks * transport().PPQ) / TICKS_PER_BEAT)

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

export function setBpm(bpm: number) {
  transport().bpm.value = bpm
}

export type Schedule = {
  clips: Clip[]
  totalTicks: number
  /** For the metronome. */
  sig: TimeSignature
  loop: boolean
  /** Called when one-shot playback reaches the end of the last clip. */
  onEnd: () => void
}

/** Clips from the latest schedule(), used to sound a chord when starting mid-clip. */
let scheduledClips: Clip[] = []

/**
 * (Re)schedule the track. Call whenever the track changes, playing or not;
 * replaces previous events.
 */
export function schedule({ clips, totalTicks, sig, loop, onEnd }: Schedule) {
  const t = transport()
  const s = getSynth()
  t.cancel(0)
  scheduledClips = clips

  for (const clip of clips) {
    const freqs = toFreqs(clip.symbol)
    const duration = toneTicks(clip.length)
    t.schedule((time) => {
      s.triggerAttackRelease(freqs, Tone.Ticks(duration).toSeconds() * 0.95, time)
    }, `${toneTicks(clip.start)}i`)
  }

  const c = getClick()
  for (const { tick, accent } of metronomeClicks(totalTicks, sig)) {
    const { freq, velocity } = CLICKS[accent]
    t.schedule((time) => {
      if (metronomeOn) c.triggerAttackRelease(freq, 0.03, time, velocity)
    }, `${toneTicks(tick)}i`)
  }

  t.loop = loop
  t.loopStart = 0
  t.loopEnd = `${toneTicks(totalTicks)}i`

  if (!loop) {
    const end = toneTicks(playbackEnd(clips, totalTicks))
    if (t.state === 'started' && t.ticks >= end) {
      onEnd()
      return
    }
    t.schedule((time) => {
      Tone.getDraw().schedule(onEnd, time)
    }, `${end}i`)
  }
}

/** If `ticks` is in the middle of a clip, sound that chord for the rest of the clip. */
function soundClipAt(ticks: number) {
  const clip = scheduledClips.find((c) => c.start < ticks && ticks < clipEnd(c))
  if (!clip) return
  const remaining = Tone.Ticks(toneTicks(clipEnd(clip) - ticks)).toSeconds()
  getSynth().triggerAttackRelease(toFreqs(clip.symbol), remaining * 0.95, Tone.now() + 0.02)
}

/** Start (or resume) playback from `fromTicks`. */
export async function startPlayback(fromTicks: number) {
  await ensureAudio()
  transport().start(undefined, `${toneTicks(fromTicks)}i`)
  soundClipAt(fromTicks)
}

/** Pause, keeping the position. Returns the paused position in ticks. */
export function pausePlayback(): number {
  const t = transport()
  const at = playheadTicks()
  t.pause()
  synth?.releaseAll()
  return at
}

export function stopPlayback() {
  const t = transport()
  t.stop()
  t.position = 0
  synth?.releaseAll()
}

/** Jump the playhead while playing. */
export function seekPlayback(ticks: number) {
  const t = transport()
  if (t.state !== 'started') return
  synth?.releaseAll()
  t.ticks = toneTicks(ticks)
  soundClipAt(ticks)
}

/** Current playhead in our ticks (wraps when looping). */
export function playheadTicks(): number {
  return (transport().ticks * TICKS_PER_BEAT) / transport().PPQ
}
