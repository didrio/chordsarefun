import { isChord } from './music/chord'
import { parseChord } from './music/parse'
import { MODES, type ModeName } from './music/theory'
import { MAX_SIG_BEATS, NOTE_UNITS, type Clip, type TimeSignature } from './music/timeline'

/** The undoable, persisted document: one chord progression. */
export type Track = {
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
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const isClip = (v: unknown): v is Clip => {
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
    isTimeSignature(t.sig)
  )
}

/**
 * Bring stored tracks from older versions up to date before validating them, so saved
 * work survives shape changes. Clips used to store a chord name (`symbol: "Dm7"`);
 * now they store a chord description. Unreadable old chords are dropped.
 */
export function migrateTrack(v: unknown): unknown {
  const t = v as { clips?: unknown }
  if (typeof t !== 'object' || t === null || !Array.isArray(t.clips)) return v
  const clips = t.clips.flatMap((c: unknown) => {
    const old = c as { symbol?: unknown; chord?: unknown }
    if (typeof old !== 'object' || old === null || old.chord !== undefined || typeof old.symbol !== 'string') return [c]
    const chord = parseChord(old.symbol)
    if (!chord) return []
    const { symbol: _symbol, ...rest } = old
    return [{ ...rest, chord }]
  })
  return { ...t, clips }
}
