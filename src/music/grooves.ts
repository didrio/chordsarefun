import { BASS_PATTERNS, CHORD_PATTERNS, DRUM_PATTERNS, type Arrangement } from './patterns'
import type { Genre } from './progressions'
import { CHORD_SOUNDS, chordSound } from './sound'

/**
 * How the track is played: three parts (chords, bass, drums), each with on/off, volume,
 * sound and pattern, plus swing. A groove preset sets everything but the volumes (and
 * chord brightness) in one go; any part can then be changed on its own.
 */
export type GrooveSettings = {
  chords: { on: boolean; volume: number; sound: string; pattern: string; brightness: number }
  bass: { on: boolean; volume: number; sound: string; pattern: string }
  drums: { on: boolean; volume: number; pattern: string }
  /** 0 = straight 8ths, 1 = full triplet swing. */
  swing: number
}

export type GroovePreset = {
  id: string
  name: string
  /** The progression genre it suits (metadata for smarter randomizing later). */
  genre: Genre
  /** A natural tempo range for it, in BPM (metadata, see randomBpm). */
  bpm: [number, number]
  chords: { sound: string; pattern: string }
  bass: { on: boolean; sound: string; pattern: string }
  drums: { on: boolean; pattern: string }
  swing: number
  /** Part volumes [chords, bass, drums], set from offline loudness measurements (see AGENTS.md). */
  mix: [number, number, number]
  /** Chord brightness, when the preset wants other than the sound's own default. */
  brightness?: number
}

type PresetOptions = { swing?: number; brightness?: number; mix: [number, number, number] }

const g = (
  id: string,
  name: string,
  genre: Genre,
  bpm: [number, number],
  chords: [sound: string, pattern: string],
  bass: [sound: string, pattern: string] | null,
  drums: string | null,
  opts: PresetOptions,
): GroovePreset => ({
  id,
  name,
  genre,
  bpm,
  chords: { sound: chords[0], pattern: chords[1] },
  bass: bass ? { on: true, sound: bass[0], pattern: bass[1] } : { on: false, sound: 'round', pattern: 'root' },
  drums: drums ? { on: true, pattern: drums } : { on: false, pattern: 'pop' },
  swing: opts.swing ?? 0,
  mix: opts.mix,
  brightness: opts.brightness,
})

/**
 * Presets, most common first. "Just chords" (plain held chords) stays at the top for
 * hearing the harmony on its own; "Pop" is the default.
 */
export const GROOVES: GroovePreset[] = [
  g('just', 'Just chords', 'Pop', [80, 120], ['triangle', 'block'], null, null, { mix: [0.6, 0.65, 0.65] }),
  g('pop', 'Pop', 'Pop', [95, 124], ['piano', 'pushes'], ['round', 'syncopated'], 'pop', { mix: [0.5, 0.55, 0.55] }),
  g('ballad', 'Piano ballad', 'Pop', [60, 80], ['piano', 'ballad'], ['round', 'root'], 'halftime', { mix: [0.45, 0.5, 0.6] }),
  g('acoustic', 'Acoustic pop', 'Folk & Country', [90, 115], ['pluck', 'strum'], ['round', 'root'], 'halftime', { mix: [0.7, 0.5, 0.6] }),
  g('synthpop', 'Synth-pop', 'Pop', [105, 125], ['square', 'pulse8'], ['synth', 'eighths'], 'pop', { mix: [0.7, 0.65, 0.55] }),
  g('indie', 'Indie', 'Pop', [100, 125], ['pluck', 'arpUp'], ['round', 'quarters'], 'pop', { mix: [0.55, 0.55, 0.55] }),
  g('dreampop', 'Dream pop', 'Pop', [70, 95], ['strings', 'bar'], ['round', 'root'], 'halftime', { brightness: 0.5, mix: [0.65, 0.5, 0.6] }),
  g('citypop', 'City pop', 'Pop', [100, 120], ['epiano', 'pushes'], ['electric', 'octaves'], 'pop', { mix: [0.6, 0.5, 0.55] }),
  g('afropop', 'Afro-pop', 'Pop', [100, 115], ['pluck', 'tresillo'], ['round', 'syncopated'], 'afrobeat', { swing: 0.2, mix: [0.6, 0.55, 0.5] }),
  g('reggaeton', 'Reggaeton', 'Pop', [88, 100], ['pluck', 'tresillo'], ['sub', 'tresillo'], 'dembow', { mix: [0.6, 0.55, 0.55] }),
  g('rock', 'Rock', 'Rock', [110, 140], ['sawtooth', 'pulse8'], ['synth', 'eighths'], 'rock', { mix: [0.7, 0.65, 0.55] }),
  g('poppunk', 'Pop punk', 'Rock', [150, 180], ['sawtooth', 'pulse8'], ['pluck', 'eighths'], 'punk', { mix: [0.7, 0.35, 0.5] }),
  g('punk', 'Punk', 'Rock', [170, 200], ['square', 'pulse8'], ['synth', 'eighths'], 'punk', { mix: [0.7, 0.65, 0.5] }),
  g('grunge', 'Grunge', 'Rock', [90, 120], ['sawtooth', 'beats'], ['synth', 'root'], 'halftime', { brightness: 0.45, mix: [0.65, 0.5, 0.6] }),
  g('metal', 'Metal', 'Rock', [100, 140], ['sawtooth', 'sixteenths'], ['synth', 'gallop'], 'rock', { brightness: 0.5, mix: [0.7, 0.65, 0.55] }),
  g('southern', 'Southern rock', 'Rock', [90, 115], ['organ', 'beats'], ['round', 'rootFifth'], 'rock', { swing: 0.25, mix: [0.7, 0.5, 0.55] }),
  g('lofi', 'Lo-fi hip-hop', 'Electronic & Hip-hop', [70, 90], ['epiano', 'bar'], ['sub', 'hiphop'], 'boombap', { swing: 0.55, mix: [0.6, 0.55, 0.65] }),
  g('boombap', 'Boom-bap', 'Electronic & Hip-hop', [85, 95], ['piano', 'bar'], ['sub', 'hiphop'], 'boombap', { swing: 0.4, mix: [0.65, 0.55, 0.65] }),
  g('trap', 'Trap', 'Electronic & Hip-hop', [130, 150], ['pad', 'bar'], ['sub', 'root'], 'trap', { mix: [0.6, 0.5, 0.55] }),
  g('drill', 'Drill', 'Electronic & Hip-hop', [138, 145], ['bell', 'bar'], ['sub', 'hiphop'], 'trap', { mix: [0.6, 0.55, 0.55] }),
  g('house', 'House', 'Electronic & Hip-hop', [120, 128], ['organ', 'offbeat'], ['synth', 'octaves'], 'four', { mix: [1, 0.65, 0.5] }),
  g('deephouse', 'Deep house', 'Electronic & Hip-hop', [118, 124], ['epiano', 'pushes'], ['sub', 'syncopated'], 'four', { swing: 0.2, mix: [0.6, 0.5, 0.5] }),
  g('acid', 'Acid house', 'Electronic & Hip-hop', [120, 130], ['organ', 'bar'], ['acid', 'octaves'], 'four', { mix: [0.6, 0.7, 0.45] }),
  g('techno', 'Minimal techno', 'Electronic & Hip-hop', [124, 132], ['mallets', 'offbeat'], ['sub', 'offbeat'], 'four', { mix: [0.8, 0.8, 0.5] }),
  g('trance', 'Trance', 'Electronic & Hip-hop', [134, 140], ['supersaw', 'sixteenths'], ['synth', 'offbeat'], 'four', { brightness: 0.65, mix: [0.85, 0.9, 0.5] }),
  g('edm', 'EDM anthem', 'Electronic & Hip-hop', [124, 130], ['supersaw', 'pulse8'], ['synth', 'octaves'], 'four', { mix: [0.7, 0.65, 0.5] }),
  g('futurebass', 'Future bass', 'Electronic & Hip-hop', [140, 160], ['supersaw', 'pushes'], ['sub', 'root'], 'trap', { mix: [0.7, 0.5, 0.55] }),
  g('garage', 'UK garage', 'Electronic & Hip-hop', [130, 135], ['organ', 'pushes'], ['sub', 'syncopated'], 'garage', { swing: 0.35, mix: [0.7, 0.5, 0.6] }),
  g('dnb', 'Drum & bass', 'Electronic & Hip-hop', [165, 178], ['pad', 'bar'], ['reese', 'root'], 'dnb', { mix: [0.6, 0.5, 0.6] }),
  g('bigbeat', 'Big beat', 'Electronic & Hip-hop', [100, 130], ['strings', 'bar'], ['synth', 'syncopated'], 'breakbeat', { mix: [0.65, 0.55, 0.55] }),
  g('synthwave', 'Synthwave', 'Electronic & Hip-hop', [85, 110], ['sawtooth', 'arp16'], ['synth', 'eighths'], 'pop', { mix: [0.7, 0.65, 0.55] }),
  g('chiptune', 'Chiptune', 'Electronic & Hip-hop', [120, 150], ['square', 'arp16'], ['pluck', 'octaves'], 'pop', { mix: [0.7, 0.3, 0.55] }),
  g('chill', 'Chillwave', 'Electronic & Hip-hop', [75, 95], ['pad', 'block'], ['sub', 'root'], 'halftime', { mix: [0.6, 0.5, 0.6] }),
  g('vaporwave', 'Vaporwave', 'Electronic & Hip-hop', [70, 90], ['epiano', 'block'], ['round', 'root'], 'halftime', { swing: 0.2, brightness: 0.5, mix: [0.6, 0.5, 0.6] }),
  g('rnb', 'R&B', 'Soul & R&B', [70, 95], ['epiano', 'pushes'], ['electric', 'syncopated'], 'boombap', { swing: 0.35, mix: [0.6, 0.5, 0.65] }),
  g('neosoul', 'Neo-soul', 'Soul & R&B', [75, 95], ['epiano', 'bar'], ['upright', 'syncopated'], 'boombap', { swing: 0.6, mix: [0.6, 0.5, 0.65] }),
  g('funk', 'Funk', 'Soul & R&B', [95, 115], ['epiano', 'funk'], ['pluck', 'funk'], 'funk', { swing: 0.15, mix: [0.6, 0.4, 0.55] }),
  g('clavfunk', 'Clav funk', 'Soul & R&B', [95, 110], ['clav', 'funk'], ['electric', 'funk'], 'funk', { swing: 0.2, mix: [0.55, 0.55, 0.55] }),
  g('disco', 'Disco', 'Soul & R&B', [112, 124], ['strings', 'bar'], ['synth', 'octaves'], 'four', { mix: [0.65, 0.65, 0.5] }),
  g('motown', 'Motown soul', 'Soul & R&B', [100, 125], ['piano', 'beats'], ['electric', 'syncopated'], 'motown', { swing: 0.1, mix: [0.5, 0.5, 0.55] }),
  g('gospel', 'Gospel', 'Soul & R&B', [65, 85], ['organ', 'beats'], ['round', 'quarters'], 'halftime', { swing: 0.5, mix: [0.7, 0.55, 0.6] }),
  g('gospelfast', 'Uptempo gospel', 'Soul & R&B', [110, 130], ['organ', 'backbeat'], ['round', 'walking'], 'motown', { swing: 0.3, mix: [0.85, 0.5, 0.5] }),
  g('country', 'Country & folk', 'Folk & Country', [95, 125], ['pluck', 'strum'], ['round', 'rootFifth'], 'pop', { mix: [0.7, 0.5, 0.55] }),
  g('countrytrain', 'Country train', 'Folk & Country', [100, 130], ['pluck', 'beats'], ['round', 'rootFifth'], 'train', { mix: [0.65, 0.5, 0.5] }),
  g('indiefolk', 'Indie folk', 'Folk & Country', [80, 105], ['pluck', 'arpUpDown'], ['upright', 'root'], 'halftime', { mix: [0.55, 0.5, 0.6] }),
  g('jazz', 'Jazz swing', 'Jazz', [110, 170], ['epiano', 'charleston'], ['upright', 'walking'], 'swing', { swing: 0.6, mix: [0.65, 0.45, 1] }),
  g('jazzballad', 'Jazz ballad', 'Jazz', [55, 75], ['piano', 'ballad'], ['upright', 'root'], 'brushes', { swing: 0.5, mix: [0.45, 0.5, 0.9] }),
  g('lofijazz', 'Lo-fi jazz', 'Jazz', [70, 90], ['piano', 'charleston'], ['upright', 'walking'], 'brushes', { swing: 0.6, mix: [0.55, 0.45, 0.85] }),
  g('smoothjazz', 'Smooth jazz', 'Jazz', [85, 105], ['epiano', 'charleston'], ['electric', 'syncopated'], 'boombap', { swing: 0.3, mix: [0.65, 0.5, 0.65] }),
  g('bossa', 'Bossa nova', 'Jazz', [120, 140], ['pluck', 'bossa'], ['upright', 'rootFifth'], 'bossa', { mix: [0.65, 0.45, 0.55] }),
  g('blues', 'Blues shuffle', 'Blues', [80, 120], ['piano', 'beats'], ['round', 'walking'], 'rock', { swing: 0.7, mix: [0.5, 0.5, 0.55] }),
  g('slowblues', 'Slow blues', 'Blues', [55, 75], ['piano', 'ballad'], ['upright', 'walking'], 'halftime', { swing: 0.7, mix: [0.45, 0.45, 0.6] }),
  g('ska', 'Ska', 'Classical & World', [140, 170], ['organ', 'offbeat'], ['round', 'walking'], 'rock', { mix: [1, 0.5, 0.55] }),
  g('reggae', 'Reggae', 'Classical & World', [70, 90], ['organ', 'offbeat'], ['round', 'syncopated'], 'onedrop', { mix: [1, 0.55, 0.6] }),
  g('dancehall', 'Dancehall', 'Classical & World', [95, 110], ['mallets', 'tresillo'], ['sub', 'hiphop'], 'dembow', { mix: [0.55, 0.55, 0.55] }),
  g('ambient', 'Ambient', 'Cinematic', [60, 90], ['bell', 'arpUpDown'], ['sub', 'root'], null, { mix: [0.45, 0.5, 0.65] }),
  g('cinematic', 'Cinematic', 'Cinematic', [60, 90], ['strings', 'bar'], ['sub', 'root'], null, { mix: [0.65, 0.5, 0.65] }),
  g('epic', 'Epic trailer', 'Cinematic', [90, 120], ['strings', 'bar'], ['synth', 'eighths'], 'halftime', { mix: [0.65, 0.65, 0.6] }),
  g('musicbox', 'Music box', 'Cinematic', [70, 100], ['bell', 'arpUp'], null, null, { mix: [0.45, 0.65, 0.65] }),
  g('lullaby', 'Lullaby', 'Cinematic', [60, 80], ['mallets', 'arpUpDown'], null, null, { mix: [0.5, 0.65, 0.65] }),
  g('organ', 'Church organ', 'Classical & World', [60, 80], ['organ', 'block'], ['round', 'root'], null, { mix: [0.6, 0.5, 0.65] }),
  g('classical', 'Classical piano', 'Classical & World', [70, 110], ['piano', 'broken'], null, null, { mix: [0.4, 0.65, 0.65] }),
  g('baroque', 'Baroque', 'Classical & World', [80, 110], ['harpsichord', 'broken'], ['upright', 'quarters'], null, { mix: [0.5, 0.45, 0.65] }),
  g('waltz', 'Waltz (3/4)', 'Classical & World', [90, 160], ['piano', 'ballad'], ['round', 'root'], 'waltz', { mix: [0.45, 0.5, 0.65] }),
]

const label = (list: { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id

/** A preset in words: "Electric piano: jazz comping · walking bass · jazz swing drums". */
export function describeGroove(p: GroovePreset): string {
  const chords = `${label(CHORD_SOUNDS, p.chords.sound)}: ${label(CHORD_PATTERNS, p.chords.pattern).toLowerCase()}`
  if (!p.bass.on && !p.drums.on) return `${chords}, nothing else`
  const parts = [chords]
  if (p.bass.on) parts.push(`${label(BASS_PATTERNS, p.bass.pattern).toLowerCase()} bass`)
  parts.push(p.drums.on ? `${label(DRUM_PATTERNS, p.drums.pattern).toLowerCase()} drums` : 'no drums')
  return parts.join(' · ')
}

/**
 * Apply a preset: every part's sound, pattern, on/off and volume, plus swing and chord
 * brightness (the preset's, else the sound's best). Presets own the mix, like loading a
 * preset in a DAW; volume and brightness tweaks after that don't make it "Custom".
 */
export function applyGroove(s: GrooveSettings, p: GroovePreset): GrooveSettings {
  const [chordVolume, bassVolume, drumVolume] = p.mix
  return {
    chords: {
      ...s.chords,
      on: true,
      ...p.chords,
      volume: chordVolume,
      brightness: p.brightness ?? chordSound(p.chords.sound).brightness ?? s.chords.brightness,
    },
    bass: { ...s.bass, ...p.bass, volume: bassVolume },
    drums: { ...s.drums, ...p.drums, volume: drumVolume },
    swing: p.swing,
  }
}

/** The preset the settings currently match (ignoring volumes and brightness), if any. */
export function matchingGroove(s: GrooveSettings): GroovePreset | null {
  return (
    GROOVES.find(
      (p) =>
        s.chords.on &&
        s.chords.sound === p.chords.sound &&
        s.chords.pattern === p.chords.pattern &&
        s.bass.on === p.bass.on &&
        (!p.bass.on || (s.bass.sound === p.bass.sound && s.bass.pattern === p.bass.pattern)) &&
        s.drums.on === p.drums.on &&
        (!p.drums.on || s.drums.pattern === p.drums.pattern) &&
        Math.abs(s.swing - p.swing) < 0.01,
    ) ?? null
  )
}

export const DEFAULT_GROOVE: GrooveSettings = applyGroove(
  {
    chords: { on: true, volume: 0.75, sound: 'triangle', pattern: 'block', brightness: 0.85 },
    bass: { on: false, volume: 0.7, sound: 'round', pattern: 'root' },
    drums: { on: false, volume: 0.65, pattern: 'pop' },
    swing: 0,
  },
  GROOVES.find((p) => p.id === 'pop')!,
)

/** A random item, avoiding `not` (e.g. the current one) when there's a choice. */
export function pickRandom<T>(list: T[], not?: T | null, rand = Math.random): T {
  const pool = list.length > 1 && not != null ? list.filter((x) => x !== not) : list
  return pool[Math.floor(rand() * pool.length)]
}

/** A random tempo within a groove's natural range. */
export const randomBpm = ([min, max]: [number, number], rand = Math.random) => Math.round(min + rand() * (max - min))

/** The patterns part of the settings, for renderTrack. */
export const arrangementOf = (s: GrooveSettings): Arrangement => ({
  chordPattern: s.chords.pattern,
  bassPattern: s.bass.pattern,
  drumPattern: s.drums.pattern,
  swing: s.swing,
  bassOn: s.bass.on,
})

const unit = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1
const part = (v: unknown, keys: string[]) => {
  const o = v as Record<string, unknown>
  return (
    typeof o === 'object' &&
    o !== null &&
    typeof o.on === 'boolean' &&
    unit(o.volume) &&
    keys.every((k) => typeof o[k] === 'string')
  )
}

/** Guards settings loaded from storage. */
export function isGrooveSettings(v: unknown): v is GrooveSettings {
  const s = v as GrooveSettings
  return (
    typeof s === 'object' &&
    s !== null &&
    part(s.chords, ['sound', 'pattern']) &&
    unit(s.chords.brightness) &&
    part(s.bass, ['sound', 'pattern']) &&
    part(s.drums, ['pattern']) &&
    unit(s.swing)
  )
}
