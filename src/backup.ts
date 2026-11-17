import { downloadFile } from './download'
import { migrateMeta, SESSION_KEYS, sessionPrefix, songHasWork, uniqueName, type Folder, type SessionMeta } from './session'

/**
 * Backups: every session (chords, undo history, groove, settings, folders, favorites) in
 * one JSON file, to download and import again any time.
 *
 * The file is a plain copy of the app's stored values ({ "chords:v1:<key>": "<raw JSON>" }),
 * so it can hold anything the app saves, and a copy of localStorage made by hand (from the
 * browser console) imports the same way. Old data inside it (the old unsaved session,
 * sessions from before folders) is upgraded on import like on load.
 *
 * Importing never overwrites: every imported session gets a new id, and a name that's
 * already taken becomes "Name (imported)". Folders are matched by name.
 */

const STORAGE_PREFIX = 'chords:v1:'

export type Backup = {
  app: 'chords'
  kind: 'backup'
  version: 1
  /** ISO date of the export. */
  exported: string
  /** Stored values by their full localStorage key. */
  storage: Record<string, string>
}

/** Every value the app has stored in this browser (all sessions and global settings). */
export function collectStorage(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(STORAGE_PREFIX)) out[key] = localStorage.getItem(key) ?? ''
    }
  } catch {
    // Storage unavailable: an empty backup.
  }
  return out
}

export const makeBackup = (storage: Record<string, string>, now = new Date()): Backup => ({
  app: 'chords',
  kind: 'backup',
  version: 1,
  exported: now.toISOString(),
  storage,
})

/** "chords-backup-2026-11-16.json" */
export const backupFilename = (now = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `chords-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/** Download a backup of everything as one file. */
export function downloadBackup() {
  downloadFile(JSON.stringify(makeBackup(collectStorage())), 'application/json', backupFilename())
}

/**
 * The stored values in a backup file's text, keyed without the "chords:v1:" prefix, or
 * null if it isn't one. Also accepts a bare { "chords:v1:…": "…" } copy of localStorage.
 */
export function readBackup(text: string): Record<string, string> | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const d = data as Partial<Backup>
  const storage = d.kind === 'backup' && typeof d.storage === 'object' && d.storage !== null ? d.storage : data
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(storage as Record<string, unknown>)) {
    if (key.startsWith(STORAGE_PREFIX) && typeof raw === 'string') out[key.slice(STORAGE_PREFIX.length)] = raw
  }
  return Object.keys(out).length > 0 ? out : null
}

const parse = (raw: string | undefined): unknown => {
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export type ImportPlan = {
  /** New list entries, with new ids. */
  sessions: SessionMeta[]
  /** Folders to add (ones whose name doesn't exist yet). */
  folders: Folder[]
  /** Values to store: [key without prefix, raw JSON]. */
  writes: [string, string][]
  /** How many names were taken and got "(imported)". */
  renamed: number
}

/**
 * What importing a backup (readBackup) adds next to the sessions and folders already
 * here. Nothing existing changes: new ids, taken names get "(imported)", folders are
 * matched by name (made if missing), favorites and dates are kept.
 */
export function planImport(
  storage: Record<string, string>,
  existing: SessionMeta[],
  existingFolders: Folder[],
  newId: () => string = () => crypto.randomUUID(),
  now = Date.now(),
): ImportPlan {
  const listed = (Array.isArray(parse(storage.sessions)) ? (parse(storage.sessions) as unknown[]) : [])
    .map(migrateMeta)
    .filter((m): m is SessionMeta => m !== null)
  const backupFolders = new Map<string, string>()
  const storedFolders = parse(storage.folders)
  if (Array.isArray(storedFolders)) {
    for (const f of storedFolders) if (typeof f?.id === 'string' && typeof f?.name === 'string') backupFolders.set(f.id, f.name)
  }

  // Sources: listed sessions, plus the old unsaved session if it has work.
  const sources: { meta: SessionMeta; prefix: string }[] = listed.map((meta) => ({ meta, prefix: sessionPrefix(meta.id) }))
  if (songHasWork(parse(storage.track))) {
    sources.push({
      meta: { id: '', name: 'Untitled session', created: now, updated: now, favorite: false, folder: null },
      prefix: sessionPrefix(null),
    })
  }

  const taken = new Set(existing.map((s) => s.name))
  const folders: Folder[] = []
  const folderIdFor = (backupFolder: string | null): string | null => {
    const name = backupFolder === null ? undefined : backupFolders.get(backupFolder)
    if (name === undefined) return null
    const match = [...existingFolders, ...folders].find((f) => f.name === name)
    if (match) return match.id
    const folder = { id: newId(), name }
    folders.push(folder)
    return folder.id
  }

  const sessions: SessionMeta[] = []
  const writes: [string, string][] = []
  let renamed = 0
  for (const { meta, prefix } of sources) {
    const id = newId()
    let name = meta.name
    if (taken.has(name)) {
      name = uniqueName(`${meta.name} (imported)`, taken)
      renamed++
    }
    taken.add(name)
    sessions.push({ ...meta, id, name, folder: folderIdFor(meta.folder) })
    for (const key of SESSION_KEYS) {
      const raw = storage[prefix + key]
      if (raw !== undefined) writes.push([sessionPrefix(id) + key, raw])
    }
  }
  return { sessions, folders, writes, renamed }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * A backup file's text read and planned for import (readBackup + planImport), with what to tell the user: a
 * plan and "Imported 3 sessions.", or why nothing can be imported. Shared by the sessions window and the
 * installed app's welcome. The caller stores the plan (`importSessions`), which can still fail on full storage.
 */
export function readImport(
  text: string,
  existing: SessionMeta[],
  existingFolders: Folder[],
): { plan: ImportPlan; message: string } | { plan: null; message: string } {
  const storage = readBackup(text)
  if (!storage) return { plan: null, message: "That file isn't a sessions backup." }
  const plan = planImport(storage, existing, existingFolders)
  if (plan.sessions.length === 0) return { plan: null, message: 'No sessions in that backup.' }
  return {
    plan,
    message:
      `Imported ${plural(plan.sessions.length, 'session')}` +
      (plan.renamed ? ` (${plan.renamed} renamed "(imported)": the name was taken).` : '.'),
  }
}

/** What to say when storage refused an import. */
export const IMPORT_FULL = "Not enough room in this browser's storage to import it."
