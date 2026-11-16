import { describe, expect, it } from 'vitest'
import { makeBackup, planImport, readBackup } from './backup'
import type { SessionMeta } from './session'
import { DEFAULT_TRACK } from './track'
import { makeChord } from './music/chord'

const track = JSON.stringify({
  past: [],
  present: { ...DEFAULT_TRACK, clips: [{ id: 'c', chord: makeChord('C', ''), start: 0, length: 1920 }] },
  future: [],
})

const backupText = JSON.stringify(
  makeBackup({
    'chords:v1:sessions': JSON.stringify([
      { id: 's1', name: 'Verse', created: 1, updated: 2, favorite: true, folder: 'f1' },
      { id: 's2', name: 'Chorus', updated: 3 },
    ]),
    'chords:v1:folders': JSON.stringify([{ id: 'f1', name: 'Album' }]),
    'chords:v1:session:s1:track': track,
    'chords:v1:session:s1:bpm': '97',
    'chords:v1:session:s2:track': track,
    'chords:v1:track': track, // the old unsaved session
    'other-app:key': 'ignored',
  }),
)

const ids = () => {
  let n = 0
  return () => `new${++n}`
}

const here = (name: string): SessionMeta => ({ id: name, name, created: 0, updated: 0, favorite: false, folder: null })

describe('backups', () => {
  it('reads backup files and bare localStorage copies, nothing else', () => {
    const storage = readBackup(backupText)!
    expect(storage['session:s1:bpm']).toBe('97')
    expect(storage['other-app:key']).toBeUndefined()
    expect(readBackup(JSON.stringify({ 'chords:v1:bpm': '120' }))).toEqual({ bpm: '120' })
    expect(readBackup('not json')).toBeNull()
    expect(readBackup(JSON.stringify({ hello: 'world' }))).toBeNull()
  })

  it('imports every session under a new id, never overwriting', () => {
    const plan = planImport(readBackup(backupText)!, [here('Chorus')], [], ids(), 100)
    expect(plan.sessions.map((s) => s.name)).toEqual(['Verse', 'Chorus (imported)', 'Untitled session'])
    expect(plan.renamed).toBe(1)
    expect(plan.sessions.map((s) => s.id)).toEqual(['new1', 'new3', 'new4'])
    // Favorites, dates and folders come along; the folder is created.
    expect(plan.sessions[0]).toMatchObject({ favorite: true, created: 1, updated: 2, folder: 'new2' })
    expect(plan.folders).toEqual([{ id: 'new2', name: 'Album' }])
    expect(plan.writes).toContainEqual(['session:new1:bpm', '97'])
    expect(plan.writes).toContainEqual(['session:new4:track', track])
    expect(plan.writes.every(([key]) => key.startsWith('session:new'))).toBe(true)
  })

  it('matches folders by name and renames twice-taken names', () => {
    const plan = planImport(
      readBackup(backupText)!,
      [here('Verse'), here('Verse (imported)')],
      [{ id: 'mine', name: 'Album' }],
      ids(),
    )
    expect(plan.sessions[0]).toMatchObject({ name: 'Verse (imported) 2', folder: 'mine' })
    expect(plan.folders).toEqual([])
  })
})
