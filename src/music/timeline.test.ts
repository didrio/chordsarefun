import { describe, expect, it } from 'vitest'
import {
  addChord,
  clipEnd,
  dropChord,
  fitToLength,
  insertClip,
  metronomeClicks,
  playbackEnd,
  stepGrid,
  dropChanges,
  planDrop,
  reorderClip,
  reorderClips,
  MIN_CLIP_TICKS,
  rescaleClips,
  resizeClip,
  sigBarTicks,
  sigBeatTicks,
  TIME_SIGNATURES,
  NOTE_UNITS,
  MAX_SIG_BEATS,
  snap,
  TICKS_PER_BAR,
  TICKS_PER_BEAT,
  type Clip,
  type HeldChord,
} from './timeline'
import type { Chord } from './chord'
import { addEmptyClip, addNextEmptyClip, emptyClipSpan } from './timeline'

const BAR = TICKS_PER_BAR
const BEAT = TICKS_PER_BEAT
const TOTAL = 4 * BAR

/** Clips treat chords as opaque values, so tests label them by root alone. */
const ch = (label: string): Chord => ({ root: label, type: '', add: [], omit: [], inversion: 0 })
const clip = (id: string, start: number, length: number, label = id): Clip => ({ id, chord: ch(label), start, length })
const layout = (clips: Clip[]) => clips.map((c) => [c.chord!.root, c.start, c.length])

const fourBars = () => [clip('C', 0, BAR), clip('G', BAR, BAR), clip('Am', 2 * BAR, BAR), clip('F', 3 * BAR, BAR)]

describe('addChord', () => {
  it('fills the first gap with up to one bar', () => {
    const one = addChord([], ch('C'), TOTAL, BEAT)
    expect(layout(one)).toEqual([['C', 0, BAR]])
    expect(layout(addChord(one, ch('G'), TOTAL, BEAT))).toEqual([
      ['C', 0, BAR],
      ['G', BAR, BAR],
    ])
  })

  it('splits the last longest clip when the track is full, keeping total length', () => {
    const out = addChord(fourBars(), ch('Dm'), TOTAL, BEAT)
    expect(layout(out)).toEqual([
      ['C', 0, BAR],
      ['G', BAR, BAR],
      ['Am', 2 * BAR, BAR],
      ['F', 3 * BAR, BAR / 2],
      ['Dm', 3.5 * BAR, BAR / 2],
    ])
  })
})

describe('dropChord', () => {
  it('splits a clip at the drop point (flavor chord before the 3rd chord)', () => {
    const out = dropChord(fourBars(), ch('D7'), 2 * BAR - BEAT / 2, TOTAL)
    expect(layout(out)).toEqual([
      ['C', 0, BAR],
      ['G', BAR, BAR - BEAT / 2],
      ['D7', 2 * BAR - BEAT / 2, BEAT / 2],
      ['Am', 2 * BAR, BAR],
      ['F', 3 * BAR, BAR],
    ])
  })

  it('replaces a clip when dropped on its start', () => {
    expect(layout(dropChord(fourBars(), ch('Em'), BAR, TOTAL))[1]).toEqual(['Em', BAR, BAR])
  })

  it('fills empty space up to the next clip', () => {
    const out = dropChord([clip('C', 0, BAR), clip('G', 2 * BAR, BAR)], ch('F'), BAR + BEAT, TOTAL)
    expect(layout(out)[1]).toEqual(['F', BAR + BEAT, 3 * BEAT])
  })
})

describe('resizeClip', () => {
  it('trims the neighbor when extending into it', () => {
    const out = resizeClip(fourBars(), 'C', 'end', BAR + BEAT, TOTAL)
    expect(layout(out).slice(0, 2)).toEqual([
      ['C', 0, BAR + BEAT],
      ['G', BAR + BEAT, 3 * BEAT],
    ])
  })

  it('pushes neighbors once they hit minimum length, never past the end', () => {
    const out = resizeClip(fourBars(), 'C', 'end', TOTAL, TOTAL)
    expect(layout(out)).toEqual([
      ['C', 0, TOTAL - 3 * MIN_CLIP_TICKS],
      ['G', TOTAL - 3 * MIN_CLIP_TICKS, MIN_CLIP_TICKS],
      ['Am', TOTAL - 2 * MIN_CLIP_TICKS, MIN_CLIP_TICKS],
      ['F', TOTAL - MIN_CLIP_TICKS, MIN_CLIP_TICKS],
    ])
  })

  it('shrinking leaves a gap and does not move neighbors', () => {
    const out = resizeClip(fourBars(), 'G', 'end', BAR + BEAT, TOTAL)
    expect(layout(out).slice(1, 3)).toEqual([
      ['G', BAR, BEAT],
      ['Am', 2 * BAR, BAR],
    ])
  })

  it('moves the start edge left, trimming the previous clip, clamped at 0', () => {
    const out = resizeClip(fourBars(), 'G', 'start', BAR - BEAT, TOTAL)
    expect(layout(out).slice(0, 2)).toEqual([
      ['C', 0, BAR - BEAT],
      ['G', BAR - BEAT, BAR + BEAT],
    ])
    const pushed = resizeClip(fourBars(), 'G', 'start', -BAR, TOTAL)
    expect(layout(pushed).slice(0, 2)).toEqual([
      ['C', 0, MIN_CLIP_TICKS],
      ['G', MIN_CLIP_TICKS, 2 * BAR - MIN_CLIP_TICKS],
    ])
  })

  it('never makes a clip shorter than the minimum', () => {
    const out = resizeClip(fourBars(), 'C', 'end', 0, TOTAL)
    expect(out[0].length).toBe(MIN_CLIP_TICKS)
  })
})

describe('fitToLength', () => {
  it('drops and trims clips past a shorter track', () => {
    expect(layout(fitToLength(fourBars(), 1.5 * BAR))).toEqual([
      ['C', 0, BAR],
      ['G', BAR, BAR / 2],
    ])
  })
})

describe('insertClip', () => {
  it('pushes right-hand clips into free space, keeping lengths', () => {
    const clips = [clip('C', 0, BAR), clip('G', BAR, BAR)]
    const out = insertClip(clips, clip('F', BAR, BAR), TOTAL, BEAT)!
    expect(layout(out)).toEqual([
      ['C', 0, BAR],
      ['F', BAR, BAR],
      ['G', 2 * BAR, BAR],
    ])
  })

  it('shrinks the inserted clip before squeezing the others', () => {
    const out = insertClip(
      [clip('C', 0, BAR), clip('G', BAR, BAR), clip('Am', 2 * BAR, 1.5 * BAR)],
      clip('F', BAR, BAR),
      TOTAL,
      BEAT,
    )!
    expect(layout(out)).toEqual([
      ['C', 0, BAR],
      ['F', BAR, BAR / 2],
      ['G', 1.5 * BAR, BAR],
      ['Am', 2.5 * BAR, 1.5 * BAR],
    ])
  })

  it('squeezes right-hand clips from the end once the inserted clip is at minimum', () => {
    const out = insertClip(fourBars(), clip('D', 2 * BAR, BAR), TOTAL, BEAT)!
    expect(layout(out)).toEqual([
      ['C', 0, BAR],
      ['G', BAR, BAR],
      ['D', 2 * BAR, BEAT],
      ['Am', 2 * BAR + BEAT, BAR],
      ['F', 3 * BAR + BEAT, 3 * BEAT],
    ])
  })

  it('returns null when nothing can fit', () => {
    const full = [clip('C', 0, TOTAL - BEAT), clip('G', TOTAL - BEAT, BEAT)]
    expect(insertClip(full, clip('F', TOTAL - BEAT, BAR), TOTAL, BEAT)).toBeNull()
  })
})

describe('planDrop', () => {
  const held = (id: string, label: string, existing: boolean, grabOffset = 0): HeldChord => ({
    id,
    chord: ch(label),
    existing,
    grabOffset,
  })

  it('moving a clip onto the end zone of another places it right after, pushing the rest', () => {
    const clips = [clip('C', 0, BAR), clip('G', BAR, BAR), clip('Am', 2 * BAR, BAR)]
    const plan = planDrop(clips, held('Am', 'Am', true), BAR - BEAT / 2, TOTAL, BEAT)!
    expect(layout(plan.clips)).toEqual([
      ['C', 0, BAR],
      ['Am', BAR, BAR],
      ['G', 2 * BAR, BAR],
    ])
    expect(plan.placedId).toBe('Am')
  })

  const order = (clips: Clip[]) => [...clips].sort((a, b) => a.start - b.start).map((c) => c.chord!.root)

  it('moving the first clip onto the start of the second changes nothing', () => {
    const plan = planDrop(fourBars(), held('C', 'C', true), BAR + BEAT / 2, TOTAL, BEAT)!
    expect(layout(plan.clips)).toEqual(layout(fourBars()))
  })

  it('moving the first clip onto the end of the second swaps them', () => {
    const plan = planDrop(fourBars(), held('C', 'C', true), 2 * BAR - BEAT / 2, TOTAL, BEAT)!
    expect(order(plan.clips)).toEqual(['G', 'C', 'Am', 'F'])
  })

  it('moving the first clip onto the end of the third slides the ones between left', () => {
    const plan = planDrop(fourBars(), held('C', 'C', true), 3 * BAR - BEAT / 2, TOTAL, BEAT)!
    expect(layout(plan.clips)).toEqual([
      ['G', 0, BAR],
      ['Am', BAR, BAR],
      ['C', 2 * BAR, BAR],
      ['F', 3 * BAR, BAR],
    ])
  })

  it('moving a clip left onto the start of an earlier clip slides the ones between right', () => {
    const plan = planDrop(fourBars(), held('F', 'F', true), BAR + BEAT / 2, TOTAL, BEAT)!
    expect(order(plan.clips)).toEqual(['C', 'F', 'G', 'Am'])
  })

  it('moving the first clip onto the middle of the third swaps them', () => {
    const plan = planDrop(fourBars(), held('C', 'C', true), 2.5 * BAR, TOTAL, BEAT)!
    expect(order(plan.clips)).toEqual(['Am', 'G', 'C', 'F'])
  })

  it('moving a clip onto the middle of another swaps their chords', () => {
    const plan = planDrop(fourBars(), held('C', 'C', true), 2.5 * BAR, TOTAL, BEAT)!
    expect(layout(plan.clips).map((c) => c[0])).toEqual(['Am', 'G', 'C', 'F'])
  })

  it('moving a clip within empty space follows the pointer minus the grab offset', () => {
    const plan = planDrop([clip('C', 0, BAR)], held('C', 'C', true, BEAT), 2 * BAR + BEAT, TOTAL, BEAT)!
    expect(layout(plan.clips)).toEqual([['C', 2 * BAR, BAR]])
  })

  it('a palette chord dropped in a gap fills it', () => {
    const clips = [clip('C', 0, BAR), clip('G', BAR + 2 * BEAT, BAR)]
    const plan = planDrop(clips, held('new', 'F', false), BAR, TOTAL, BEAT)!
    expect(layout(plan.clips)[1]).toEqual(['F', BAR, 2 * BEAT])
  })

  it('a palette chord dropped on the middle of a clip replaces it', () => {
    const plan = planDrop(fourBars(), held('new', 'Em', false), BAR + BAR / 2, TOTAL, BEAT)!
    expect(layout(plan.clips)[1]).toEqual(['Em', BAR, BAR])
  })

  it('slides left within the gap near the end of the track so it still fits', () => {
    const plan = planDrop([clip('C', 0, BAR)], held('C', 'C', true), TOTAL - 10, TOTAL, BEAT)!
    expect(layout(plan.clips)).toEqual([['C', TOTAL - BAR, BAR]])
  })
})

describe('reorderClip', () => {
  it('keeps lengths and only moves clips in the affected range', () => {
    const clips = [clip('C', 0, BAR), clip('G', BAR, 2 * BEAT), clip('Am', BAR + 2 * BEAT, BAR + 2 * BEAT), clip('F', 3 * BAR, BAR)]
    const out = reorderClip(clips, 'C', 'Am', 'after')
    expect(layout(out)).toEqual([
      ['G', 0, 2 * BEAT],
      ['Am', 2 * BEAT, BAR + 2 * BEAT],
      ['C', 2 * BAR, BAR],
      ['F', 3 * BAR, BAR],
    ])
  })

  it('carries gaps along with their neighbors', () => {
    const clips = [clip('C', 0, BAR), clip('G', 2 * BAR, BAR)]
    expect(layout(reorderClip(clips, 'C', 'G', 'after'))).toEqual([
      ['G', BAR, BAR],
      ['C', 2 * BAR, BAR],
    ])
  })
})

describe('dropChanges', () => {
  const held = (id: string, label: string, existing: boolean): HeldChord => ({ id, chord: ch(label), existing, grabOffset: 0 })

  it('marks clips that shift when reordering', () => {
    const plan = planDrop(fourBars(), held('C', 'C', true), 3 * BAR - BEAT / 2, TOTAL, BEAT)!
    expect(plan.action).toEqual({ kind: 'move', targetId: 'Am', side: 'after' })
    expect(Object.fromEntries(dropChanges(fourBars(), plan, 'C'))).toEqual({ G: 'left', Am: 'left' })
  })

  it('marks both clips in a swap', () => {
    const plan = planDrop(fourBars(), held('C', 'C', true), 2.5 * BAR, TOTAL, BEAT)!
    expect(Object.fromEntries(dropChanges(fourBars(), plan, 'C'))).toEqual({ Am: 'swap', C: 'swap' })
  })

  it('marks pushed and squeezed clips for a palette insert', () => {
    const plan = planDrop(fourBars(), held('new', 'D', false), 2 * BAR + BEAT / 2, TOTAL, BEAT)!
    expect(plan.action).toEqual({ kind: 'insert', targetId: 'Am', side: 'before' })
    expect(Object.fromEntries(dropChanges(fourBars(), plan, 'new'))).toEqual({ Am: 'right', F: 'right' })
  })
})

describe('time signatures', () => {
  it('computes bar length from the signature', () => {
    expect(sigBarTicks({ beats: 3, unit: 4 })).toBe(3 * BEAT)
    expect(sigBarTicks({ beats: 7, unit: 8 })).toBe(3.5 * BEAT)
  })

  it('snaps relative to each bar so odd meters stay aligned', () => {
    const bar = sigBarTicks({ beats: 7, unit: 8 })
    // 1/4 grid in 7/8: bar 2 starts at 3.5 beats; its first quarter line is at 4.5 beats.
    expect(snap(bar + BEAT * 0.9, BEAT, 'round', bar)).toBe(bar + BEAT)
    expect(snap(bar - BEAT * 0.2, BEAT, 'round', bar)).toBe(bar)
  })

  it('rescales clips with the bar length', () => {
    const out = rescaleClips(fourBars(), 3 / 4)
    expect(layout(out)).toEqual([
      ['C', 0, 3 * BEAT],
      ['G', 3 * BEAT, 3 * BEAT],
      ['Am', 6 * BEAT, 3 * BEAT],
      ['F', 9 * BEAT, 3 * BEAT],
    ])
  })
})

describe('stepGrid', () => {
  const bar78 = sigBarTicks({ beats: 7, unit: 8 })

  it('steps by grid in 4/4', () => {
    expect(stepGrid(0, 1, BEAT)).toBe(BEAT)
    expect(stepGrid(BEAT, -1, BEAT)).toBe(0)
  })

  it('never skips a bar line in odd meters', () => {
    // 7/8 bar = 3.5 quarters: from beat 3, the next stop is the bar line, not beat 4.
    expect(stepGrid(3 * BEAT, 1, BEAT, bar78)).toBe(bar78)
    expect(stepGrid(bar78, 1, BEAT, bar78)).toBe(bar78 + BEAT)
    expect(stepGrid(bar78, -1, BEAT, bar78)).toBe(3 * BEAT)
  })

  it('moves to the nearest grid point from off-grid positions', () => {
    expect(stepGrid(BEAT + 10, 1, BEAT)).toBe(2 * BEAT)
    expect(stepGrid(BEAT + 10, -1, BEAT)).toBe(BEAT)
  })
})

describe('playbackEnd', () => {
  it('ends at the last clip, or the track end when empty', () => {
    expect(playbackEnd([clip('C', 0, BAR)], TOTAL)).toBe(BAR)
    expect(playbackEnd([], TOTAL)).toBe(TOTAL)
  })
})

describe('metronomeClicks', () => {
  it('clicks every beat with the downbeat accented', () => {
    const clicks = metronomeClicks(2 * BAR, { beats: 4, unit: 4 })
    expect(clicks.map((c) => c.tick)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => i * BEAT))
    expect(clicks.map((c) => c.accent)).toEqual(['bar', 'beat', 'beat', 'beat', 'bar', 'beat', 'beat', 'beat'])
  })

  it('groups compound meters in threes', () => {
    const six = metronomeClicks(sigBarTicks({ beats: 6, unit: 8 }), { beats: 6, unit: 8 })
    expect(six.map((c) => c.accent)).toEqual(['bar', 'beat', 'beat', 'group', 'beat', 'beat'])
    expect(six.map((c) => c.tick)).toEqual([0, 1, 2, 3, 4, 5].map((i) => (i * BEAT) / 2))
  })

  it('only accents the downbeat in irregular and simple meters', () => {
    for (const [beats, unit] of [
      [7, 8],
      [5, 4],
      [3, 8],
      [3, 4],
      [2, 2],
    ]) {
      const clicks = metronomeClicks(sigBarTicks({ beats, unit }), { beats, unit })
      expect(clicks).toHaveLength(beats)
      expect(clicks.filter((c) => c.accent !== 'beat').map((c) => c.tick)).toEqual([0])
    }
  })
})

describe('every custom time signature', () => {
  const all = Array.from({ length: MAX_SIG_BEATS }, (_, i) => NOTE_UNITS.map((unit) => ({ beats: i + 1, unit }))).flat()

  it('includes all presets', () => {
    for (const p of TIME_SIGNATURES) expect(all).toContainEqual(p)
  })

  it.each(all)('$beats/$unit has whole-tick bars, one click per beat, and click-to-add works', (sig) => {
    const bar = sigBarTicks(sig)
    expect(Number.isInteger(bar)).toBe(true)
    expect(bar).toBe(sig.beats * sigBeatTicks(sig))
    const total = 4 * bar
    expect(metronomeClicks(total, sig)).toHaveLength(4 * sig.beats)
    // Clicking a chord into an empty track always adds it, at most one bar long.
    const added = addChord([], ch('C'), total, BEAT, bar)
    expect(added).toHaveLength(1)
    expect(added[0].length).toBe(Math.min(bar, total))
    // Snapping stays inside the track and on bar lines at bar boundaries.
    expect(snap(bar, BEAT, 'round', bar)).toBe(bar)
    // Rescaling a full track into this meter keeps clips inside it, without overlaps.
    const scaled = rescaleClips(fourBars(), bar / BAR)
    for (let i = 0; i < scaled.length; i++) {
      expect(clipEnd(scaled[i])).toBeLessThanOrEqual(total)
      if (i > 0) expect(scaled[i].start).toBeGreaterThanOrEqual(clipEnd(scaled[i - 1]))
    }
  })
})

describe('group moves', () => {
  const group = (ids: string[], grabbed = ids[0], grabOffset = 0): HeldChord => ({
    id: grabbed,
    chord: ch(grabbed),
    existing: true,
    grabOffset,
    groupIds: ids,
  })
  const order = (clips: Clip[]) => clips.map((c) => c.chord!.root)

  it('moves a contiguous selection after a later clip, closing the gap', () => {
    const plan = planDrop(fourBars(), group(['C', 'G']), 4 * BAR - 10, TOTAL, BEAT)!
    expect(layout(plan.clips)).toEqual([
      ['Am', 0, BAR],
      ['F', BAR, BAR],
      ['C', 2 * BAR, BAR],
      ['G', 3 * BAR, BAR],
    ])
    expect(plan.placedIds).toEqual(['C', 'G'])
    expect(plan.action).toEqual({ kind: 'move', targetId: 'F', side: 'after' })
  })

  it('gathers a scattered selection into one block, keeping order', () => {
    const after = planDrop(fourBars(), group(['C', 'Am']), 1.6 * BAR, TOTAL, BEAT)!
    expect(order(after.clips)).toEqual(['G', 'C', 'Am', 'F'])
    const plan = planDrop(fourBars(), group(['Am', 'C']), 3.6 * BAR, TOTAL, BEAT)!
    expect(order(plan.clips)).toEqual(['G', 'F', 'C', 'Am'])
    expect(plan.clips.map((c) => c.length)).toEqual([BAR, BAR, BAR, BAR])
  })

  it('has no swap zone: left half is before, right half is after', () => {
    expect(planDrop(fourBars(), group(['C', 'G']), 2.4 * BAR, TOTAL, BEAT)!.action).toEqual({
      kind: 'move',
      targetId: 'Am',
      side: 'before',
    })
    expect(planDrop(fourBars(), group(['C', 'G']), 2.6 * BAR, TOTAL, BEAT)!.action).toEqual({
      kind: 'move',
      targetId: 'Am',
      side: 'after',
    })
  })

  it('places a group into empty space at the pointer', () => {
    const clips = [clip('C', 0, BAR), clip('G', BAR, BAR)]
    const plan = planDrop(clips, group(['C', 'G'], 'G', BEAT), 2 * BAR + BEAT, TOTAL, BEAT)!
    // Grabbed G one beat in, so the block (C then G) starts one bar before the pointer.
    expect(layout(plan.clips)).toEqual([
      ['C', BAR, BAR],
      ['G', 2 * BAR, BAR],
    ])
    expect(plan.action).toEqual({ kind: 'place' })
  })

  it('refuses a group drop that would have to shrink the group', () => {
    // 3-bar track; C and F (2 bars together) dragged into the 1-bar gap left after G.
    const clips = [clip('C', 0, BAR), clip('G', BAR, BAR), clip('F', 2 * BAR, BAR)]
    expect(planDrop(clips, group(['C', 'F']), 2.5 * BAR, 3 * BAR, BEAT)).toBeNull()
  })

  it('marks shifted neighbors but not the moved clips', () => {
    const plan = planDrop(fourBars(), group(['C', 'G']), 4 * BAR - 10, TOTAL, BEAT)!
    expect(Object.fromEntries(dropChanges(fourBars(), plan, 'C'))).toEqual({ Am: 'left', F: 'left' })
  })
})

describe('reorderClips', () => {
  it('keeps the total span so clips outside the range stay put', () => {
    const clips = [clip('C', 0, BAR), clip('G', BAR, BAR), clip('Am', 2 * BAR, BAR), clip('F', 3 * BAR, BAR)]
    const out = reorderClips(clips, ['G'], 'Am', 'after')
    expect(layout(out)).toEqual([
      ['C', 0, BAR],
      ['Am', BAR, BAR],
      ['G', 2 * BAR, BAR],
      ['F', 3 * BAR, BAR],
    ])
  })

  it('does nothing when the target is part of the moving set', () => {
    const clips = fourBars()
    expect(reorderClips(clips, ['C', 'G'], 'G', 'after')).toBe(clips)
  })
})

describe('emptyClipSpan / addEmptyClip', () => {
  const BAR = TICKS_PER_BAR
  const at = (start: number, length: number, id = `c${start}`): Clip => ({ id, chord: ch('C'), start, length })

  it('fills the whole gap when it is a bar or less', () => {
    const clips = [at(0, BAR), at(BAR + BAR / 2, BAR)]
    expect(emptyClipSpan(clips, BAR + 100, 4 * BAR)).toEqual({ start: BAR, length: BAR / 2 })
  })

  it('takes only the clicked bar of a longer gap', () => {
    expect(emptyClipSpan([], 2.5 * BAR, 4 * BAR)).toEqual({ start: 2 * BAR, length: BAR })
    // A gap from beat 3 of bar 1 to the end: clicking bar 1 gets beats 3–4.
    expect(emptyClipSpan([at(0, BAR / 2)], BAR * 0.75, 4 * BAR)).toEqual({ start: BAR / 2, length: BAR / 2 })
  })

  it('does nothing on a clip', () => {
    const clips = [at(0, BAR)]
    expect(emptyClipSpan(clips, 10, 4 * BAR)).toBeNull()
    expect(addEmptyClip(clips, 'x', 10, 4 * BAR)).toBe(clips)
  })

  it('adds a silent placeholder clip', () => {
    const out = addEmptyClip([], 'x', 10, 4 * BAR)
    expect(out).toEqual([{ id: 'x', chord: null, start: 0, length: BAR }])
  })
})

describe('planDrop: copies (Option/Ctrl-drag)', () => {
  const BAR = TICKS_PER_BAR
  const four = ['C', 'G', 'A', 'F'].map((r, i): Clip => ({ id: r, chord: ch(r), start: i * BAR, length: BAR }))
  const roots = (clips: Clip[]) => [...clips].sort((a, b) => a.start - b.start).map((c) => c.chord?.root ?? '-')
  const copy = (id: string, extra: Partial<HeldChord> = {}): HeldChord => ({
    id,
    chord: ch(id),
    existing: true,
    grabOffset: 0,
    copy: true,
    copyIds: { C: 'C2', G: 'G2', A: 'A2', F: 'F2' },
    ...extra,
  })

  it('keeps the original and inserts a copy, making room', () => {
    const plan = planDrop(four, copy('C'), 2 * BAR - 10, 4 * BAR, TICKS_PER_BEAT)!
    expect(roots(plan.clips)).toEqual(['C', 'G', 'C', 'A', 'F'])
    expect(plan.placedIds).toEqual(['C2'])
    expect(plan.clips.find((c) => c.id === 'C')!.start).toBe(0)
  })

  it('replaces a clip when dropped on its middle', () => {
    const plan = planDrop(four, copy('C'), 2.5 * BAR, 4 * BAR, TICKS_PER_BEAT)!
    expect(roots(plan.clips)).toEqual(['C', 'G', 'C', 'F'])
    expect(plan.action).toEqual({ kind: 'replace', targetId: 'A' })
  })

  it('copies into empty space at full length', () => {
    const two = four.slice(0, 2)
    const plan = planDrop(two, copy('G'), 3 * BAR + 10, 4 * BAR, TICKS_PER_BEAT)!
    expect(plan.clips.find((c) => c.id === 'G2')).toMatchObject({ start: 3 * BAR, length: BAR })
  })

  it('copies a selection as one block', () => {
    const two = four.slice(0, 2)
    const plan = planDrop(two, copy('C', { groupIds: ['C', 'G'] }), 2 * BAR + 10, 4 * BAR, TICKS_PER_BEAT)!
    expect(roots(plan.clips)).toEqual(['C', 'G', 'C', 'G'])
    expect(plan.placedIds).toEqual(['C2', 'G2'])
  })

  it('refuses a block that does not fit', () => {
    expect(planDrop(four, copy('C', { groupIds: ['C', 'G'] }), 4 * BAR - 10, 4 * BAR, TICKS_PER_BEAT)).toBeNull()
  })
})

describe('addNextEmptyClip (+ New)', () => {
  const TOTAL = 4 * BAR

  it('fills the first gap, never longer than a bar', () => {
    const out = addNextEmptyClip([clip('a', 0, BAR), clip('b', 3 * BAR, BAR)], 'n', TOTAL)!
    expect(out.find((c) => c.id === 'n')).toMatchObject({ start: BAR, length: BAR, chord: null })
    expect(addNextEmptyClip([], 'n', TOTAL)!.find((c) => c.id === 'n')).toMatchObject({ start: 0, length: BAR })
  })

  it('uses a smaller gap as is', () => {
    const out = addNextEmptyClip([clip('a', 0, BAR), clip('b', BAR + BAR / 2, BAR)], 'n', TOTAL)!
    expect(out.find((c) => c.id === 'n')).toMatchObject({ start: BAR, length: BAR / 2 })
  })

  it('on a full track, takes up to half of the last chord at the end', () => {
    const full = [0, 1, 2, 3].map((i) => clip(`c${i}`, i * BAR, BAR))
    const out = addNextEmptyClip(full, 'n', TOTAL)!
    expect(out.find((c) => c.id === 'c3')).toMatchObject({ start: 3 * BAR, length: BAR / 2 })
    expect(out.find((c) => c.id === 'n')).toMatchObject({ start: 3.5 * BAR, length: BAR / 2 })
    for (let i = 1; i < out.length; i++) expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].start + out[i - 1].length)
  })
})
