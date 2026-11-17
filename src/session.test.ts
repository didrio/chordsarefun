import { beforeEach, describe, expect, it, vi } from 'vitest'
import { load, save } from './persist'
import {
  filterSessions,
  hasWork,
  isAutoName,
  migrateMeta,
  prepareSessions,
  sessionKey,
  sessionMusic,
  sessionPrefix,
  sortSessions,
  uniqueName,
  type SessionMeta,
} from './session'
import { DEFAULT_TRACK } from './track'
import { addSection, insertBlocks, MAIN_SECTION, packSongHistory, sectionTrack, songFromTrack, songTicks, withSectionTrack } from './song'
import { makeChord } from './music/chord'
import { applyGroove, DEFAULT_GROOVE, GROOVES } from './music/grooves'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})

const meta = (name: string, extra: Partial<SessionMeta> = {}): SessionMeta => ({
  id: name,
  name,
  created: 0,
  updated: 0,
  favorite: false,
  folder: null,
  ...extra,
})

/** A stored track history with `n` chords. */
const history = (n: number) => ({
  past: [],
  present: {
    ...DEFAULT_TRACK,
    clips: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, chord: makeChord('C', ''), start: i * 1920, length: 1920 })),
  },
  future: [],
})

describe('session list helpers', () => {
  it('upgrades old entries and drops unreadable ones', () => {
    expect(migrateMeta({ id: 'a', name: 'Song', updated: 5 })).toEqual({
      id: 'a',
      name: 'Song',
      updated: 5,
      created: 5,
      favorite: false,
      folder: null,
    })
    expect(migrateMeta({ id: 'a', name: 'Song' })).toBeNull()
    expect(migrateMeta(null)).toBeNull()
  })

  it('picks names that are not taken', () => {
    expect(uniqueName('Untitled session', [])).toBe('Untitled session')
    expect(uniqueName('Untitled session', ['Untitled session', 'Untitled session 2'])).toBe('Untitled session 3')
    expect(isAutoName('Untitled session 12')).toBe(true)
    expect(isAutoName('Untitled session copy')).toBe(false)
  })

  it('sorts by last edit, name (numbers in order) or creation', () => {
    const list = [meta('Song 10', { updated: 1, created: 3 }), meta('song 2', { updated: 3, created: 1 }), meta('Abc', { updated: 2, created: 2 })]
    expect(sortSessions(list, 'updated').map((s) => s.name)).toEqual(['song 2', 'Abc', 'Song 10'])
    expect(sortSessions(list, 'name').map((s) => s.name)).toEqual(['Abc', 'song 2', 'Song 10'])
    expect(sortSessions(list, 'created').map((s) => s.name)).toEqual(['Song 10', 'Abc', 'song 2'])
  })

  it('filters by view and search', () => {
    const list = [meta('Verse', { favorite: true }), meta('Chorus', { folder: 'f1' }), meta('Bridge')]
    expect(filterSessions(list, 'all').length).toBe(3)
    expect(filterSessions(list, 'favorites').map((s) => s.name)).toEqual(['Verse'])
    expect(filterSessions(list, 'f1').map((s) => s.name)).toEqual(['Chorus'])
    expect(filterSessions(list, 'all', '  rUs ').map((s) => s.name)).toEqual(['Chorus'])
  })
})

describe('prepareSessions', () => {
  it('turns old unsaved work into a listed session, keeping every saved one', () => {
    save('sessions', [{ id: 'keep', name: "Don't Touch", updated: 7 }])
    save('currentSession', null)
    save('track', history(3))
    save('bpm', 97)
    const { sessions, current } = prepareSessions()
    expect(sessions.map((s) => s.name)).toEqual(['Untitled session', "Don't Touch"])
    expect(sessions[1]).toMatchObject({ id: 'keep', created: 7, favorite: false, folder: null })
    // The unsaved work moved to the new session, which is open.
    expect(current).toBe(sessions[0].id)
    expect(load(`${sessionPrefix(current)}bpm`, 0, () => true)).toBe(97)
    expect(load<unknown>('track', null, () => true)).toBeNull()
    // Running again (React StrictMode) changes nothing.
    expect(prepareSessions()).toEqual({ sessions, current })
  })

  it('keeps the current saved session open', () => {
    save('sessions', [{ id: 'a', name: 'A', updated: 1 }])
    save('currentSession', 'a')
    expect(prepareSessions()).toMatchObject({ current: 'a', sessions: [{ id: 'a' }] })
  })

  it('makes a new empty session when there is nothing to open', () => {
    save('track', history(0))
    const { sessions, current } = prepareSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ id: current, name: 'Untitled session' })
  })
})

describe('sessionMusic', () => {
  const funk = applyGroove(DEFAULT_GROOVE, GROOVES.find((g) => g.id === 'funk') ?? GROOVES[1])

  it("hears an old session with the groove and tempo it was saved with", () => {
    const { groove: _g, bpm: _b, ...oldPresent } = history(2).present
    save(`${sessionPrefix('old')}track`, { past: [], present: oldPresent, future: [] })
    save(`${sessionPrefix('old')}groove2`, funk)
    save(`${sessionPrefix('old')}bpm`, 97)
    expect(sessionMusic('old')).toMatchObject({ groove: funk, bpm: 97, names: ['C', 'C'] })
  })

  it('reads them from the track, ignoring stale old values', () => {
    const h = history(1)
    save(`${sessionPrefix('new')}track`, { ...h, present: { ...h.present, groove: funk, bpm: 140 } })
    save(`${sessionPrefix('new')}bpm`, 97)
    expect(sessionMusic('new')).toMatchObject({ groove: funk, bpm: 140 })
  })
})

describe('sessions hold songs', () => {
  /** A saved song (packed, as the workspace saves it): an empty main section and a Chorus with `n` chords in D minor. */
  const song = (n: number) => {
    const base = addSection({ ...songFromTrack(DEFAULT_TRACK), tonic: 'D', mode: 'aeolian' as const, bpm: 101 }, 'chorus', 'Chorus', MAIN_SECTION)
    const clips = history(n).present.clips
    return withSectionTrack(base, 'chorus', { ...sectionTrack(base, 'chorus'), clips })
  }
  const store = (id: string, n: number) => save(`${sessionPrefix(id)}track`, packSongHistory({ past: [], present: song(n), future: [] }))

  it('finds work and the key in any section', () => {
    store('s', 2)
    expect(hasWork('s')).toBe(true)
    expect(sessionKey('s')).toBe('D minor')
    store('blank', 0)
    expect(hasWork('blank')).toBe(false)
    expect(sessionKey('blank')).toBeNull()
  })

  it('plays the section being edited, or the first with chords', () => {
    store('s', 2)
    expect(sessionMusic('s')).toMatchObject({ bpm: 101, names: ['C', 'C'] })
    save(`${sessionPrefix('s')}section`, MAIN_SECTION)
    expect(sessionMusic('s')?.names).toEqual(['C', 'C'])
    store('blank', 0)
    expect(sessionMusic('blank')).toBeNull()
    // Both have chords: the one being edited plays.
    const both = song(1)
    const withMain = withSectionTrack(both, MAIN_SECTION, { ...sectionTrack(both, MAIN_SECTION), clips: [{ id: 'f', chord: makeChord('F', ''), start: 0, length: 1920 }] })
    save(`${sessionPrefix('both')}track`, packSongHistory({ past: [], present: withMain, future: [] }))
    save(`${sessionPrefix('both')}section`, 'chorus')
    expect(sessionMusic('both')?.names).toEqual(['C'])
    save(`${sessionPrefix('both')}section`, MAIN_SECTION)
    expect(sessionMusic('both')?.names).toEqual(['F'])
  })

  it('plays the whole song once parts are arranged, listing its parts', () => {
    const arranged = insertBlocks(insertBlocks(song(2), 0, ['chorus'], ['b1']), 1, ['chorus', MAIN_SECTION], ['b2', 'b3'])
    save(`${sessionPrefix('arr')}track`, packSongHistory({ past: [], present: arranged, future: [] }))
    const m = sessionMusic('arr')!
    expect(m.names).toEqual(['Chorus', 'Chorus', 'Progression'])
    expect(m.segments).toHaveLength(3)
    expect(m.totalTicks).toBe(songTicks(arranged))
    expect(m.bpm).toBe(101)
  })
})

