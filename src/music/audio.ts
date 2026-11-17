import * as Tone from 'tone'
import type { Chord } from './chord'
import { DEFAULT_GROOVE, type GrooveSettings } from './grooves'
import { bassNoteFor, chordPartVoicing, type DrumVoice, type NoteEvent } from './patterns'
import { bouncePlan, type BounceOptions } from './bounce'
import { limiterLatency, limiterWorkletSource } from './limiter'
import { audible, renderSegments, segmentAt, segmentsEnd, type Segment, type SegmentNotes } from './segments'
import { bassSound, chordSound, cutoffHz, DRUM_TRIM_DB, partDb, type Instrument } from './sound'
import { chordTimes, metronomeClicks, TICKS_PER_BEAT, type ClickAccent, type Clip, type TimeSignature } from './timeline'
import { chordVelocity } from './voicing'

/**
 * Playback with Tone.js: the only module touching Web Audio. Three parts, each into its
 * own volume, then the master limiter (a lookahead brickwall at −1 dBFS, limiter.ts):
 *   chords: PolySynth per sound -> its trim -> low-pass filter (brightness) -> volume
 *   bass:   PolySynth of MonoSynths per sound -> its trim -> volume
 *   drums:  synthesized kit -> volume
 * A song's sections can use different sounds, so there's one synth per sound in use (a
 * "voice"), and each note goes to the synth of its own section: nothing is swapped or thrown
 * away mid-song, so tails ring out and nothing gets stuck.
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

type Part = 'chords' | 'bass'
/** A synth for one sound, through its own level trim (Instrument.trimDb). */
type Voice = { synth: Poly; trim: Tone.Volume }
/** The main graph's synths, by part and sound id. */
const voices: Record<Part, Map<string, Voice>> = { chords: new Map(), bass: new Map() }

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

/** The limiter's worklet module, as a Blob URL (made once). */
let limiterUrl: string | null = null
/** Whether the limiter's worklet module loaded, per audio context (the main one, each export's offline one). */
const limiterLoads = new WeakMap<object, Promise<boolean>>()
/** Contexts the module is loaded on: their graphs get the limiter right away. */
const limiterReady = new WeakSet<object>()

/**
 * Load the limiter's AudioWorklet module on a context, once. Not Tone's addAudioWorkletModule:
 * it keeps only one module per context. If it can't load (no AudioWorklet), audio plays unlimited.
 */
function loadLimiter(ctx: Tone.BaseContext): Promise<boolean> {
  const raw = ctx.rawContext
  let load = limiterLoads.get(raw)
  if (!load) {
    limiterUrl ??= URL.createObjectURL(new Blob([limiterWorkletSource()], { type: 'text/javascript' }))
    load = Promise.resolve(raw.audioWorklet?.addModule(limiterUrl)).then(
      () => {
        if (!raw.audioWorklet) return false
        limiterReady.add(raw)
        return true
      },
      (error: unknown) => {
        console.warn('The limiter could not load; audio plays without it.', error)
        return false
      },
    )
    limiterLoads.set(raw, load)
  }
  return load
}

/**
 * The master limiter (limiter.ts) in front of `out`: connect into `input`. Until its module has
 * loaded on this context (a moment after the first graph is made, long before anyone can press
 * Play) audio passes straight through, then the limiter is put in.
 */
function makeLimiter(out: Tone.Gain) {
  const ctx = Tone.getContext()
  const input = new Tone.Gain(1)
  let node: AudioWorkletNode | null = null
  let disposed = false
  const insert = () => {
    if (disposed) return
    node = ctx.createAudioWorkletNode('limiter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
    })
    input.disconnect()
    Tone.connect(input, node)
    Tone.connect(node, out)
  }
  if (limiterReady.has(ctx.rawContext)) insert()
  else {
    input.connect(out)
    void loadLimiter(ctx).then((loaded) => loaded && insert())
  }
  return {
    input,
    dispose() {
      disposed = true
      input.dispose()
      node?.disconnect()
      node?.port.postMessage('stop')
    },
  }
}

/** The three parts' chains into the limiter and a master gain (synths are added separately). */
function makeGraph(brightness: number): Graph {
  const out = new Tone.Gain(1).toDestination()
  const limiter = makeLimiter(out)
  const chordVolume = new Tone.Volume().connect(limiter.input)
  const bassVolume = new Tone.Volume().connect(limiter.input)
  const drumVolume = new Tone.Volume().connect(limiter.input)
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
    setPartLevels(graph, groove)
  }
  return graph
}

const soundOf = (part: Part, settings: GrooveSettings) => (part === 'chords' ? chordSound(settings.chords.sound) : bassSound(settings.bass.sound))

/** The main graph's synth for a part's sound in these settings, made the first time it's needed. */
function voiceFor(part: Part, settings: GrooveSettings): Voice {
  const g = getGraph()
  const inst = soundOf(part, settings)
  let v = voices[part].get(inst.id)
  if (!v) {
    const trim = new Tone.Volume(inst.trimDb).connect(part === 'chords' ? g.chordFilter : g.bassVolume)
    v = { synth: makePoly(inst, trim), trim }
    voices[part].set(inst.id, v)
  }
  return v
}

/** The synth for a part in these settings, if it exists (it may have been thrown away by silenceAll). */
const synthOf = (part: Part, settings: GrooveSettings) => voices[part].get(soundOf(part, settings).id)?.synth

/** The sounds still needed: the scheduled segments' and the edited section's (chord previews). */
const wantedSounds = (part: Part) => new Set([...segments, { groove }].map((s) => soundOf(part, s.groove).id))

/** How long an unused sound is kept, so a sound changed mid-note still rings out. */
const VOICE_KEEP_MS = 3000

/** Throw away synths of sounds nothing uses any more (after a moment, if still unused). */
function tidyVoices() {
  for (const part of ['chords', 'bass'] as const) {
    const wanted = wantedSounds(part)
    for (const [id, v] of voices[part]) {
      if (wanted.has(id)) continue
      window.setTimeout(() => {
        if (wantedSounds(part).has(id) || voices[part].get(id) !== v) return
        voices[part].delete(id)
        v.synth.dispose()
        v.trim.dispose()
      }, VOICE_KEEP_MS)
    }
  }
}

/** How long a level or brightness change at a section boundary takes (no clicks). */
const LEVEL_RAMP = 0.02

/**
 * The main graph's part volumes and brightness for these settings (instrument trims are on
 * each voice). Without `time`: now, with parts that are off muted (as for previews). With
 * `time` (a block starting in the song): ramped at that moment, and only for parts that play
 * in that block; the others are left alone so the notes before still ring out.
 */
function setPartLevels(g: Graph, settings: GrooveSettings, time?: number) {
  const parts = [
    [g.chordVolume, settings.chords, 0],
    [g.bassVolume, settings.bass, 0],
    [g.drumVolume, settings.drums, DRUM_TRIM_DB],
  ] as const
  for (const [node, part, trim] of parts) {
    const db = partDb(part.volume, trim)
    if (time === undefined) {
      setLevel(node, part.on, part.volume, trim)
    } else if (audible(part) && Number.isFinite(db)) {
      // Muted means nothing was sounding on it, so unmuting a moment early is silent.
      if (node.mute) node.mute = false
      node.volume.rampTo(db, LEVEL_RAMP, time)
    }
  }
  const hz = cutoffHz(settings.chords.brightness)
  if (time === undefined) g.chordFilter.frequency.rampTo(hz, 0.05)
  else g.chordFilter.frequency.rampTo(hz, LEVEL_RAMP, time)
}

const setLevel = (node: Tone.Volume, on: boolean, volume: number, trimDb = 0) => {
  const db = partDb(volume, trimDb)
  node.mute = !on || !Number.isFinite(db)
  if (Number.isFinite(db)) node.volume.value = db
}

/**
 * The edited section's instruments: what chord previews play with, and the levels while
 * nothing plays. While playing, the levels follow the section that's sounding (schedule()
 * re-runs on every change and applies them).
 */
export function setGroove(next: GrooveSettings) {
  groove = next
  if (!graph) return
  voiceFor('chords', groove)
  voiceFor('bass', groove)
  if (transport().state !== 'started') setPartLevels(graph, groove)
  tidyVoices()
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

/** Play one note; chord notes are scaled so every chord is equally loud whatever its size. */
function playNote(synth: Poly | undefined, e: Pick<NoteEvent, 'midi' | 'velocity' | 'group'>, time: number, seconds: number) {
  synth?.triggerAttackRelease(freq(e.midi), seconds, time, e.velocity * chordVelocity(e.group))
}

/**
 * The synths of a graph of its own (a session preview, an audio export): one per part and
 * sound, each through its own trim, made the first time it's asked for. Make them all before
 * playing: a synth made later is built in whatever audio context is current then.
 */
function ownSynths(g: Graph) {
  const synths: Poly[] = []
  const poly = new Map<string, Poly>()
  const polyFor = (part: Part, gr: GrooveSettings) => {
    const inst = soundOf(part, gr)
    const key = `${part}:${inst.id}`
    let p = poly.get(key)
    if (!p) {
      const trim = new Tone.Volume(inst.trimDb).connect(part === 'chords' ? g.chordFilter : g.bassVolume)
      g.nodes.push(trim)
      p = makePoly(inst, trim)
      synths.push(p)
      poly.set(key, p)
    }
    return p
  }
  return { synths, polyFor }
}

/** Browsers require audio to be started from a user gesture. */
export async function ensureAudio() {
  // iPhones mute Web Audio with the ring/silent switch unless the page says it's playing music
  // (Safari 16.4+), like any music app. Elsewhere the property doesn't exist and nothing changes.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session && session.type !== 'playback') session.type = 'playback'
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
  const notes = chordPartVoicing(chord, groove.bass.on)
  voiceFor('chords', groove).synth.triggerAttackRelease(notes.map(freq), seconds, undefined, chordVelocity(notes.length))
  if (groove.bass.on) voiceFor('bass', groove).synth.triggerAttackRelease(freq(bassNoteFor(chord)), seconds, undefined, 0.9)
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

/** How long a preview that plays a set number of passes lets its last notes ring before it stops. */
const PREVIEW_TAIL_SECONDS = 1.5

/**
 * A whole stored session, as its Play button would play it once. For a song, `segments` is
 * what plays (one per block, from songSegments) and `totalTicks` the song's length; `clips`
 * and `groove` are then unused.
 */
export type SessionMusic = {
  clips: Clip[]
  totalTicks: number
  sig: TimeSignature
  bpm: number
  groove: GrooveSettings
  segments?: Segment[]
}

/**
 * Hear another session exactly as its Play button plays it, looping over the whole track
 * (or song) until stopped: its tempo, time signature, patterns, swing, sounds, brightness,
 * mix and parts on/off, without the metronome. It plays on its own sound graph (so the open
 * session's sounds are untouched), with one synth per sound in use and the levels moving
 * at each block's start, as the main graph does for a song. Each pass's notes (from
 * renderSegments) are scheduled on the audio clock when the pass before starts, so loops
 * are seamless and there's always a pass queued ahead. Replaces any running preview; stopped
 * by stopPreview (■, another preview, silenceAll). `onChord` is called as each cue starts
 * (index: a chord of the section, in chordTimes order; for a song, a block), `onEnd` when
 * the preview is stopped. With `passes`, it stops by itself after that many times through
 * (once the last notes have rung out).
 */
export async function previewSession(
  music: SessionMusic,
  { onEnd, onChord, passes = Infinity }: { onEnd?: () => void; onChord?: (index: number) => void; passes?: number } = {},
) {
  stopPreview()
  previewEnded = onEnd ?? null
  const token = previewToken
  await ensureAudio()
  if (token !== previewToken) return // stopped (or replaced) while the audio was starting

  const { clips, totalTicks, sig, bpm, groove: settings } = music
  const segs: Segment[] = music.segments ?? [{ start: 0, length: totalTicks, clips, groove: settings }]
  const song = music.segments !== undefined
  const sec = (ticks: number) => (ticks / TICKS_PER_BEAT) * (60 / bpm)
  const g = makeGraph(segs[0].groove.chords.brightness)
  const { synths, polyFor } = ownSynths(g)
  for (const seg of segs) {
    polyFor('chords', seg.groove)
    polyFor('bass', seg.groove)
  }
  setPartLevels(g, segs[0].groove)
  previewRig = { graph: g, synths }

  const rendered = renderSegments(segs, sig)
  const byTick = <T extends { tick: number }>(events: T[]) => [...events].sort((a, b) => a.tick - b.tick)
  const chordEvents = byTick(rendered.chords)
  const bassEvents = byTick(rendered.bass)
  const drumEvents = byTick(rendered.drums)
  const cues = song ? segs.map((seg) => sec(seg.start)) : chordTimes(clips, bpm).map((c) => c.at)
  const loopSeconds = sec(totalTicks)
  const first = Tone.now() + 0.05
  /** Milliseconds until an audio-clock time, so timers follow the music without drifting. */
  const msUntil = (time: number) => Math.max(0, (time - Tone.immediate()) * 1000)

  const schedulePass = (n: number) => {
    if (previewRig?.graph !== g) return // stopped
    const start = first + n * loopSeconds
    if (n >= passes) {
      // Done: let the last notes ring a moment, then free the sound graph.
      previewTimers = [...previewTimers, window.setTimeout(() => stopPreview(), msUntil(start + PREVIEW_TAIL_SECONDS))]
      return
    }
    if (segs.length > 1) for (const seg of segs) setPartLevels(g, seg.groove, start + sec(seg.start))
    for (const e of chordEvents) playNote(polyFor('chords', segs[e.segment].groove), e, start + sec(e.tick), sec(e.duration))
    for (const e of bassEvents) playNote(polyFor('bass', segs[e.segment].groove), e, start + sec(e.tick), sec(e.duration))
    for (const e of drumEvents) g.kit.trigger(e.voice, start + sec(e.tick), e.velocity)
    // Added to the earlier passes' timers (some still pending), so stopPreview clears them all.
    previewTimers = [
      ...previewTimers,
      ...cues.map((at, i) => window.setTimeout(() => onChord?.(i), msUntil(start + at))),
      // Once this pass starts, queue the next one (a whole loop ahead).
      window.setTimeout(() => schedulePass(n + 1), msUntil(start)),
    ]
  }
  schedulePass(0)
}

/** Audio exports are CD quality: 44.1 kHz, stereo. */
export const RENDER_RATE = 44100
/** Seconds of audio rendered between progress reports (and chances to cancel). */
const RENDER_SLICE = 1
/** How far Tone's clock runs ahead of the render, so every note is set up before the render reaches it. */
const RENDER_LEAD = 0.1

/**
 * A finished export: the audio, where the song's last bar ends (seconds from the start of the
 * music; the rest is the ring-out) and how many frames at the start to skip (the limiter's
 * lookahead delays everything by that much).
 */
export type Rendered = { buffer: AudioBuffer; end: number; offset: number }

/**
 * Render what plays to audio, faster than real time, without touching what's playing: the
 * same notes (bouncePlan), sounds, levels and level moves at each block's start as playback,
 * on a graph of its own in an offline audio context, plus a tail so the last chord rings out.
 * No metronome; the limiter stays (its lookahead delay is reported as `offset`, for the file to skip).
 *
 * Why not Tone.Offline: it plays every note of the song into the synths before rendering a
 * single sample, so each synth carries the whole song's automation and rendering slows down
 * with the square of the length (a 3-minute song: ~75 s instead of ~11 s). Here the render is
 * paused every RENDER_SLICE seconds (OfflineAudioContext.suspend) and Tone's clock is moved
 * just past that point, so notes are set up a moment before they sound, as in live playback.
 * The pauses also report progress, and a cancelled render is simply never resumed.
 * This drives Tone's OfflineContext clock (`_currentTime` + "tick") the way its own render
 * loop does; e2e renders a WAV, so a Tone upgrade that changes it shows up there.
 */
export async function renderAudio(options: BounceOptions, { onProgress, signal }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<Rendered> {
  const plan = bouncePlan(options)
  const segs = options.segments
  const latency = limiterLatency(RENDER_RATE)
  const native = new OfflineAudioContext(2, Math.ceil(plan.seconds * RENDER_RATE) + latency, RENDER_RATE)
  const ctx = new Tone.OfflineContext(native)
  const limited = await loadLimiter(ctx)
  if (signal?.aborted) throw new DOMException('The render was cancelled.', 'AbortError')
  const original = Tone.getContext()
  // Everything is built in the offline context, synchronously (no await), so nothing else
  // ever sees it as the current context.
  Tone.setContext(ctx)
  try {
    const g = makeGraph(segs[0]?.groove.chords.brightness ?? DEFAULT_GROOVE.chords.brightness)
    const { polyFor } = ownSynths(g)
    for (const seg of segs) {
      polyFor('chords', seg.groove)
      polyFor('bass', seg.groove)
    }
    if (segs[0]) setPartLevels(g, segs[0].groove)
    // Notes and level moves wait on Tone's clock (PolySynth does that itself for its notes).
    for (const { segment, time } of plan.levels.slice(1)) ctx.setTimeout(() => setPartLevels(g, segs[segment].groove, time), time)
    for (const n of plan.chords) playNote(polyFor('chords', segs[n.segment].groove), n, n.time, n.seconds)
    for (const n of plan.bass) playNote(polyFor('bass', segs[n.segment].groove), n, n.time, n.seconds)
    for (const h of plan.drums) ctx.setTimeout(() => g.kit.trigger(h.voice, h.time, h.velocity), h.time)
  } finally {
    Tone.setContext(original)
  }

  const clock = ctx as unknown as { _currentTime: number }
  const step = 128 / RENDER_RATE
  /** Run Tone's clock to `time`, one render quantum at a time (as OfflineContext's own render loop does). */
  const advanceTo = (time: number) => {
    while (clock._currentTime <= time) {
      ctx.emit('tick')
      clock._currentTime += step
    }
  }

  return new Promise<Rendered>((resolve, reject) => {
    let cancelled = false
    const cancel = () => {
      cancelled = true
      reject(new DOMException('The render was cancelled.', 'AbortError'))
    }
    if (signal?.aborted) return cancel()
    signal?.addEventListener('abort', cancel, { once: true })
    onProgress?.(0)
    advanceTo(RENDER_SLICE + RENDER_LEAD)
    for (let at = RENDER_SLICE; at < plan.seconds - RENDER_LEAD; at += RENDER_SLICE) {
      native.suspend(at).then(() => {
        if (cancelled) return // never resumed: the render stops here and is thrown away
        onProgress?.(at / plan.seconds)
        advanceTo(at + RENDER_SLICE + RENDER_LEAD)
        native.resume()
      }, reject)
    }
    native.startRendering().then((buffer) => {
      signal?.removeEventListener('abort', cancel)
      if (cancelled) return
      onProgress?.(1)
      resolve({ buffer, end: plan.end, offset: limited ? latency : 0 })
    }, reject)
  })
}

export function setBpm(bpm: number) {
  transport().bpm.value = bpm
}

export type Schedule = {
  /** What plays: the edited section (one segment) or the song (one per block). */
  segments: Segment[]
  totalTicks: number
  /** For the metronome and patterns. */
  sig: TimeSignature
  loop: boolean
  /** Called when one-shot playback reaches the end of the last chord. */
  onEnd: () => void
}

/** The latest schedule()'s segments and notes: for the levels and the notes ringing at a point (soundAt). */
let segments: Segment[] = []
let notes: SegmentNotes = { chords: [], bass: [], drums: [] }

/**
 * (Re)schedule what plays: a section, or the whole song, each block with its own patterns
 * and sounds (renderSegments). Call whenever any of it changes, playing or not; replaces the
 * previous events. At each block start the part volumes and brightness move to that block's.
 */
export function schedule({ segments: segs, totalTicks, sig, loop, onEnd }: Schedule) {
  const t = transport()
  getGraph()
  t.cancel(0)
  segments = segs
  notes = renderSegments(segs, sig)
  const at = (tick: number) => `${toneTicks(tick)}i`
  // Make the synths now, so the first notes don't wait for one to be built.
  for (const seg of segs) {
    if (audible(seg.groove.chords)) voiceFor('chords', seg.groove)
    if (audible(seg.groove.bass)) voiceFor('bass', seg.groove)
  }
  tidyVoices()

  // Looked up when they play: silenceAll may have thrown the synths away meanwhile.
  for (const e of notes.chords) t.schedule((time) => playNote(synthOf('chords', segs[e.segment].groove), e, time, tickSeconds(e.duration)), at(e.tick))
  for (const e of notes.bass) t.schedule((time) => playNote(synthOf('bass', segs[e.segment].groove), e, time, tickSeconds(e.duration)), at(e.tick))
  for (const e of notes.drums) t.schedule((time) => graph?.kit.trigger(e.voice, time, e.velocity), at(e.tick))
  for (const seg of segs) {
    t.schedule((time) => {
      if (graph) setPartLevels(graph, seg.groove, time)
    }, at(seg.start))
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

  // Edits while playing: the section under the playhead sets the levels right away.
  if (t.state === 'started') applyLevelsAt(playheadTicks())

  if (!loop) {
    const end = toneTicks(segs.length ? segmentsEnd(segs) : totalTicks)
    if (t.state === 'started' && t.ticks >= end) {
      onEnd()
      return
    }
    t.schedule((time) => {
      Tone.getDraw().schedule(onEnd, time)
    }, `${end}i`)
  }
}

/** The levels of the segment playing at `ticks`, now. */
function applyLevelsAt(ticks: number) {
  const i = segmentAt(segments, ticks)
  if (graph && i >= 0) setPartLevels(graph, segments[i].groove)
}

/** Starting mid-note (play or seek): that section's levels, then the chord and bass notes that would be ringing. */
function soundAt(ticks: number) {
  applyLevelsAt(ticks)
  const ringing = (e: NoteEvent) => e.tick < ticks && ticks < e.tick + e.duration
  const now = Tone.now() + 0.02
  const remaining = (e: NoteEvent) => tickSeconds(e.tick + e.duration - ticks)
  for (const e of notes.chords.filter(ringing)) playNote(synthOf('chords', segments[e.segment].groove), e, now, remaining(e))
  for (const e of notes.bass.filter(ringing)) playNote(synthOf('bass', segments[e.segment].groove), e, now, remaining(e))
}

const releaseAll = () => {
  for (const part of ['chords', 'bass'] as const) for (const v of voices[part].values()) v.synth.releaseAll()
}

/** Stopped or paused: back to the edited section's levels, which previews play with. */
const restoreLevels = () => {
  if (graph) setPartLevels(graph, groove)
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
  restoreLevels()
  return at
}

export function stopPlayback() {
  const t = transport()
  t.stop()
  t.position = 0
  releaseAll()
  restoreLevels()
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
  const old = { graph, voices: [...voices.chords.values(), ...voices.bass.values()] }
  graph = null
  voices.chords.clear()
  voices.bass.clear()
  segments = []
  notes = { chords: [], bass: [], drums: [] }
  if (!old.graph) return
  old.graph.out.gain.rampTo(0, 0.03)
  window.setTimeout(() => {
    for (const v of old.voices) {
      v.synth.dispose()
      v.trim.dispose()
    }
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
