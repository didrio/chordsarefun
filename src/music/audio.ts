import * as Tone from 'tone'
import type { Chord } from './chord'
import { arrangementOf, DEFAULT_GROOVE, type GrooveSettings } from './grooves'
import { bassNoteFor, chordPartVoicing, renderTrack, type DrumVoice, type NoteEvent, type Rendered } from './patterns'
import { bassSound, chordSound, cutoffHz, DRUM_TRIM_DB, partDb, type Instrument } from './sound'
import { chordTimes, metronomeClicks, playbackEnd, TICKS_PER_BEAT, type ClickAccent, type Clip, type TimeSignature } from './timeline'
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
type Graph = {
  chordFilter: Tone.Filter
  chordVolume: Tone.Volume
  bassVolume: Tone.Volume
  drumVolume: Tone.Volume
  kit: Kit
  /** Every node above, for dispose(). */
  nodes: { dispose: () => void }[]
  /** Master output after the limiter: faded to silence when everything stops at once (silenceAll). */
  out: Tone.Gain
}
let graph: Graph | null = null
let chordSynth: { id: string; synth: Poly } | null = null
let bassSynth: { id: string; synth: Poly } | null = null

const VOICES = { synth: Tone.Synth, fm: Tone.FMSynth, mono: Tone.MonoSynth }

/** A polyphonic synth for an instrument preset. Exported for offline level measurement. */
export function makePoly(inst: Instrument, out: Tone.InputNode): Poly {
  const voice = VOICES[inst.kind] as unknown as typeof Tone.Synth
  return new Tone.PolySynth(voice, inst.options as Partial<Tone.SynthOptions>).connect(out)
}

type Kit = { trigger: (voice: DrumVoice, time: number, velocity: number) => void; dispose: () => void }

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
  const filters: Tone.Filter[] = []
  const noise = (decay: number, freq: number, type: BiquadFilterType, volume: number) => {
    const filter = new Tone.Filter(freq, type).connect(out)
    filters.push(filter)
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
    dispose() {
      for (const node of [kick, body, snare, hat, openhat, ride, rim, ...filters]) node.dispose()
    },
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

/** The three parts' chains into a limiter and a master gain (synths are added separately). */
function makeGraph(brightness: number): Graph {
  const out = new Tone.Gain(1).toDestination()
  const limiter = new Tone.Limiter(-1).connect(out)
  const chordVolume = new Tone.Volume().connect(limiter)
  const bassVolume = new Tone.Volume().connect(limiter)
  const drumVolume = new Tone.Volume().connect(limiter)
  const chordFilter = new Tone.Filter({ type: 'lowpass', frequency: cutoffHz(brightness), rolloff: -24 }).connect(chordVolume)
  const kit = makeKit(drumVolume)
  return {
    chordFilter,
    chordVolume,
    bassVolume,
    drumVolume,
    kit,
    out,
    nodes: [chordFilter, chordVolume, bassVolume, drumVolume, limiter, out, kit],
  }
}

function getGraph() {
  if (!graph) {
    graph = makeGraph(groove.chords.brightness)
    applyGroove()
  }
  return graph
}

/** Each part's level and on/off from groove settings (instrument trims included). */
function setLevels(g: Graph, settings: GrooveSettings, chordInst: Instrument, bassInst: Instrument) {
  setLevel(g.chordVolume, settings.chords.on, settings.chords.volume, chordInst.trimDb)
  setLevel(g.bassVolume, settings.bass.on, settings.bass.volume, bassInst.trimDb)
  setLevel(g.drumVolume, settings.drums.on, settings.drums.volume, DRUM_TRIM_DB)
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
  setLevels(g, groove, chordInst, bassInst)
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
async function soundChord(chord: Chord, seconds: number) {
  const gen = generation
  await ensureAudio()
  if (gen !== generation) return // everything was silenced meanwhile (another session opened)
  getGraph()
  const notes = chordPartVoicing(chord, groove.bass.on)
  chordSynth?.synth.triggerAttackRelease(notes.map(freq), seconds, undefined, chordVelocity(notes.length))
  if (groove.bass.on) bassSynth?.synth.triggerAttackRelease(freq(bassNoteFor(chord)), seconds, undefined, 0.9)
}

let previewTimers: number[] = []

/**
 * Bumped by silenceAll(). Sounds that wait for the audio to start (`await ensureAudio()`)
 * check it afterwards, so nothing started before a session switch sounds after it.
 */
let generation = 0

/** Called once when the running session preview (previewSession) ends, finished or stopped. */
let previewEnded: (() => void) | null = null

/** A session preview's own sound graph and synths, built from that session's groove; thrown away after. */
let previewRig: { graph: Graph; synths: Poly[] } | null = null

/** Bumped by every stopPreview, so a session preview still waiting for the audio to start can tell it was cancelled. */
let previewToken = 0

/**
 * Stop a preview of several chords (previewProgression, previewSession) before its next
 * chord. A session preview stops at once (its own sound graph fades out and is thrown
 * away); `release` also cuts a chord still ringing on the main instruments.
 */
export function stopPreview(release = false) {
  previewToken++
  previewTimers.forEach(clearTimeout)
  previewTimers = []
  if (release) releaseAll()
  const rig = previewRig
  previewRig = null
  if (rig) {
    rig.graph.out.gain.rampTo(0, 0.03)
    window.setTimeout(() => {
      rig.synths.forEach((synth) => synth.dispose())
      rig.graph.nodes.forEach((n) => n.dispose())
    }, 100)
  }
  const ended = previewEnded
  previewEnded = null
  ended?.()
}

/** Hear one chord now (see soundChord). Like every preview, it replaces a running one. */
export function previewChord(chord: Chord, seconds = 0.8) {
  stopPreview()
  return soundChord(chord, seconds)
}

/** Play chords one after another (outside the track), `seconds` each. Replaces any running preview. */
export function previewProgression(chords: Chord[], seconds: number) {
  stopPreview()
  ensureAudio()
  previewTimers = chords.map((chord, i) => window.setTimeout(() => soundChord(chord, seconds * 0.95), i * seconds * 1000))
}

/** A whole stored session, as its Play button would play it once. */
export type SessionMusic = {
  clips: Clip[]
  totalTicks: number
  sig: TimeSignature
  bpm: number
  groove: GrooveSettings
}

/**
 * Hear another session exactly as its Play button plays it, looping over the whole track
 * until stopped: its tempo, time signature, patterns, swing, sounds, brightness, mix and
 * parts on/off, without the metronome. It plays on its own sound graph built from that
 * session's groove (so the open session's sounds are untouched). Each pass's notes (from
 * renderTrack) are scheduled on the audio clock when the pass before starts, so loops are
 * seamless and there's always a pass queued ahead. Replaces any running preview; stopped
 * by stopPreview (■, another preview, silenceAll). `onChord` is called as each chord starts
 * (index into chordTimes), `onEnd` when the preview is stopped.
 */
export async function previewSession(
  music: SessionMusic,
  { onEnd, onChord }: { onEnd?: () => void; onChord?: (index: number) => void } = {},
) {
  stopPreview()
  previewEnded = onEnd ?? null
  const token = previewToken
  await ensureAudio()
  if (token !== previewToken) return // stopped (or replaced) while the audio was starting

  const { clips, totalTicks, sig, bpm, groove: settings } = music
  const sec = (ticks: number) => (ticks / TICKS_PER_BEAT) * (60 / bpm)
  const g = makeGraph(settings.chords.brightness)
  const chordInst = chordSound(settings.chords.sound)
  const bassInst = bassSound(settings.bass.sound)
  const chords = makePoly(chordInst, g.chordFilter)
  const bass = makePoly(bassInst, g.bassVolume)
  setLevels(g, settings, chordInst, bassInst)
  previewRig = { graph: g, synths: [chords, bass] }

  const rendered = renderTrack(clips, totalTicks, sig, arrangementOf(settings))
  const byTick = <T extends { tick: number }>(events: T[]) => [...events].sort((a, b) => a.tick - b.tick)
  const chordEvents = settings.chords.on ? byTick(rendered.chords) : []
  const bassEvents = settings.bass.on ? byTick(rendered.bass) : []
  const drumEvents = settings.drums.on ? byTick(rendered.drums) : []
  const times = chordTimes(clips, bpm)
  const loopSeconds = sec(totalTicks)
  const first = Tone.now() + 0.05
  /** Milliseconds until an audio-clock time, so timers follow the music without drifting. */
  const msUntil = (time: number) => Math.max(0, (time - Tone.immediate()) * 1000)

  const schedulePass = (n: number) => {
    if (previewRig?.graph !== g) return // stopped
    const start = first + n * loopSeconds
    for (const e of chordEvents) playNote(chords, e, start + sec(e.tick), sec(e.duration))
    for (const e of bassEvents) playNote(bass, e, start + sec(e.tick), sec(e.duration))
    for (const e of drumEvents) g.kit.trigger(e.voice, start + sec(e.tick), e.velocity)
    // Added to the earlier passes' timers (some still pending), so stopPreview clears them all.
    previewTimers = [
      ...previewTimers,
      ...times.map(({ at }, i) => window.setTimeout(() => onChord?.(i), msUntil(start + at))),
      // Once this pass starts, queue the next one (a whole loop ahead).
      window.setTimeout(() => schedulePass(n + 1), msUntil(start)),
    ]
  }
  schedulePass(0)
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
  const gen = generation
  await ensureAudio()
  if (gen !== generation) return
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

/**
 * Stop every sound right now, for opening another session: playback, previews (and their
 * pending chords), release tails, and the notes Tone has already queued a little ahead
 * (PolySynth keeps them on timers that releaseAll() doesn't cancel; disposing the synths
 * does). The output fades out over a few ms to avoid a click, then the whole sound graph
 * is thrown away; the next sound builds a fresh one.
 */
export function silenceAll() {
  generation++
  stopPreview()
  const t = transport()
  t.stop()
  t.position = 0
  t.cancel(0)
  const old = { graph, chord: chordSynth, bass: bassSynth }
  graph = null
  chordSynth = null
  bassSynth = null
  if (!old.graph) return
  old.graph.out.gain.rampTo(0, 0.03)
  window.setTimeout(() => {
    old.chord?.synth.dispose()
    old.bass?.synth.dispose()
    old.graph!.nodes.forEach((n) => n.dispose())
  }, 100)
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
