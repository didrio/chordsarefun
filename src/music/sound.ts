/**
 * Instruments for the chord and bass parts, as synth presets (no samples to download).
 * Pure data; audio.ts builds the Tone.js synths from it.
 */

/** Which Tone.js voice an instrument uses: basic synth, FM synth (keys, bells), or mono synth with a filter (bass). */
export type VoiceKind = 'synth' | 'fm' | 'mono'

export type Instrument = {
  id: string
  label: string
  description: string
  kind: VoiceKind
  /** Tone.js voice options. */
  options: Record<string, unknown>
  /** Level trim, so switching instruments doesn't jump in volume (measured; see AGENTS.md). */
  trimDb: number
  /** Best brightness (0–1) for this sound; picking the sound resets brightness to it. Chords only. */
  brightness?: number
}

const env = (attack: number, decay: number, sustain: number, release: number) => ({ attack, decay, sustain, release })

/** Chord instruments. The four plain waves keep the ids of the old Sound menu's waves. */
export const CHORD_SOUNDS: Instrument[] = [
  {
    id: 'piano',
    label: 'Piano (synth)',
    description: 'Percussive and fading, like a piano. An approximation, not a real piano.',
    kind: 'fm',
    options: {
      harmonicity: 2,
      modulationIndex: 1.4,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: env(0.002, 1.6, 0.08, 1),
      modulationEnvelope: env(0.002, 0.5, 0.05, 0.6),
    },
    trimDb: 12.5,
    brightness: 0.9,
  },
  {
    id: 'epiano',
    label: 'Electric piano',
    description: 'Warm and bell-like, in the style of a Rhodes: soul, R&B, lo-fi, jazz.',
    kind: 'fm',
    options: {
      harmonicity: 1,
      modulationIndex: 2.5,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: env(0.003, 2.2, 0.3, 1.2),
      modulationEnvelope: env(0.002, 0.35, 0.1, 0.5),
    },
    trimDb: 9,
    brightness: 0.8,
  },
  {
    id: 'organ',
    label: 'Organ',
    description: 'Steady and full; it never fades. Gospel, reggae, house.',
    kind: 'synth',
    options: { oscillator: { type: 'custom', partials: [1, 0.6, 0.4, 0, 0.25, 0, 0, 0.15] }, envelope: env(0.01, 0.1, 1, 0.08) },
    trimDb: -7,
    brightness: 0.7,
  },
  {
    id: 'triangle',
    label: 'Soft synth',
    description: 'Soft and round, like a mellow organ or flute (triangle wave).',
    kind: 'synth',
    options: { oscillator: { type: 'triangle' }, envelope: env(0.02, 0.3, 0.5, 1) },
    trimDb: 0,
    brightness: 0.85,
  },
  {
    id: 'pad',
    label: 'Warm pad',
    description: 'Slow, wide and lush: swells in and lingers. Ambient, trap, film.',
    kind: 'synth',
    options: { oscillator: { type: 'fatsawtooth', count: 3, spread: 25 }, envelope: env(0.45, 0.5, 0.8, 1.8) },
    trimDb: 1,
    brightness: 0.55,
  },
  {
    id: 'pluck',
    label: 'Pluck',
    description: 'Short and plucked, like a harp, nylon guitar or marimba.',
    kind: 'synth',
    options: { oscillator: { type: 'triangle' }, envelope: env(0.002, 0.45, 0, 0.35) },
    trimDb: 6,
    brightness: 0.8,
  },
  {
    id: 'bell',
    label: 'Bells',
    description: 'Glassy, ringing bells and mallets.',
    kind: 'fm',
    options: {
      harmonicity: 3.5,
      modulationIndex: 6,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: env(0.001, 2.5, 0, 2),
      modulationEnvelope: env(0.001, 1.2, 0, 1),
    },
    trimDb: 10.5,
    brightness: 0.95,
  },
  {
    id: 'sine',
    label: 'Pure sine',
    description: 'Pure and gentle; very clear, but thin.',
    kind: 'synth',
    options: { oscillator: { type: 'sine' }, envelope: env(0.02, 0.3, 0.5, 1) },
    trimDb: -1.5,
    brightness: 1,
  },
  {
    id: 'square',
    label: 'Retro square',
    description: 'Hollow and retro, like a clarinet or old game console.',
    kind: 'synth',
    options: { oscillator: { type: 'square' }, envelope: env(0.02, 0.3, 0.5, 1) },
    trimDb: -4.5,
    brightness: 0.6,
  },
  {
    id: 'sawtooth',
    label: 'Bright saw',
    description: 'Bright and buzzy: classic synth leads and strings.',
    kind: 'synth',
    options: { oscillator: { type: 'sawtooth' }, envelope: env(0.02, 0.3, 0.5, 1) },
    trimDb: 0,
    brightness: 0.6,
  },
  {
    id: 'strings',
    label: 'Synth strings',
    description: 'Lush, slow-swelling string section: film, ballads, disco.',
    kind: 'synth',
    options: { oscillator: { type: 'fatsawtooth', count: 4, spread: 20 }, envelope: env(0.25, 0.3, 0.85, 1.2) },
    trimDb: 0.5,
    brightness: 0.6,
  },
  {
    id: 'supersaw',
    label: 'Supersaw',
    description: 'Huge, bright detuned saws: trance, EDM, future bass.',
    kind: 'synth',
    options: { oscillator: { type: 'fatsawtooth', count: 5, spread: 45 }, envelope: env(0.01, 0.2, 0.8, 0.6) },
    trimDb: 0.5,
    brightness: 0.7,
  },
  {
    id: 'clav',
    label: 'Clav',
    description: 'Funky, percussive and twangy, like a clavinet.',
    kind: 'synth',
    options: { oscillator: { type: 'pulse', width: 0.25 }, envelope: env(0.001, 0.25, 0.15, 0.1) },
    trimDb: 2,
    brightness: 0.75,
  },
  {
    id: 'mallets',
    label: 'Mallets',
    description: 'Warm wooden mallets, like a marimba or vibraphone.',
    kind: 'fm',
    options: {
      harmonicity: 4,
      modulationIndex: 2,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: env(0.001, 1, 0, 0.8),
      modulationEnvelope: env(0.001, 0.2, 0, 0.3),
    },
    trimDb: 12.5,
    brightness: 0.9,
  },
  {
    id: 'harpsichord',
    label: 'Harpsichord',
    description: 'Bright, plucked and Baroque.',
    kind: 'synth',
    options: { oscillator: { type: 'sawtooth' }, envelope: env(0.001, 0.6, 0, 0.3) },
    trimDb: 5.5,
    brightness: 0.7,
  },
]

const filterEnv = (baseFrequency: number, octaves: number, decay: number, sustain: number) => ({
  attack: 0.002,
  decay,
  sustain,
  release: 0.2,
  baseFrequency,
  octaves,
})

/** Bass instruments (monophonic, with a filter that opens on each note). */
export const BASS_SOUNDS: Instrument[] = [
  {
    id: 'round',
    label: 'Round bass',
    description: 'Warm and round; sits under anything.',
    kind: 'mono',
    options: { oscillator: { type: 'triangle' }, envelope: env(0.005, 0.3, 0.8, 0.15), filterEnvelope: filterEnv(300, 2.5, 0.25, 0.6) },
    trimDb: -1.5,
  },
  {
    id: 'sub',
    label: 'Sub (808-style)',
    description: 'Deep, clean low end: hip-hop, trap, lo-fi. Best on headphones or speakers with bass.',
    kind: 'mono',
    options: { oscillator: { type: 'sine' }, envelope: env(0.005, 0.9, 0.6, 0.3), filterEnvelope: filterEnv(2000, 1, 0.3, 1) },
    trimDb: -1.5,
  },
  {
    id: 'synth',
    label: 'Synth bass',
    description: 'Punchy and buzzy: rock, house, synthwave.',
    kind: 'mono',
    options: { oscillator: { type: 'sawtooth' }, envelope: env(0.003, 0.3, 0.7, 0.1), filterEnvelope: filterEnv(120, 3.5, 0.25, 0.3) },
    trimDb: 0.5,
  },
  {
    id: 'pluck',
    label: 'Pluck bass',
    description: 'Short and funky.',
    kind: 'mono',
    options: { oscillator: { type: 'square' }, envelope: env(0.002, 0.25, 0.1, 0.1), filterEnvelope: filterEnv(150, 3, 0.15, 0.1) },
    trimDb: 7.5,
  },
  {
    id: 'electric',
    label: 'Electric bass (synth)',
    description: 'Finger-style electric bass, approximated: soul, jazz, pop.',
    kind: 'mono',
    options: { oscillator: { type: 'sawtooth' }, envelope: env(0.004, 0.6, 0.4, 0.15), filterEnvelope: filterEnv(200, 1.6, 0.4, 0.3) },
    trimDb: 4,
  },
  {
    id: 'upright',
    label: 'Upright bass',
    description: 'Woody and round, plucked: jazz, folk, blues.',
    kind: 'mono',
    options: { oscillator: { type: 'triangle' }, envelope: env(0.01, 0.5, 0.3, 0.2), filterEnvelope: filterEnv(250, 1.5, 0.3, 0.4) },
    trimDb: 4.5,
  },
  {
    id: 'reese',
    label: 'Reese bass',
    description: 'Dark, growling detuned bass: drum & bass, dubstep.',
    kind: 'mono',
    options: {
      oscillator: { type: 'fatsawtooth', count: 2, spread: 25 },
      envelope: env(0.01, 0.4, 0.8, 0.2),
      filterEnvelope: filterEnv(150, 1.5, 0.5, 0.7),
    },
    trimDb: 4,
  },
  {
    id: 'acid',
    label: 'Acid bass',
    description: 'Squelchy, resonant and hypnotic (303-style): acid house, techno.',
    kind: 'mono',
    options: {
      oscillator: { type: 'sawtooth' },
      filter: { Q: 8, type: 'lowpass', rolloff: -24 },
      envelope: env(0.003, 0.25, 0.6, 0.1),
      filterEnvelope: filterEnv(180, 3.5, 0.18, 0.15),
    },
    trimDb: -6,
  },
]

/** Level trim for the whole drum kit (measured, like the instrument trims: a pop beat matches a held chord). */
export const DRUM_TRIM_DB = 6.5

export const chordSound = (id: string) => CHORD_SOUNDS.find((s) => s.id === id) ?? CHORD_SOUNDS[0]
export const bassSound = (id: string) => BASS_SOUNDS.find((s) => s.id === id) ?? BASS_SOUNDS[0]

/** Low-pass cutoff for a brightness (0–1): 200 Hz to ~16 kHz on a log scale, so the slider feels even. */
export const cutoffHz = (brightness: number) => 200 * 2 ** (Math.min(Math.max(brightness, 0), 1) * 6.3)

/** Part level in dB for a 0–1 volume slider (0 = muted). */
export function partDb(volume: number, trimDb = 0): number {
  if (volume <= 0) return -Infinity
  return -4 + 20 * Math.log10(volume) + trimDb
}
