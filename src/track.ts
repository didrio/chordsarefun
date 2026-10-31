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
    typeof c.symbol === 'string' &&
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
