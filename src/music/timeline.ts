import { sameChord, type Chord } from './chord'

/**
 * The workspace: one fixed-length track of non-overlapping chord clips.
 * All times are integer ticks. Every function here is pure: (clips, ...) => clips.
 * Clips treat their chord as an opaque value; chord rules live in chord.ts.
 */

/** Ticks per quarter note (MIDI-style PPQ). BPM is always quarter notes per minute. */
export const TICKS_PER_BEAT = 480
export const BEATS_PER_BAR = 4
/** A 4/4 bar; the default wherever a time signature isn't given. */
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR

export type TimeSignature = { beats: number; unit: number }

export const TIME_SIGNATURES: TimeSignature[] = [
  { beats: 4, unit: 4 },
  { beats: 3, unit: 4 },
  { beats: 2, unit: 4 },
  { beats: 5, unit: 4 },
  { beats: 6, unit: 8 },
  { beats: 7, unit: 8 },
  { beats: 9, unit: 8 },
  { beats: 12, unit: 8 },
]
export const NOTE_UNITS = [2, 4, 8, 16]
export const MAX_SIG_BEATS = 16

/** Ticks per beat of the time signature (a quarter in x/4, an eighth in x/8). */
export const sigBeatTicks = (sig: TimeSignature) => (TICKS_PER_BEAT * 4) / sig.unit
export const sigBarTicks = (sig: TimeSignature) => sig.beats * sigBeatTicks(sig)
export const sigLabel = (sig: TimeSignature) => `${sig.beats}/${sig.unit}`

/** Shortest a clip can be squeezed to (a 1/32 note). */
export const MIN_CLIP_TICKS = TICKS_PER_BEAT / 8
/** Positioning resolution when the grid is off (a 1/64 note). */
export const FREE_RESOLUTION = TICKS_PER_BEAT / 16
/**
 * A click-added chord only fills a gap at least this long: a quarter note, or a whole
 * bar in meters whose bars are shorter than that (e.g. 3/16).
 */
const minFillGap = (barTicks: number) => Math.min(TICKS_PER_BEAT, barTicks)

export const GRIDS = [
  { key: 'bar', label: '1 bar' },
  { key: '1/2', label: '1/2', ticks: TICKS_PER_BEAT * 2 },
  { key: '1/4', label: '1/4', ticks: TICKS_PER_BEAT },
  { key: '1/8', label: '1/8', ticks: TICKS_PER_BEAT / 2 },
  { key: '1/16', label: '1/16', ticks: TICKS_PER_BEAT / 4 },
  { key: 'off', label: 'Off', ticks: 0 },
] as const

export type GridKey = (typeof GRIDS)[number]['key']

/** Grid step in ticks for a grid setting (0 = off). "1 bar" depends on the time signature. */
export function gridStep(key: GridKey, barTicks: number): number {
  const grid = GRIDS.find((g) => g.key === key)
  if (!grid) return TICKS_PER_BEAT
  return 'ticks' in grid ? grid.ticks : barTicks
}

export const BAR_OPTIONS = [1, 2, 4, 8] as const

export type Clip = {
  id: string
  /** Null = an empty clip: a placeholder waiting for a chord (silent; suggestions offered). */
  chord: Chord | null
  start: number
  length: number
}

export const clipEnd = (c: Clip) => c.start + c.length

/** A clip that has a chord (not an empty placeholder). */
export type ChordClip = Clip & { chord: Chord }

/** Only the clips with a chord, e.g. for analysis and playback (empty clips are silent). */
export const chordClips = (clips: Clip[]): ChordClip[] => clips.filter((c): c is ChordClip => c.chord !== null)

const sortClips = (clips: Clip[]) => [...clips].sort((a, b) => a.start - b.start)

const newClip = (chord: Chord | null, start: number, length: number): Clip => ({
  id: crypto.randomUUID(),
  chord,
  start,
  length,
})

/**
 * Snap a tick position to the grid (or the free resolution when grid is 0). The grid
 * restarts at every bar line, so odd meters (e.g. 7/8 with a 1/4 grid) still snap to bars.
 */
export function snap(
  ticks: number,
  gridTicks: number,
  mode: 'round' | 'floor' = 'round',
  barTicks: number = TICKS_PER_BAR,
) {
  const step = gridTicks || FREE_RESOLUTION
  const barStart = Math.floor(ticks / barTicks) * barTicks
  const candidate = barStart + Math.min(Math[mode]((ticks - barStart) / step) * step, barTicks)
  // In odd meters the next bar line can be closer than the last grid line of this bar.
  const nextBar = barStart + barTicks
  if (mode === 'round' && nextBar - ticks < Math.abs(ticks - candidate)) return nextBar
  return candidate
}

/**
 * The next grid point strictly after (dir 1) or before (dir -1) `ticks`. Bar lines always
 * count as grid points, so stepping never skips one in odd meters.
 */
export function stepGrid(ticks: number, dir: -1 | 1, gridTicks: number, barTicks: number = TICKS_PER_BAR) {
  const step = gridTicks || FREE_RESOLUTION
  return dir > 0 ? snap(ticks + step, step, 'floor', barTicks) : snap(ticks - 1, step, 'floor', barTicks)
}

/**
 * Where one-shot (non-loop) playback ends: at the end of the last clip, or at the end
 * of the track when it's empty (so you can still play just the metronome).
 */
export function playbackEnd(clips: Clip[], total: number): number {
  return clips.length ? Math.max(...clips.map(clipEnd)) : total
}

export type ClickAccent = 'bar' | 'group' | 'beat'

/**
 * Metronome clicks for a track: one per beat of the time signature (quarters in x/4,
 * eighths in x/8, ...). The 1 of each bar is accented; compound meters (6/8, 9/8, 12/8,
 * and the x/16 equivalents) also get a lighter accent at the start of each group of 3,
 * which is how they're felt. Other meters (e.g. 7/8) have no standard grouping, so only
 * the downbeat is accented.
 */
export function metronomeClicks(totalTicks: number, sig: TimeSignature): { tick: number; accent: ClickAccent }[] {
  const beat = sigBeatTicks(sig)
  const compound = sig.unit >= 8 && sig.beats > 3 && sig.beats % 3 === 0
  const clicks: { tick: number; accent: ClickAccent }[] = []
  for (let i = 0; i * beat < totalTicks; i++) {
    const inBar = i % sig.beats
    const accent = inBar === 0 ? 'bar' : compound && inBar % 3 === 0 ? 'group' : 'beat'
    clicks.push({ tick: i * beat, accent })
  }
  return clicks
}

/**
 * Stretch/shrink every clip by `factor` (e.g. when the bar length changes with the time
 * signature), so "one chord per bar" stays one chord per bar.
 */
export function rescaleClips(clips: Clip[], factor: number): Clip[] {
  const at = (t: number) => Math.round((t * factor) / FREE_RESOLUTION) * FREE_RESOLUTION
  return clips
    .map((c) => ({ ...c, start: at(c.start), length: at(clipEnd(c)) - at(c.start) }))
    .filter((c) => c.length >= MIN_CLIP_TICKS)
}

export const seconds = (ticks: number, bpm: number) => (ticks / TICKS_PER_BEAT) * (60 / bpm)

const sameMaybeChord = (a: Chord | null, b: Chord | null) => (a && b ? sameChord(a, b) : a === b)

/** True if two tracks have the same clips (same ids, chords, positions). */
export function sameClips(a: Clip[], b: Clip[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  const sb = sortClips(b)
  return sortClips(a).every(
    (c, i) =>
      c.id === sb[i].id && sameMaybeChord(c.chord, sb[i].chord) && c.start === sb[i].start && c.length === sb[i].length,
  )
}

export function replaceChord(clips: Clip[], id: string, chord: Chord | null): Clip[] {
  return clips.map((c) => (c.id === id ? { ...c, chord } : c))
}

/** Apply `update` to the chords of clips `ids` (e.g. invert, or set to a new chord). */
export function updateChords(clips: Clip[], ids: string[], update: (chord: Chord) => Chord): Clip[] {
  return clips.map((c) => (ids.includes(c.id) && c.chord ? { ...c, chord: update(c.chord) } : c))
}

export function removeClip(clips: Clip[], id: string): Clip[] {
  return clips.filter((c) => c.id !== id)
}

/**
 * Where a new empty clip goes when you double-click empty space at `x`: the whole gap
 * around it if that's a bar or less, else the part of the gap inside the clicked bar
 * (so it never runs over a bar). Null if `x` is on a clip or the space is too small.
 */
export function emptyClipSpan(clips: Clip[], x: number, total: number, barTicks: number = TICKS_PER_BAR) {
  if (x < 0 || x >= total || clips.some((c) => c.start <= x && x < clipEnd(c))) return null
  const gapStart = Math.max(0, ...clips.filter((c) => clipEnd(c) <= x).map(clipEnd))
  const gapEnd = Math.min(total, ...clips.filter((c) => c.start > x).map((c) => c.start))
  let start = gapStart
  let end = gapEnd
  if (end - start > barTicks) {
    const barStart = Math.floor(x / barTicks) * barTicks
    start = Math.max(gapStart, barStart)
    end = Math.min(gapEnd, barStart + barTicks)
  }
  return end - start >= MIN_CLIP_TICKS ? { start, length: end - start } : null
}

/** Add an empty clip (a placeholder for a chord) where you double-clicked; see emptyClipSpan. */
export function addEmptyClip(clips: Clip[], id: string, x: number, total: number, barTicks: number = TICKS_PER_BAR) {
  const span = emptyClipSpan(clips, x, total, barTicks)
  return span ? sortClips([...clips, { id, chord: null, ...span }]) : clips
}

/**
 * The "+ New" button: an empty spot in the first gap on the track (never longer than a
 * bar, even if the gap is bigger). With no gap, it's added at the end by taking up to
 * half of the last clip, which keeps its start and just gets shorter. Null if nothing
 * can give way.
 */
export function addNextEmptyClip(clips: Clip[], id: string, total: number, barTicks: number = TICKS_PER_BAR) {
  const sorted = sortClips(clips)
  let at = 0
  for (const c of [...sorted, { start: total } as Clip]) {
    if (c.start - at >= MIN_CLIP_TICKS) {
      return sortClips([...sorted, { id, chord: null, start: at, length: Math.min(barTicks, c.start - at) }])
    }
    at = Math.max(at, c.start + (c.length ?? 0))
  }
  const last = sorted[sorted.length - 1]
  if (!last || last.length < 2 * MIN_CLIP_TICKS) return null
  const length = Math.max(MIN_CLIP_TICKS, Math.min(barTicks, Math.floor(last.length / 2)))
  return sortClips([
    ...sorted.map((c) => (c.id === last.id ? { ...c, length: last.length - length } : c)),
    { id, chord: null, start: clipEnd(last) - length, length },
  ])
}

/**
 * Drop a chord at `pos`:
 * - in empty space: fill from `pos` up to the next clip (max 1 bar)
 * - inside a clip: split it; the new chord takes the remainder
 * - on a clip's very start: replace that clip's chord
 */
export function dropChord(
  clips: Clip[],
  chord: Chord,
  pos: number,
  total: number,
  barTicks: number = TICKS_PER_BAR,
): Clip[] {
  const sorted = sortClips(clips)
  const hit = sorted.find((c) => c.start <= pos && pos < clipEnd(c))

  if (hit) {
    if (pos - hit.start < MIN_CLIP_TICKS || clipEnd(hit) - pos < MIN_CLIP_TICKS) {
      return replaceChord(sorted, hit.id, chord)
    }
    const trimmed = sorted.map((c) => (c.id === hit.id ? { ...c, length: pos - c.start } : c))
    return sortClips([...trimmed, newClip(chord, pos, clipEnd(hit) - pos)])
  }

  const next = sorted.find((c) => c.start > pos)
  const end = Math.min(next ? next.start : total, pos + barTicks)
  if (end - pos < MIN_CLIP_TICKS) return clips
  return sortClips([...sorted, newClip(chord, pos, end - pos)])
}

/**
 * Add a chord without a specific position: fill the first gap (max 1 bar),
 * or if the track is full, split the longest clip (the later one on ties) in half.
 */
export function addChord(
  clips: Clip[],
  chord: Chord,
  total: number,
  gridTicks: number,
  barTicks: number = TICKS_PER_BAR,
): Clip[] {
  const sorted = sortClips(clips)

  let cursor = 0
  for (const c of [...sorted, null]) {
    const gapEnd = c ? c.start : total
    if (gapEnd - cursor >= minFillGap(barTicks)) {
      return sortClips([...sorted, newClip(chord, cursor, Math.min(gapEnd - cursor, barTicks))])
    }
    if (c) cursor = clipEnd(c)
  }

  if (sorted.length === 0) return clips
  const longest = sorted.reduce((a, b) => (b.length >= a.length ? b : a))
  let split = snap(longest.start + longest.length / 2, gridTicks, 'round', barTicks)
  if (split - longest.start < MIN_CLIP_TICKS || clipEnd(longest) - split < MIN_CLIP_TICKS) {
    split = snap(longest.start + longest.length / 2, 0)
  }
  if (split - longest.start < MIN_CLIP_TICKS || clipEnd(longest) - split < MIN_CLIP_TICKS) return clips
  return dropChord(sorted, chord, split, total, barTicks)
}

/**
 * Move one edge of a clip to `pos`. Neighbors in the direction of travel are trimmed;
 * once a neighbor is at MIN_CLIP_TICKS it gets pushed. Nothing leaves [0, total].
 */
export function resizeClip(
  clips: Clip[],
  id: string,
  edge: 'start' | 'end',
  pos: number,
  total: number,
): Clip[] {
  const sorted = sortClips(clips)
  const i = sorted.findIndex((c) => c.id === id)
  if (i < 0) return clips
  const target = sorted[i]

  if (edge === 'end') {
    const apply = (end: number) => {
      const out = sorted.map((c) => ({ ...c }))
      out[i].length = end - out[i].start
      let cursor = end
      for (let j = i + 1; j < out.length; j++) {
        const c = out[j]
        if (c.start >= cursor) break
        const newEnd = Math.max(clipEnd(c), cursor + MIN_CLIP_TICKS)
        c.start = cursor
        c.length = newEnd - cursor
        cursor = newEnd
      }
      return out
    }
    const end = Math.min(Math.max(pos, target.start + MIN_CLIP_TICKS), total)
    const out = apply(end)
    const overflow = Math.max(...out.map(clipEnd)) - total
    return overflow > 0 ? apply(end - overflow) : out
  }

  const apply = (start: number) => {
    const out = sorted.map((c) => ({ ...c }))
    out[i].length = clipEnd(target) - start
    out[i].start = start
    let cursor = start
    for (let j = i - 1; j >= 0; j--) {
      const c = out[j]
      if (clipEnd(c) <= cursor) break
      const newStart = Math.min(c.start, cursor - MIN_CLIP_TICKS)
      c.length = cursor - newStart
      c.start = newStart
      cursor = newStart
    }
    return out
  }
  const start = Math.max(Math.min(pos, clipEnd(target) - MIN_CLIP_TICKS), 0)
  const out = apply(start)
  const underflow = -Math.min(...out.map((c) => c.start))
  return underflow > 0 ? apply(start + underflow) : out
}

/** Fit clips to a new track length: drop clips past the end, trim the one crossing it. */
export function fitToLength(clips: Clip[], total: number): Clip[] {
  return clips
    .filter((c) => total - c.start >= MIN_CLIP_TICKS)
    .map((c) => (clipEnd(c) > total ? { ...c, length: total - c.start } : c))
}

/**
 * Insert `clip` at `clip.start`, making room by moving only the clips to its right.
 * Order of concessions when space runs out:
 *   1. right-hand clips are pushed right (consuming gaps), keeping their lengths
 *   2. the inserted clip shrinks, down to `minLen`
 *   3. right-hand clips are squeezed, last one first, down to `minLen`
 * Returns null if it can't fit even with everything at minimum.
 */
export function insertClip(clips: Clip[], clip: Clip, total: number, minLen: number): Clip[] | null {
  const at = clip.start
  const sorted = sortClips(clips)
  const left = sorted.filter((c) => c.start < at)
  const right = sorted.filter((c) => c.start >= at)
  if (left.some((c) => clipEnd(c) > at)) return null

  const floor = (len: number) => Math.min(len, minLen)
  const required = floor(clip.length) + right.reduce((sum, c) => sum + floor(c.length), 0)
  if (total - at < required) return null

  let heldLen = clip.length
  const lengths = right.map((c) => c.length)
  const layout = () => {
    let cursor = at + heldLen
    return right.map((c, i) => {
      const start = Math.max(c.start, cursor)
      cursor = start + lengths[i]
      return { ...c, start, length: lengths[i] }
    })
  }
  let placed = layout()
  const overflow = () => Math.max(at + heldLen, ...placed.map(clipEnd)) - total

  let over = overflow()
  while (over > 0 && heldLen > floor(clip.length)) {
    heldLen = Math.max(floor(clip.length), heldLen - over)
    placed = layout()
    over = overflow()
  }
  for (let i = lengths.length - 1; i >= 0; i--) {
    while (over > 0 && lengths[i] > floor(right[i].length)) {
      lengths[i] = Math.max(floor(right[i].length), lengths[i] - over)
      placed = layout()
      over = overflow()
    }
  }
  if (over > 0) return null
  return [...left, { ...clip, length: heldLen }, ...placed]
}

/** A chord being dragged: either an existing clip (moved) or a new one from the palette. */
export type HeldChord = {
  id: string
  /** Null when dragging an empty clip. */
  chord: Chord | null
  existing: boolean
  /** Ticks between the clip's start and the pointer when it was grabbed. */
  grabOffset: number
  /** When moving a multi-clip selection: all selected clip ids (including `id`). */
  groupIds?: string[]
  /**
   * Duplicate instead of move (Option/Ctrl held): the originals stay and copies are
   * dropped, like a new chord from the palette (making room, replacing on a clip's middle).
   */
  copy?: boolean
  /** Ids for the copies, by original id (made when the drag starts, so the preview is stable). */
  copyIds?: Record<string, string>
}

export type DropTarget =
  /** Place at `at` (no earlier than `min`). `beside` is set when dropped on a clip's edge zone. */
  | { kind: 'insert'; at: number; min: number; beside?: { id: string; side: 'before' | 'after' } }
  | { kind: 'replace'; id: string }

/** Fraction of a clip's width at each end that means "insert before/after" rather than "replace". */
const EDGE_ZONE = 0.3

/**
 * What dropping with the pointer at tick `x` means, relative to `clips` (which excludes
 * the held clip/s). Without `allowReplace` (group moves) a clip has no middle zone:
 * its left half means "before", its right half "after".
 */
export function dropTarget(
  clips: Clip[],
  x: number,
  grabOffset: number,
  gridTicks: number,
  total: number,
  barTicks: number = TICKS_PER_BAR,
  allowReplace = true,
): DropTarget {
  const hit = clips.find((c) => c.start <= x && x < clipEnd(c))
  if (hit) {
    const f = (x - hit.start) / hit.length
    const edge = allowReplace ? EDGE_ZONE : 0.5
    if (f < edge) return { kind: 'insert', at: hit.start, min: hit.start, beside: { id: hit.id, side: 'before' } }
    if (f >= 1 - edge) {
      return { kind: 'insert', at: clipEnd(hit), min: clipEnd(hit), beside: { id: hit.id, side: 'after' } }
    }
    return { kind: 'replace', id: hit.id }
  }
  const gapStart = Math.max(0, ...clips.filter((c) => clipEnd(c) <= x).map(clipEnd))
  const gapEnd = Math.min(total, ...clips.filter((c) => c.start > x).map((c) => c.start))
  const at = Math.min(Math.max(snap(Math.max(0, x - grabOffset), gridTicks, 'round', barTicks), gapStart), gapEnd)
  return { kind: 'insert', at, min: gapStart }
}

/**
 * Move clips `ids` (as one block, in their current order) to just before/after clip
 * `targetId`, like reordering a list: the spots they left close up, and everything
 * between slides over to make room. Every clip keeps its length, gaps stay in sequence
 * with their neighbors, and the track's total span is unchanged, so clips outside the
 * affected range don't move.
 */
export function reorderClips(clips: Clip[], ids: string[], targetId: string, side: 'before' | 'after'): Clip[] {
  const moving = new Set(ids)
  if (moving.has(targetId) || !clips.some((c) => c.id === targetId)) return clips
  const sorted = sortClips(clips)

  // The whole track as a sequence of gaps and clips, packed from 0.
  type Segment = { clip: Clip } | { gap: number }
  const segments: Segment[] = []
  let end = 0
  for (const c of sorted) {
    if (c.start > end) segments.push({ gap: c.start - end })
    segments.push({ clip: c })
    end = clipEnd(c)
  }

  const isMoving = (seg: Segment) => 'clip' in seg && moving.has(seg.clip.id)
  const block = segments.filter(isMoving)
  const rest = segments.filter((seg) => !isMoving(seg))
  const targetIndex = rest.findIndex((seg) => 'clip' in seg && seg.clip.id === targetId)
  rest.splice(side === 'before' ? targetIndex : targetIndex + 1, 0, ...block)

  let cursor = 0
  const out: Clip[] = []
  for (const seg of rest) {
    if ('gap' in seg) {
      cursor += seg.gap
    } else {
      out.push({ ...seg.clip, start: cursor })
      cursor += seg.clip.length
    }
  }
  return out
}

/** Move one clip before/after another (see reorderClips). */
export const reorderClip = (clips: Clip[], id: string, targetId: string, side: 'before' | 'after') =>
  reorderClips(clips, [id], targetId, side)

/** Default length for a new chord inserted at `at`: fill the gap there (max 1 bar), else 1 bar. */
function newChordLength(clips: Clip[], at: number, total: number, barTicks: number) {
  const gapEnd = Math.min(total, ...clips.filter((c) => c.start >= at).map((c) => c.start))
  const gap = gapEnd - at
  return gap >= minFillGap(barTicks) ? Math.min(gap, barTicks) : barTicks
}

/** What a drop will do, for explaining it to the user before they let go. */
export type DropAction =
  /** Existing clip swaps chords with `targetId`. */
  | { kind: 'swap'; targetId: string }
  /** Existing clip is reordered to before/after `targetId`. */
  | { kind: 'move'; targetId: string; side: 'before' | 'after' }
  /** Palette chord inserted before/after `targetId`. */
  | { kind: 'insert'; targetId: string; side: 'before' | 'after' }
  /** Palette chord replaces `targetId`'s chord. */
  | { kind: 'replace'; targetId: string }
  /** Placed in empty space at the pointer. */
  | { kind: 'place' }

export type DropPlan = {
  clips: Clip[]
  /** The clip holding the dragged chord (for a group: the grabbed clip). */
  placedId: string
  /** Every clip that was dropped (more than one for a group move). */
  placedIds: string[]
  action: DropAction
}

/**
 * The track that would result from dropping `held` with the pointer at tick `x`,
 * the id of the clip that ends up holding the dragged chord, and what kind of change
 * it is. Null if it can't go there.
 */
export function planDrop(
  clips: Clip[],
  held: HeldChord,
  x: number,
  total: number,
  gridTicks: number,
  barTicks: number = TICKS_PER_BAR,
): DropPlan | null {
  if (held.existing && held.copy && held.copyIds) {
    return planCopyDrop(clips, held, x, total, gridTicks, barTicks)
  }
  if (held.existing && held.groupIds && held.groupIds.length > 1) {
    return planGroupDrop(clips, held, x, total, gridTicks, barTicks)
  }
  const original = held.existing ? clips.find((c) => c.id === held.id) : undefined
  if (held.existing && !original) return null
  const others = original ? removeClip(clips, original.id) : clips
  const target = dropTarget(others, x, held.grabOffset, gridTicks, total, barTicks)

  if (target.kind === 'replace') {
    if (!original) {
      return {
        clips: replaceChord(clips, target.id, held.chord),
        placedId: target.id,
        placedIds: [target.id],
        action: { kind: 'replace', targetId: target.id },
      }
    }
    const targetChord = others.find((c) => c.id === target.id)!.chord
    const swapped = clips.map((c) =>
      c.id === target.id ? { ...c, chord: held.chord } : c.id === original.id ? { ...c, chord: targetChord } : c,
    )
    return { clips: swapped, placedId: target.id, placedIds: [target.id], action: { kind: 'swap', targetId: target.id } }
  }

  // Moving a clip onto another clip's edge reorders (see reorderClip).
  if (original && target.beside) {
    const { id: targetId, side } = target.beside
    return {
      clips: reorderClip(clips, original.id, targetId, side),
      placedId: original.id,
      placedIds: [original.id],
      action: { kind: 'move', targetId, side },
    }
  }

  const minLen = Math.max(gridTicks, MIN_CLIP_TICKS)
  const length = original ? original.length : newChordLength(others, target.at, total, barTicks)
  // Near the end of the track, slide left (within the gap) so the chord and everything
  // after it keep their lengths; insertClip shrinks things only if that isn't enough.
  const rightLengths = others.filter((c) => c.start >= target.at).reduce((sum, c) => sum + c.length, 0)
  const at = Math.max(target.min, Math.min(target.at, total - length - rightLengths))

  const clip: Clip = original ? { ...original, start: at, length } : { id: held.id, chord: held.chord, start: at, length }
  const result = insertClip(others, clip, total, minLen)
  if (!result) return null
  const action: DropAction =
    !original && target.beside ? { kind: 'insert', targetId: target.beside.id, side: target.beside.side } : { kind: 'place' }
  return { clips: result, placedId: clip.id, placedIds: [clip.id], action }
}

/**
 * Drop a multi-clip selection. The selected clips move as one block, in order:
 * - onto a clip: before/after it, closing up the spots they left (reorderClips)
 * - into empty space: packed together at the pointer, making room like a single clip
 *   (null if the whole block can't fit at full length)
 */
function planGroupDrop(
  clips: Clip[],
  held: HeldChord,
  x: number,
  total: number,
  gridTicks: number,
  barTicks: number,
): DropPlan | null {
  const ids = new Set(held.groupIds)
  const group = sortClips(clips.filter((c) => ids.has(c.id)))
  if (!group.some((c) => c.id === held.id)) return null
  const placedIds = group.map((c) => c.id)
  const others = clips.filter((c) => !ids.has(c.id))

  // Where the pointer sits within the packed block.
  let offset = held.grabOffset
  for (const c of group) {
    if (c.id === held.id) break
    offset += c.length
  }
  const target = dropTarget(others, x, offset, gridTicks, total, barTicks, false)
  if (target.kind === 'insert' && target.beside) {
    const { id: targetId, side } = target.beside
    return {
      clips: reorderClips(clips, placedIds, targetId, side),
      placedId: held.id,
      placedIds,
      action: { kind: 'move', targetId, side },
    }
  }
  if (target.kind !== 'insert') return null

  const length = group.reduce((sum, c) => sum + c.length, 0)
  const rightLengths = others.filter((c) => c.start >= target.at).reduce((sum, c) => sum + c.length, 0)
  const at = Math.max(target.min, Math.min(target.at, total - length - rightLengths))
  const BLOCK = '\u0000block'
  const result = insertClip(others, { id: BLOCK, chord: held.chord, start: at, length }, total, Math.max(gridTicks, MIN_CLIP_TICKS))
  const block = result?.find((c) => c.id === BLOCK)
  if (!result || !block || block.length < length) return null

  let cursor = block.start
  const members = group.map((c) => {
    const placed = { ...c, start: cursor }
    cursor += c.length
    return placed
  })
  return {
    clips: sortClips([...result.filter((c) => c.id !== BLOCK), ...members]),
    placedId: held.id,
    placedIds,
    action: { kind: 'place' },
  }
}

/**
 * Drop copies of the held clip(s). One clip drops like a palette chord of the same
 * length (edges insert and make room, the middle replaces). A group is copied as one
 * block that must fit at full length (edges insert before/after, no middle zone).
 */
function planCopyDrop(
  clips: Clip[],
  held: HeldChord,
  x: number,
  total: number,
  gridTicks: number,
  barTicks: number,
): DropPlan | null {
  const ids = new Set(held.groupIds && held.groupIds.length > 1 ? held.groupIds : [held.id])
  const group = sortClips(clips.filter((c) => ids.has(c.id)))
  const copyId = (id: string) => held.copyIds?.[id] ?? `${id}-copy`
  if (!group.some((c) => c.id === held.id)) return null
  const minLen = Math.max(gridTicks, MIN_CLIP_TICKS)

  if (group.length === 1) {
    const original = group[0]
    const target = dropTarget(clips, x, held.grabOffset, gridTicks, total, barTicks)
    if (target.kind === 'replace') {
      if (target.id === original.id) return null
      return {
        clips: replaceChord(clips, target.id, original.chord),
        placedId: target.id,
        placedIds: [target.id],
        action: { kind: 'replace', targetId: target.id },
      }
    }
    const rightLengths = clips.filter((c) => c.start >= target.at).reduce((sum, c) => sum + c.length, 0)
    const at = Math.max(target.min, Math.min(target.at, total - original.length - rightLengths))
    const copy: Clip = { ...original, id: copyId(original.id), start: at }
    const result = insertClip(clips, copy, total, minLen)
    if (!result) return null
    const action: DropAction = target.beside
      ? { kind: 'insert', targetId: target.beside.id, side: target.beside.side }
      : { kind: 'place' }
    return { clips: result, placedId: copy.id, placedIds: [copy.id], action }
  }

  let offset = held.grabOffset
  for (const c of group) {
    if (c.id === held.id) break
    offset += c.length
  }
  const target = dropTarget(clips, x, offset, gridTicks, total, barTicks, false)
  if (target.kind !== 'insert') return null
  const length = group.reduce((sum, c) => sum + c.length, 0)
  const rightLengths = clips.filter((c) => c.start >= target.at).reduce((sum, c) => sum + c.length, 0)
  const at = target.beside ? target.at : Math.max(target.min, Math.min(target.at, total - length - rightLengths))
  const BLOCK = '\u0000block'
  const result = insertClip(clips, { id: BLOCK, chord: null, start: at, length }, total, minLen)
  const block = result?.find((c) => c.id === BLOCK)
  if (!result || !block || block.length < length) return null
  let cursor = block.start
  const copies = group.map((c) => {
    const placed = { ...c, id: copyId(c.id), start: cursor }
    cursor += c.length
    return placed
  })
  const action: DropAction = target.beside
    ? { kind: 'insert', targetId: target.beside.id, side: target.beside.side }
    : { kind: 'place' }
  return {
    clips: sortClips([...result.filter((c) => c.id !== BLOCK), ...copies]),
    placedId: copyId(held.id),
    placedIds: copies.map((c) => c.id),
    action,
  }
}

export type ClipChange = 'swap' | 'replace' | 'left' | 'right' | 'squeeze'

/**
 * How each clip (other than the dropped one) is affected by a drop: swapped, replaced,
 * shifted left/right, or squeezed shorter. Clips that don't change are omitted.
 */
export function dropChanges(before: Clip[], plan: DropPlan, heldId: string): Map<string, ClipChange> {
  const changes = new Map<string, ClipChange>()
  const { action } = plan
  if (action.kind === 'swap') {
    changes.set(action.targetId, 'swap')
    changes.set(heldId, 'swap')
    return changes
  }
  if (action.kind === 'replace') {
    changes.set(action.targetId, 'replace')
    return changes
  }
  const old = new Map(before.map((c) => [c.id, c]))
  for (const c of plan.clips) {
    const prev = old.get(c.id)
    if (!prev || plan.placedIds.includes(c.id)) continue
    if (c.start < prev.start) changes.set(c.id, 'left')
    else if (c.start > prev.start) changes.set(c.id, 'right')
    else if (c.length < prev.length) changes.set(c.id, 'squeeze')
  }
  return changes
}
