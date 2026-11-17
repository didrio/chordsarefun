import { isChord } from './music/chord'
import { DEFAULT_GROOVE, isGrooveSettings, sameGroove, type GrooveSettings } from './music/grooves'
import { parseChord } from './music/parse'
import { MODES, type ModeName } from './music/theory'
import { MAX_SIG_BEATS, NOTE_UNITS, type Clip, type TimeSignature } from './music/timeline'

export const DEFAULT_BPM = 120
export const MIN_BPM = 30
export const MAX_BPM = 300

/** How the track sounds: the instruments (groove) and the tempo. Part of the track so undo covers them. */
export type TrackMusic = { groove: GrooveSettings; bpm: number }

export const DEFAULT_MUSIC: TrackMusic = { groove: DEFAULT_GROOVE, bpm: DEFAULT_BPM }

/** The undoable, persisted document: one chord progression and how it's played. */
export type Track = TrackMusic & {
  clips: Clip[]
  bars: number
  tonic: string
  mode: ModeName
  sig: TimeSignature
}

export const DEFAULT_TRACK: Track = {
  clips: [],
  bars: 4,
  tonic: 'C',
  mode: 'ionian',
  sig: { beats: 4, unit: 4 },
  ...DEFAULT_MUSIC,
}

export const isBpm = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= MIN_BPM && v <= MAX_BPM

/**
 * The track with new instruments and/or tempo, or the same track object when nothing
 * actually changed, so history adds no step for a no-op edit (it compares by reference).
 */
export function withMusic(t: Track, music: Partial<TrackMusic>): Track {
  const groove = music.groove && !sameGroove(music.groove, t.groove) ? music.groove : t.groove
  const bpm = music.bpm ?? t.bpm
  return groove === t.groove && bpm === t.bpm ? t : { ...t, groove, bpm }
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const isClip = (v: unknown): v is Clip => {
  const c = v as Clip
  return (
    typeof c === 'object' &&
    c !== null &&
    typeof c.id === 'string' &&
    (c.chord === null || isChord(c.chord)) &&
    isNumber(c.start) &&
    isNumber(c.length)
  )
}

export const isTimeSignature = (v: unknown): v is TimeSignature => {
  const s = v as TimeSignature
  return (
    typeof s === 'object' &&
    s !== null &&
    Number.isInteger(s.beats) &&
    s.beats >= 1 &&
    s.beats <= MAX_SIG_BEATS &&
    NOTE_UNITS.includes(s.unit)
  )
}

/** Guards data loaded from storage. */
export const isTrack = (v: unknown): v is Track => {
  const t = v as Track
  return (
    typeof t === 'object' &&
    t !== null &&
    Array.isArray(t.clips) &&
    t.clips.every(isClip) &&
    isNumber(t.bars) &&
    typeof t.tonic === 'string' &&
    (MODES as readonly string[]).includes(t.mode) &&
    isTimeSignature(t.sig) &&
    isGrooveSettings(t.groove) &&
    isBpm(t.bpm)
  )
}

/**
 * Bring stored tracks from older versions up to date before validating them, so saved
 * work survives shape changes:
 * - Clips used to store a chord name (`symbol: "Dm7"`); now they store a chord
 *   description. Unreadable old chords are dropped.
 * - The groove and tempo used to be saved beside the track (a session's `groove2` and
 *   `bpm`), outside undo. Entries without them get `legacy`: the session's saved values
 *   (see `legacyMusic` in session.ts), so undo never changes how old work sounds. Kept pure:
 *   the caller reads storage.
 */
export function migrateTrack(v: unknown, legacy: TrackMusic = DEFAULT_MUSIC): unknown {
  const t = v as { clips?: unknown; groove?: unknown; bpm?: unknown }
  if (typeof t !== 'object' || t === null || !Array.isArray(t.clips)) return v
  const clips = t.clips.flatMap((c: unknown) => {
    const old = c as { symbol?: unknown; chord?: unknown }
    if (typeof old !== 'object' || old === null || old.chord !== undefined || typeof old.symbol !== 'string') return [c]
    const chord = parseChord(old.symbol)
    if (!chord) return []
    const { symbol: _symbol, ...rest } = old
    return [{ ...rest, chord }]
  })
  return { ...t, clips, groove: t.groove ?? legacy.groove, bpm: t.bpm ?? legacy.bpm }
}
