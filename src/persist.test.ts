import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readHistory } from './history'
import { chordName, makeChord } from './music/chord'
import { load, save } from './persist'
import { DEFAULT_TRACK, isTrack, migrateTrack, type Track } from './track'

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
})

const always = () => true

describe('persist', () => {
  it('round-trips values', () => {
    save('bpm', 97)
    expect(load('bpm', 120, (v) => typeof v === 'number')).toBe(97)
  })

  it('falls back when missing, invalid, or corrupt', () => {
    expect(load('missing', 'x', always)).toBe('x')
    save('bpm', 'fast')
    expect(load('bpm', 120, (v) => typeof v === 'number')).toBe(120)
    localStorage.setItem('chords:v1:broken', '{not json')
    expect(load('broken', 1, always)).toBe(1)
  })

  it('keeps working if storage throws (e.g. full or private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('full')
      },
    })
    expect(() => save('x', 1)).not.toThrow()
    expect(load('x', 2, always)).toBe(2)
  })
})

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
    const h = readHistory<Track>({ past: [old], present: old, future: [] }, { key: 'track', isValid: isTrack, migrate: migrateTrack })
    expect(h?.past[0].clips[0].chord).toEqual(makeChord('D', 'm7'))
    expect(readHistory({ past: [old], present: old, future: [] }, { key: 'track', isValid: isTrack })).toBeNull()
  })
})
