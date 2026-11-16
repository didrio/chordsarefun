import { useEffect, useRef, useState } from 'react'
import { readHistory, type History } from './history'
import { copyKeys, load, loadRaw, removeKeys, save, saveRaw } from './persist'
import { isTrack, migrateTrack, type Track } from './track'
import { chordClips, chordTimes, sigBarTicks } from './music/timeline'
import { DEFAULT_GROOVE, isGrooveSettings, type GrooveSettings } from './music/grooves'
import { chordName } from './music/chord'
import type { SessionMusic } from './music/audio'
import { keyName } from './music/theory'

/**
 * Sessions: whole workspaces (chords with their undo history, groove, tempo, view
 * settings, what's selected and which panels are open) saved in the browser, like DAW
 * projects that always autosave.
 *
 * You're always in one session, and every session is a real, listed one (there's no
 * separate "unsaved" scratch any more: old scratch work is moved into the list on load,
 * see prepareSessions). Sessions can be starred (favorites) and put in folders (one level).
 * Each session's values live under their own key prefix (`session:<id>:`).
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
  'moreOpen',
  'selection',
  'inspectorTab',
  'inspected',
  'panelOpen',
]

export type SessionMeta = {
  id: string
  name: string
  /** When it was made (ms). Sessions saved before this field existed use their last edit. */
  created: number
  /** Last edited (ms). */
  updated: number
  favorite: boolean
  /** The folder it's in, or null (folders are one level deep). */
  folder: string | null
}

export type Folder = { id: string; name: string }

export type SessionSort = 'updated' | 'name' | 'created'

export const SESSION_SORTS: { key: SessionSort; label: string }[] = [
  { key: 'updated', label: 'Last edited' },
  { key: 'name', label: 'Name' },
  { key: 'created', label: 'Date created' },
]

/** Which sessions the browser shows: all, the starred ones, or one folder (by id). */
export type SessionView = 'all' | 'favorites' | string

/** Storage key prefix for a session; null = the old unsaved (scratch) session, only read when migrating. */
export const sessionPrefix = (id: string | null) => (id === null ? '' : `session:${id}:`)

/** A stored session entry, old shapes included ({ id, name, updated } before folders), or null if unreadable. */
export function migrateMeta(v: unknown): SessionMeta | null {
  const m = v as Partial<SessionMeta> | null
  if (typeof m !== 'object' || m === null) return null
  if (typeof m.id !== 'string' || typeof m.name !== 'string' || typeof m.updated !== 'number') return null
  return {
    id: m.id,
    name: m.name,
    updated: m.updated,
    created: typeof m.created === 'number' ? m.created : m.updated,
    favorite: m.favorite === true,
    folder: typeof m.folder === 'string' ? m.folder : null,
  }
}

const isFolderList = (v: unknown) =>
  Array.isArray(v) && v.every((f) => typeof f?.id === 'string' && typeof f?.name === 'string')

const isSort = (v: unknown) => SESSION_SORTS.some((s) => s.key === v)

const AUTO_NAME = 'Untitled session'

/** True for the names new sessions get ("Untitled session", "Untitled session 3"). */
export const isAutoName = (name: string) => /^Untitled session( \d+)?$/.test(name)

/** `base`, or "base 2", "base 3", … whichever isn't taken yet. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken)
  let n = 1
  while (names.has(n === 1 ? base : `${base} ${n}`)) n++
  return n === 1 ? base : `${base} ${n}`
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Sessions in the chosen order: last edited or newest first, or by name (A–Z, "Song 2" before "Song 10"). */
export function sortSessions(list: SessionMeta[], sort: SessionSort): SessionMeta[] {
  const sorted = [...list]
  if (sort === 'name') sorted.sort((a, b) => byName.compare(a.name, b.name) || b.updated - a.updated)
  else if (sort === 'created') sorted.sort((a, b) => b.created - a.created)
  else sorted.sort((a, b) => b.updated - a.updated)
  return sorted
}

/** The sessions a view shows, narrowed to names containing `query` (any case). */
export function filterSessions(list: SessionMeta[], view: SessionView, query = ''): SessionMeta[] {
  const q = query.trim().toLocaleLowerCase()
  return list.filter(
    (s) =>
      (view === 'all' || (view === 'favorites' ? s.favorite : s.folder === view)) &&
      (!q || s.name.toLocaleLowerCase().includes(q)),
  )
}

const TRACK_HISTORY = { key: '', isValid: isTrack, migrate: migrateTrack }

const readTrack = (id: string | null): History<Track> | null =>
  readHistory<Track>(load<unknown>(`${sessionPrefix(id)}track`, null, () => true), TRACK_HISTORY)

/** True if a stored track (with its history) has any work in it: chords, or anything to undo/redo. */
export function trackHasWork(stored: unknown): boolean {
  const h = readHistory<Track>(stored, TRACK_HISTORY)
  return !!h && (h.present.clips.length > 0 || h.past.length > 0 || h.future.length > 0)
}

/** True if a stored session has any work in it. */
export const hasWork = (id: string | null) => trackHasWork(load<unknown>(`${sessionPrefix(id)}track`, null, () => true))

/** A one-line summary of a stored session: "4 chords · C major", or null if it's empty. */
export function sessionSummary(id: string): string | null {
  const h = readTrack(id)
  if (!h || h.present.clips.length === 0) return null
  const n = chordClips(h.present.clips).length
  return `${n} ${n === 1 ? 'chord' : 'chords'} · ${keyName(h.present.tonic, h.present.mode)}`
}

/**
 * Everything needed to hear a stored session as its Play button plays it (its track, tempo
 * and groove, read the way the workspace reads them), plus its chord names in order; null
 * if it has no chords.
 */
export function sessionMusic(id: string): (SessionMusic & { names: string[] }) | null {
  const h = readTrack(id)
  if (!h || chordClips(h.present.clips).length === 0) return null
  const { clips, bars, sig } = h.present
  const bpm = load(`${sessionPrefix(id)}bpm`, 120, (v) => typeof v === 'number' && v > 0)
  const groove = load<GrooveSettings>(`${sessionPrefix(id)}groove2`, DEFAULT_GROOVE, isGrooveSettings)
  return {
    clips,
    totalTicks: bars * sigBarTicks(sig),
    sig,
    bpm,
    groove,
    names: chordTimes(clips, bpm).map((c) => chordName(c.chord)),
  }
}

const newMeta = (name: string, folder: string | null = null): SessionMeta => {
  const now = Date.now()
  return { id: crypto.randomUUID(), name, created: now, updated: now, favorite: false, folder }
}

export type SessionState = { sessions: SessionMeta[]; current: string }

/**
 * Load the session list, upgrading old data, so there's always a current, listed session:
 * - old entries get their new fields (migrateMeta), every session is kept as it was;
 * - work in the old unsaved (scratch) session becomes a listed "Untitled session" (copied
 *   to its own prefix, checked, then the scratch keys are removed), opened if it was current;
 * - with nothing to open, a new empty session is made.
 * Idempotent: the result is saved, so running it again (React StrictMode) changes nothing.
 */
export function prepareSessions(): SessionState {
  const stored = load<unknown[]>('sessions', [], Array.isArray)
  let sessions = stored.map(migrateMeta).filter((m): m is SessionMeta => m !== null)
  let current = load<string | null>('currentSession', null, (v) => v === null || typeof v === 'string')
  const valid = (id: string | null) => id !== null && sessions.some((s) => s.id === id)

  if (hasWork(null)) {
    const meta = newMeta(uniqueName(AUTO_NAME, sessions.map((s) => s.name)))
    const scratchTrack = loadRaw(sessionPrefix(null) + 'track')
    copyKeys(SESSION_KEYS, sessionPrefix(null), sessionPrefix(meta.id))
    // Only forget the scratch once its work is safely under the new session.
    if (loadRaw(sessionPrefix(meta.id) + 'track') === scratchTrack) {
      sessions = [meta, ...sessions]
      removeKeys(SESSION_KEYS, sessionPrefix(null))
      if (!valid(current)) current = meta.id
    }
  } else {
    // An empty scratch: nothing worth keeping (it's never read again).
    removeKeys(SESSION_KEYS, sessionPrefix(null))
  }

  if (!valid(current)) {
    const meta = newMeta(uniqueName(AUTO_NAME, sessions.map((s) => s.name)))
    sessions = [meta, ...sessions]
    current = meta.id
  }
  save('sessions', sessions)
  save('currentSession', current)
  return { sessions, current: current! }
}

/**
 * True if leaving this session should throw it away: a new session that was never used
 * (its automatic name, not starred, no chords and nothing to undo), so "+ New session"
 * and switching around don't fill the list with empty "Untitled session N"s.
 */
const isBlank = (meta: SessionMeta | undefined) =>
  !!meta && isAutoName(meta.name) && !meta.favorite && !hasWork(meta.id)

/** The session list, folders, sort and current session, saved globally (not per session). */
export function useSessions() {
  const [state, setState] = useState(prepareSessions)
  const [folders, setFoldersState] = useState<Folder[]>(() => load('folders', [], isFolderList))
  const [sort, setSortState] = useState<SessionSort>(() => load('sessionSort', 'updated', isSort))
  /**
   * Sessions whose stored values should be removed once the workspace showing them has
   * unmounted (it saves its history on unmount, which would write them back).
   */
  const pendingRemoval = useRef<string[]>([])
  useEffect(() => {
    const ids = pendingRemoval.current.filter((id) => id !== state.current)
    pendingRemoval.current = pendingRemoval.current.filter((id) => id === state.current)
    for (const id of ids) removeKeys(SESSION_KEYS, sessionPrefix(id))
  }, [state])

  const { sessions, current } = state
  const commit = (next: SessionState) => {
    setState(next)
    save('sessions', next.sessions)
    save('currentSession', next.current)
  }
  const setSessions = (list: SessionMeta[]) => commit({ sessions: list, current })
  const setFolders = (next: Folder[]) => {
    setFoldersState(next)
    save('folders', next)
  }

  /** The list after leaving the current session for `next` (a blank one is thrown away). */
  const leaving = (list: SessionMeta[], next: string) => {
    if (next === current || !isBlank(list.find((s) => s.id === current))) return list
    pendingRemoval.current.push(current)
    return list.filter((s) => s.id !== current)
  }

  return {
    sessions,
    current,
    currentName: sessions.find((s) => s.id === current)?.name ?? AUTO_NAME,
    folders,
    sort,
    setSort(next: SessionSort) {
      setSortState(next)
      save('sessionSort', next)
    },
    /** Switch to a session. Save the workspace first (the caller flushes). */
    open(id: string) {
      if (id === current || !sessions.some((s) => s.id === id)) return
      commit({ sessions: leaving(sessions, id), current: id })
    },
    /** Make a new, empty session (in `folder`, if given) and open it. */
    create(folder: string | null = null) {
      const meta = newMeta(AUTO_NAME)
      const rest = leaving(sessions, meta.id)
      meta.name = uniqueName(AUTO_NAME, rest.map((s) => s.name))
      meta.folder = folders.some((f) => f.id === folder) ? folder : null
      commit({ sessions: [meta, ...rest], current: meta.id })
    },
    /** Copy a session as "<name> copy" in the same folder. Doesn't switch to it. Returns the copy's id. */
    duplicate(id: string): string | null {
      const source = sessions.find((s) => s.id === id)
      if (!source) return null
      const meta = newMeta(
        uniqueName(`${source.name} copy`, sessions.map((s) => s.name)),
        source.folder,
      )
      copyKeys(SESSION_KEYS, sessionPrefix(id), sessionPrefix(meta.id))
      setSessions([meta, ...sessions])
      return meta.id
    },
    rename(id: string, name: string) {
      const trimmed = name.trim()
      if (!trimmed) return
      setSessions(sessions.map((s) => (s.id === id ? { ...s, name: trimmed } : s)))
    },
    toggleFavorite(id: string) {
      setSessions(sessions.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s)))
    },
    moveToFolder(id: string, folder: string | null) {
      setSessions(sessions.map((s) => (s.id === id ? { ...s, folder } : s)))
    },
    /**
     * Delete a session and its saved values. Deleting the open one opens the most recently
     * edited other session, or a new empty one if it was the last.
     */
    remove(id: string) {
      const rest = sessions.filter((s) => s.id !== id)
      if (rest.length === sessions.length) return
      if (id !== current) {
        removeKeys(SESSION_KEYS, sessionPrefix(id))
        return setSessions(rest)
      }
      pendingRemoval.current.push(id)
      const next = sortSessions(rest, 'updated')[0]
      if (next) return commit({ sessions: rest, current: next.id })
      const meta = newMeta(AUTO_NAME)
      commit({ sessions: [meta], current: meta.id })
    },
    /** A new folder; returns its id. */
    createFolder(name: string): string {
      const id = crypto.randomUUID()
      setFolders([...folders, { id, name: name.trim() || uniqueName('New folder', folders.map((f) => f.name)) }])
      return id
    },
    renameFolder(id: string, name: string) {
      const trimmed = name.trim()
      if (!trimmed) return
      setFolders(folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)))
    },
    /** Delete a folder; its sessions are kept and go back to having no folder. */
    removeFolder(id: string) {
      setFolders(folders.filter((f) => f.id !== id))
      setSessions(sessions.map((s) => (s.folder === id ? { ...s, folder: null } : s)))
    },
    /**
     * Add sessions from a backup (see backup.ts planImport: new ids, nothing overwritten).
     * Returns false, adding nothing, if the browser's storage is full.
     */
    importSessions(plan: { sessions: SessionMeta[]; folders: Folder[]; writes: [string, string][] }): boolean {
      for (const [key, raw] of plan.writes) {
        if (!saveRaw(key, raw)) {
          for (const s of plan.sessions) removeKeys(SESSION_KEYS, sessionPrefix(s.id))
          return false
        }
      }
      setFolders([...folders, ...plan.folders])
      setSessions([...plan.sessions, ...sessions])
      return true
    },
    /** Note that the current session changed, for "last edited" in the list. */
    touch() {
      const now = Date.now()
      setState((s) => {
        const next = { ...s, sessions: s.sessions.map((m) => (m.id === s.current ? { ...m, updated: now } : m)) }
        save('sessions', next.sessions)
        return next
      })
    },
  }
}

export type Sessions = ReturnType<typeof useSessions>
