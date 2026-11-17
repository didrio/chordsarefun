import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * localStorage persistence. Everything is namespaced and versioned. When a stored shape
 * changes, prefer migrating old data on load (see migrateTrack) so saved work survives;
 * bump VERSION only for changes that can't be migrated (old data is then ignored,
 * falling back to defaults).
 */
const VERSION = 1
const storageKey = (key: string) => `chords:v${VERSION}:${key}`

/**
 * Whether the last save worked. Saving failures used to be swallowed, so a full storage silently stopped
 * saving work; now the app shows a warning (`SaveWarning`) until a save succeeds again.
 * - 'full': the browser's storage quota is used up (QuotaExceededError).
 * - 'blocked': storage is unavailable (blocked site data, some private modes).
 */
export type SaveStatus = 'ok' | 'full' | 'blocked'
let saveStatus: SaveStatus = 'ok'
const saveListeners = new Set<() => void>()

function setSaveStatus(next: SaveStatus) {
  if (next === saveStatus) return
  saveStatus = next
  for (const listener of saveListeners) listener()
}

/** What a storage error means for the user: full (they can make room) or blocked (they can't). */
export function saveErrorStatus(error: unknown): SaveStatus {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' ? 'full' : 'blocked'
}

export const getSaveStatus = () => saveStatus

/** The current save status, re-rendering when it changes. */
export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(
    (listener) => {
      saveListeners.add(listener)
      return () => saveListeners.delete(listener)
    },
    getSaveStatus,
  )
}

/** Copy stored values (as they are) from one key prefix to another, e.g. to save a session under a new name. */
export function copyKeys(keys: string[], from: string, to: string) {
  try {
    for (const key of keys) {
      const raw = localStorage.getItem(storageKey(from + key))
      if (raw === null) localStorage.removeItem(storageKey(to + key))
      else localStorage.setItem(storageKey(to + key), raw)
    }
  } catch (error) {
    // Storage full or unavailable: the copy is best effort, but the user should know.
    setSaveStatus(saveErrorStatus(error))
  }
}

/** Remove stored values (e.g. a deleted session). */
export function removeKeys(keys: string[], prefix: string) {
  try {
    for (const key of keys) localStorage.removeItem(storageKey(prefix + key))
  } catch {
    // Unavailable storage: nothing to remove.
  }
}

/** The raw stored string under a key, or null (e.g. to check that a copy arrived intact). */
export function loadRaw(key: string): string | null {
  try {
    return localStorage.getItem(storageKey(key))
  } catch {
    return null
  }
}

/** Store a raw (already JSON) value, e.g. one restored from a backup. Returns false if storage failed (full?). */
export function saveRaw(key: string, raw: string): boolean {
  try {
    localStorage.setItem(storageKey(key), raw)
    setSaveStatus('ok')
    return true
  } catch (error) {
    setSaveStatus(saveErrorStatus(error))
    return false
  }
}

export function load<T>(key: string, fallback: T, isValid: (v: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (raw === null) return fallback
    const value: unknown = JSON.parse(raw)
    return isValid(value) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

/** Store a value. Returns false if storage failed; the app keeps working and shows a warning (see SaveStatus). */
export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value))
    setSaveStatus('ok')
    return true
  } catch (error) {
    setSaveStatus(saveErrorStatus(error))
    return false
  }
}

const sameType = (fallback: unknown) => (v: unknown) => typeof v === typeof fallback && v !== null

/** useState that's saved to localStorage. Values of the wrong type are ignored on load. */
export function usePersistentState<T>(key: string, initial: T, isValid: (v: unknown) => boolean = sameType(initial)) {
  const [value, setValue] = useState<T>(() => load(key, initial, isValid))
  useEffect(() => {
    save(key, value)
  }, [key, value])
  return [value, setValue] as const
}

let askedToKeep = false

/**
 * Ask the browser not to clear this site's storage when space runs low (once per page load, once there's
 * work worth keeping). Chrome decides by itself; Firefox may ask the user once. Best effort: never throws.
 */
export function askToKeepStorage() {
  if (askedToKeep) return
  askedToKeep = true
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!storage?.persist || !storage.persisted) return
  storage
    .persisted()
    .then((kept) => (kept ? kept : storage.persist()))
    .catch(() => {})
}
