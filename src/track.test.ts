import { describe, expect, it } from 'vitest'
import { beginGesture, commit, initHistory, readHistory, undo, updateGesture } from './history'
import { chordName, makeChord } from './music/chord'
import { applyGroove, DEFAULT_GROOVE, GROOVES } from './music/grooves'
import { DEFAULT_TRACK, isTrack, migrateTrack, withMusic, type Track } from './track'

/** A track as saved before the groove and tempo joined it. */
const { groove: _g, bpm: _b, ...oldShape } = DEFAULT_TRACK
const justChords = applyGroove(DEFAULT_GROOVE, GROOVES.find((g) => g.id === 'just')!)
const persist = (legacy = { groove: justChords, bpm: 87 }) => ({ key: 'track', isValid: isTrack, migrate: (v: unknown) => migrateTrack(v, legacy) })

describe('isTrack', () => {
  it('accepts the default track and rejects malformed ones', () => {
    expect(isTrack(DEFAULT_TRACK)).toBe(true)
    expect(isTrack({ ...DEFAULT_TRACK, mode: 'nope' })).toBe(false)
    expect(isTrack({ ...DEFAULT_TRACK, sig: { beats: 7, unit: 3 } })).toBe(false)
    expect(isTrack({ ...DEFAULT_TRACK, sig: { beats: 0, unit: 4 } })).toBe(false)
    expect(isTrack({ ...DEFAULT_TRACK, clips: [{ id: 'a', chord: makeChord('C'), start: 'x', length: 1 }] })).toBe(false)
    expect(isTrack({ ...DEFAULT_TRACK, clips: [{ id: 'a', chord: { root: 'C' }, start: 0, length: 1 }] })).toBe(false)
    expect(isTrack(null)).toBe(false)
  })

  it('accepts empty clips and slash chords, rejects bad bass notes', () => {
    const clip = (chord: unknown) => ({ ...DEFAULT_TRACK, clips: [{ id: 'a', chord, start: 0, length: 1 }] })
    expect(isTrack(clip(null))).toBe(true)
    expect(isTrack(clip({ ...makeChord('C'), bass: 'E' }))).toBe(true)
    expect(isTrack(clip({ ...makeChord('C'), bass: 'H' }))).toBe(false)
    expect(isTrack(clip({ ...makeChord('C'), root: 'H' }))).toBe(false)
  })
})

describe('migrateTrack', () => {
  const old = { ...DEFAULT_TRACK, clips: [{ id: 'a', symbol: 'Dm7', start: 0, length: 1920 }, { id: 'b', symbol: '??', start: 1920, length: 1920 }] }

  it('turns stored chord names into chords, dropping unreadable ones', () => {
    const t = migrateTrack(old) as Track
    expect(isTrack(t)).toBe(true)
    expect(t.clips).toHaveLength(1)
    expect(chordName(t.clips[0].chord!)).toBe('Dm7')
    expect('symbol' in t.clips[0]).toBe(false)
  })

  it('leaves current tracks alone', () => {
    const t = { ...DEFAULT_TRACK, clips: [{ id: 'a', chord: makeChord('C'), start: 0, length: 1 }] }
    expect(migrateTrack(t)).toEqual(t)
  })

  it('migrates every step of a stored undo history', () => {
    const h = readHistory<Track>({ past: [old], present: old, future: [] }, { key: 'track', isValid: isTrack, migrate: (v) => migrateTrack(v) })
    expect(h?.past[0].clips[0].chord).toEqual(makeChord('D', 'm7'))
    expect(readHistory({ past: [old], present: old, future: [] }, { key: 'track', isValid: isTrack })).toBeNull()
  })
})

describe('groove and tempo in the track', () => {
  it('validates them', () => {
    expect(isTrack(oldShape)).toBe(false)
    expect(isTrack({ ...DEFAULT_TRACK, bpm: 10 })).toBe(false)
    expect(isTrack({ ...DEFAULT_TRACK, bpm: 'fast' })).toBe(false)
    expect(isTrack({ ...DEFAULT_TRACK, groove: { ...DEFAULT_GROOVE, swing: 2 } })).toBe(false)
  })

  it("gives every old history entry the session's old groove and tempo", () => {
    const stored = { past: [oldShape, { ...oldShape, bars: 2 }], present: { ...oldShape, bars: 8 }, future: [oldShape] }
    const h = readHistory<Track>(stored, persist())
    expect(h).not.toBeNull()
    for (const t of [...h!.past, h!.present, ...h!.future]) expect(t).toMatchObject({ groove: justChords, bpm: 87 })
    expect(h!.present.bars).toBe(8)
  })

  it('falls back to the defaults without old values', () => {
    expect(migrateTrack(oldShape)).toEqual(DEFAULT_TRACK)
  })

  it('keeps the values entries already have, and round-trips a new history', () => {
    const fast = { ...DEFAULT_TRACK, bpm: 140 }
    const stored = { past: [fast], present: DEFAULT_TRACK, future: [] }
    const h = readHistory<Track>(JSON.parse(JSON.stringify(stored)), persist())
    expect({ past: h!.past, present: h!.present, future: h!.future }).toEqual(stored)
  })

  it('a change that changes nothing returns the same track (so no undo step)', () => {
    const t = DEFAULT_TRACK
    expect(withMusic(t, { bpm: t.bpm })).toBe(t)
    // An equal groove from storage or a re-applied preset: keys in another order, new objects.
    expect(withMusic(t, { groove: JSON.parse(JSON.stringify(t.groove)) })).toBe(t)
    expect(withMusic(t, { groove: applyGroove(t.groove, GROOVES.find((g) => g.id === 'pop')!) })).toBe(t)
    expect(withMusic(t, { bpm: 90 })).toMatchObject({ bpm: 90, groove: t.groove })
    expect(commit(initHistory(t), (x) => withMusic(x, { bpm: t.bpm })).past).toHaveLength(0)
  })

  it('a slider drag is one undo step, and undo restores the sound', () => {
    let h = initHistory(DEFAULT_TRACK)
    h = beginGesture(h)
    for (const volume of [0.5, 0.4, 0.3]) {
      h = updateGesture(h, (t) => withMusic(t, { groove: { ...t.groove, chords: { ...t.groove.chords, volume } } }))
    }
    expect(h.present.groove.chords.volume).toBe(0.3)
    expect(h.past).toHaveLength(1)
    expect(undo(h).present.groove).toBe(DEFAULT_TRACK.groove)
    // Grabbing a slider and letting go in place leaves no step.
    expect(updateGesture(beginGesture(initHistory(DEFAULT_TRACK)), (t) => withMusic(t, { groove: { ...t.groove } })).past).toHaveLength(0)
  })
})
