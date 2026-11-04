import { useState } from 'react'
import { readHistory } from './history'
import { copyKeys, load, removeKeys, save } from './persist'
import { isTrack, migrateTrack, type Track } from './track'
import { chordClips } from './music/timeline'
import { keyName } from './music/theory'

/**
 * Sessions: whole workspaces (chords with their undo history, groove, tempo, view
 * settings, what's selected and which panels are open) saved in the browser.
 *
 * You're always in one session and every change is saved to it as you go. The unsaved
 * session ("scratch") is where you start; "Save as" names the current work as a new
 * session (from scratch, the scratch then starts over empty). Each session's values live
 * under their own key prefix; the scratch uses no prefix, so work from before sessions
 * existed simply is the scratch session.
 */

/** Every stored value that belongs to a session (not global). Keep in sync with the workspace's persisted state. */
export const SESSION_KEYS = [
  'track',
  'bpm',
  'grid',
  'loop',
  'metronome',
  'metronomeVolume',
  'groove2',
  'flavor',
  'notesLaneOpen',
  'selection',
  'inspectorTab',
  'inspected',
  'panelOpen',
]

export type SessionMeta = { id: string; name: string; updated: number }

/** Storage key prefix for a session; null = the unsaved (scratch) session. */
export const sessionPrefix = (id: string | null) => (id === null ? '' : `session:${id}:`)

const isMetaList = (v: unknown) =>
  Array.isArray(v) &&
  v.every((m) => typeof m?.id === 'string' && typeof m?.name === 'string' && typeof m?.updated === 'number')

/** A one-line summary of a stored session: "4 chords · C major", or null if it's empty. */
export function sessionSummary(id: string | null): string | null {
  const h = readHistory<Track>(load<unknown>(`${sessionPrefix(id)}track`, null, () => true), {
    key: '',
    isValid: isTrack,
    migrate: migrateTrack,
  })
  if (!h) return null
  const n = chordClips(h.present.clips).length
  if (h.present.clips.length === 0) return null
  return `${n} ${n === 1 ? 'chord' : 'chords'} · ${keyName(h.present.tonic, h.present.mode)}`
}

/** The session list and the current session, saved globally (not per session). */
export function useSessions() {
  const [sessions, setSessionsState] = useState<SessionMeta[]>(() => load('sessions', [], isMetaList))
  const [current, setCurrentState] = useState<string | null>(() => {
    const id = load<string | null>('currentSession', null, (v) => v === null || typeof v === 'string')
    return id !== null && sessions.some((s) => s.id === id) ? id : null
  })
  const setSessions = (next: SessionMeta[]) => {
    setSessionsState(next)
    save('sessions', next)
  }
  const open = (id: string | null) => {
    setCurrentState(id)
    save('currentSession', id)
  }
  return {
    sessions,
    current,
    currentName: sessions.find((s) => s.id === current)?.name ?? null,
    open,
    /** Save the current session's values under a new name and switch to it. Returns the new id. */
    saveAs(name: string) {
      const id = crypto.randomUUID()
      copyKeys(SESSION_KEYS, sessionPrefix(current), sessionPrefix(id))
      setSessions([{ id, name, updated: Date.now() }, ...sessions])
      return id
    },
    /** A new, empty session (defaults load for every value). Returns its id; the caller opens it. */
    create(): string {
      const id = crypto.randomUUID()
      const names = new Set(sessions.map((s) => s.name))
      let n = 1
      while (names.has(n === 1 ? 'Untitled session' : `Untitled session ${n}`)) n++
      setSessions([{ id, name: n === 1 ? 'Untitled session' : `Untitled session ${n}`, updated: Date.now() }, ...sessions])
      return id
    },
    /** Copy a session (null = the unsaved one) as "<name> copy". Doesn't switch to it. */
    duplicate(id: string | null) {
      const name = id === null ? 'Unsaved session' : sessions.find((s) => s.id === id)?.name
      if (name === undefined) return
      const copy = crypto.randomUUID()
      copyKeys(SESSION_KEYS, sessionPrefix(id), sessionPrefix(copy))
      setSessions([{ id: copy, name: `${name} copy`, updated: Date.now() }, ...sessions])
    },
    rename(id: string, name: string) {
      setSessions(sessions.map((s) => (s.id === id ? { ...s, name } : s)))
    },
    remove(id: string) {
      removeKeys(SESSION_KEYS, sessionPrefix(id))
      setSessions(sessions.filter((s) => s.id !== id))
      if (current === id) open(null)
    },
    /** Note that the current (named) session changed, for "last edited" in the list. */
    touch() {
      if (current === null) return
      const now = Date.now()
      setSessionsState((list) => {
        const next = list.map((s) => (s.id === current ? { ...s, updated: now } : s))
        save('sessions', next)
        return next
      })
    },
  }
}

export type Sessions = ReturnType<typeof useSessions>

/** Forget the scratch session's values, so it starts over (after it was saved under a name). */
export const clearScratch = () => removeKeys(SESSION_KEYS, sessionPrefix(null))
