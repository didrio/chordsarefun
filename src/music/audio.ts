import * as Tone from 'tone'
import type { Chord } from './chord'
import { arrangementOf, DEFAULT_GROOVE, type GrooveSettings } from './grooves'
import { bassNoteFor, chordPartVoicing, renderTrack, type DrumVoice, type NoteEvent, type Rendered } from './patterns'
import { bassSound, chordSound, cutoffHz, DRUM_TRIM_DB, partDb, type Instrument } from './sound'
import { metronomeClicks, playbackEnd, TICKS_PER_BEAT, type ClickAccent, type Clip, type TimeSignature } from './timeline'
import { chordVelocity } from './voicing'

/**
 * Playback with Tone.js: the only module touching Web Audio. Three parts, each into its
 * own volume, then a limiter (a safety net for dense chords):
 *   chords: PolySynth (instrument) -> low-pass filter (brightness) -> volume
 *   bass:   PolySynth of MonoSynths (instrument) -> volume
 *   drums:  synthesized kit -> volume
 */

type Poly = Tone.PolySynth<Tone.Synth>

let groove: GrooveSettings = DEFAULT_GROOVE
let graph: {
  chordFilter: Tone.Filter
  chordVolume: Tone.Volume
  bassVolume: Tone.Volume
  drumVolume: Tone.Volume
  kit: Kit
} | null = null
let chordSynth: { id: string; synth: Poly } | null = null
let bassSynth: { id: string; synth: Poly } | null = null

const VOICES = { synth: Tone.Synth, fm: Tone.FMSynth, mono: Tone.MonoSynth }

/** A polyphonic synth for an instrument preset. Exported for offline level measurement. */
export function makePoly(inst: Instrument, out: Tone.InputNode): Poly {
  const voice = VOICES[inst.kind] as unknown as typeof Tone.Synth
  return new Tone.PolySynth(voice, inst.options as Partial<Tone.SynthOptions>).connect(out)
}

type Kit = { trigger: (voice: DrumVoice, time: number, velocity: number) => void }

/**
 * Each drum voice's level in dB, balanced by measured peak (offline render): snare about
 * 1 dB under the kick, rim about 9 dB under, hats and cymbals 10–12 dB under, as in a
 * typical mix.
 */
export const KIT_LEVELS = { kick: 0, snareBody: -7, snare: -5, hat: -8, openhat: -13, ride: -8, rim: -9 }

/** A drum kit from synths: membrane kick, noise snare/hats/ride, square-blip rim click. Exported for measurement. */
export function makeKit(out: Tone.InputNode): Kit {
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.045,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.38, sustain: 0, release: 0.05 },
    volume: KIT_LEVELS.kick,
  }).connect(out)
  const body = new Tone.MembraneSynth({
    pitchDecay: 0.015,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
    volume: KIT_LEVELS.snareBody,
  }).connect(out)
  const noise = (decay: number, freq: number, type: BiquadFilterType, volume: number) => {
    const filter = new Tone.Filter(freq, type).connect(out)
    return new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay, sustain: 0, release: 0.01 },
      volume,
    }).connect(filter)
  }
  const snare = noise(0.17, 1200, 'highpass', KIT_LEVELS.snare)
  const hat = noise(0.035, 8000, 'highpass', KIT_LEVELS.hat)
  const openhat = noise(0.28, 7000, 'highpass', KIT_LEVELS.openhat)
  const ride = noise(0.45, 6000, 'bandpass', KIT_LEVELS.ride)
  const rim = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.01 },
    volume: KIT_LEVELS.rim,
  }).connect(out)
  return {
    trigger(voice, time, velocity) {
      switch (voice) {
        case 'kick':
          return kick.triggerAttackRelease('C1', 0.3, time, velocity)
        case 'snare':
          snare.triggerAttackRelease(0.15, time, velocity)
          return body.triggerAttackRelease('G2', 0.1, time, velocity)
        case 'hat':
          return hat.triggerAttackRelease(0.03, time, velocity)
        case 'openhat':
          return openhat.triggerAttackRelease(0.25, time, velocity)
        case 'ride':
          return ride.triggerAttackRelease(0.4, time, velocity)
        case 'rim':
          return rim.triggerAttackRelease('A6', 0.02, time, velocity)
      }
    },
  }
}

function getGraph() {
  if (!graph) {
    const limiter = new Tone.Limiter(-1).toDestination()
    const chordVolume = new Tone.Volume().connect(limiter)
    const bassVolume = new Tone.Volume().connect(limiter)
    const drumVolume = new Tone.Volume().connect(limiter)
    graph = {
      chordFilter: new Tone.Filter({ type: 'lowpass', frequency: cutoffHz(groove.chords.brightness), rolloff: -24 }).connect(
        chordVolume,
      ),
      chordVolume,
      bassVolume,
      drumVolume,
      kit: makeKit(drumVolume),
    }
    applyGroove()
  }
  return graph
}

const setLevel = (node: Tone.Volume, on: boolean, volume: number, trimDb = 0) => {
  const db = partDb(volume, trimDb)
  node.mute = !on || !Number.isFinite(db)
  if (Number.isFinite(db)) node.volume.value = db
}

function applyGroove() {
  const g = getGraph()
  const chordInst = chordSound(groove.chords.sound)
  if (chordSynth?.id !== chordInst.id) {
    chordSynth?.synth.dispose()
    chordSynth = { id: chordInst.id, synth: makePoly(chordInst, g.chordFilter) }
  }
  const bassInst = bassSound(groove.bass.sound)
  if (bassSynth?.id !== bassInst.id) {
    bassSynth?.synth.dispose()
    bassSynth = { id: bassInst.id, synth: makePoly(bassInst, g.bassVolume) }
  }
  setLevel(g.chordVolume, groove.chords.on, groove.chords.volume, chordInst.trimDb)
  setLevel(g.bassVolume, groove.bass.on, groove.bass.volume, bassInst.trimDb)
  setLevel(g.drumVolume, groove.drums.on, groove.drums.volume, DRUM_TRIM_DB)
  g.chordFilter.frequency.rampTo(cutoffHz(groove.chords.brightness), 0.05)
}

/** Parts' on/off, volumes, instruments and brightness. Applies immediately, even mid-playback. */
export function setGroove(next: GrooveSettings) {
  groove = next
  if (graph) applyGroove()
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
const tickSeconds = (ticks: number) => Tone.Ticks(toneTicks(ticks)).toSeconds()
const freq = (midi: number) => Tone.Frequency(midi, 'midi').toFrequency()

/** Play one note event; chord notes are scaled so every chord is equally loud whatever its size. */
function playNote(synth: Poly | undefined, e: NoteEvent, time: number, seconds = tickSeconds(e.duration)) {
  synth?.triggerAttackRelease(freq(e.midi), seconds, time, e.velocity * chordVelocity(e.group))
}

/** Browsers require audio to be started from a user gesture. */
export async function ensureAudio() {
  await Tone.start()
}

/**
 * Hear a chord now, as the track plays it: a block chord on the chord instrument, and
 * its bass note on the bass instrument when the bass part is on (so bass choices are
 * audible). Parts that are off stay silent, except that chords always sound.
 */
export async function previewChord(chord: Chord, seconds = 0.8) {
  await ensureAudio()
  getGraph()
  const notes = chordPartVoicing(chord, groove.bass.on)
  chordSynth?.synth.triggerAttackRelease(notes.map(freq), seconds, undefined, chordVelocity(notes.length))
  if (groove.bass.on) bassSynth?.synth.triggerAttackRelease(freq(bassNoteFor(chord)), seconds, undefined, 0.9)
}

let previewTimers: number[] = []

/** Stop a progression preview started by previewProgression. */
export function stopPreview() {
  previewTimers.forEach(clearTimeout)
  previewTimers = []
}

/** Play chords one after another (outside the track), `seconds` each. Replaces any running preview. */
export function previewProgression(chords: Chord[], seconds: number) {
  stopPreview()
  ensureAudio()
  previewTimers = chords.map((chord, i) => window.setTimeout(() => previewChord(chord, seconds * 0.95), i * seconds * 1000))
}

export function setBpm(bpm: number) {
  transport().bpm.value = bpm
}

export type Schedule = {
  clips: Clip[]
  totalTicks: number
  /** For the metronome and patterns. */
  sig: TimeSignature
  loop: boolean
  groove: GrooveSettings
  /** Called when one-shot playback reaches the end of the last clip. */
  onEnd: () => void
}

/** Notes from the latest schedule(), used to sound what's ringing when starting mid-note. */
let rendered: Rendered = { chords: [], bass: [], drums: [] }

/**
 * (Re)schedule the track. Call whenever the track or groove changes, playing or not;
 * replaces previous events. Parts that are off aren't scheduled.
 */
export function schedule({ clips, totalTicks, sig, loop, groove: settings, onEnd }: Schedule) {
  const t = transport()
  const g = getGraph()
  t.cancel(0)
  rendered = renderTrack(clips, totalTicks, sig, arrangementOf(settings))
  const at = (tick: number) => `${toneTicks(tick)}i`

  if (settings.chords.on) {
    for (const e of rendered.chords) t.schedule((time) => playNote(chordSynth?.synth, e, time), at(e.tick))
  }
  if (settings.bass.on) {
    for (const e of rendered.bass) t.schedule((time) => playNote(bassSynth?.synth, e, time), at(e.tick))
  }
  if (settings.drums.on) {
    for (const e of rendered.drums) t.schedule((time) => g.kit.trigger(e.voice, time, e.velocity), at(e.tick))
  }

  const c = getClick()
  for (const { tick, accent } of metronomeClicks(totalTicks, sig)) {
    const { freq: f, velocity } = CLICKS[accent]
    t.schedule((time) => {
      if (metronomeOn) c.triggerAttackRelease(f, 0.03, time, velocity)
    }, at(tick))
  }

  t.loop = loop
  t.loopStart = 0
  t.loopEnd = at(totalTicks)

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

/** Starting mid-note (play or seek): sound the chord and bass notes that would be ringing. */
function soundAt(ticks: number) {
  const ringing = (e: NoteEvent) => e.tick < ticks && ticks < e.tick + e.duration
  const now = Tone.now() + 0.02
  const remaining = (e: NoteEvent) => tickSeconds(e.tick + e.duration - ticks)
  if (groove.chords.on) for (const e of rendered.chords.filter(ringing)) playNote(chordSynth?.synth, e, now, remaining(e))
  if (groove.bass.on) for (const e of rendered.bass.filter(ringing)) playNote(bassSynth?.synth, e, now, remaining(e))
}

const releaseAll = () => {
  chordSynth?.synth.releaseAll()
  bassSynth?.synth.releaseAll()
}

/** Start (or resume) playback from `fromTicks`. */
export async function startPlayback(fromTicks: number) {
  await ensureAudio()
  transport().start(undefined, `${toneTicks(fromTicks)}i`)
  soundAt(fromTicks)
}

/** Pause, keeping the position. Returns the paused position in ticks. */
export function pausePlayback(): number {
  const t = transport()
  const at = playheadTicks()
  t.pause()
  releaseAll()
  return at
}

export function stopPlayback() {
  const t = transport()
  t.stop()
  t.position = 0
  releaseAll()
}

/** Jump the playhead while playing. */
export function seekPlayback(ticks: number) {
  const t = transport()
  if (t.state !== 'started') return
  releaseAll()
  t.ticks = toneTicks(ticks)
  soundAt(ticks)
}

/** Current playhead in our ticks (wraps when looping). */
export function playheadTicks(): number {
  return (transport().ticks * TICKS_PER_BEAT) / transport().PPQ
}
