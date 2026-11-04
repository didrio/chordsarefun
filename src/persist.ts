import { useEffect, useState } from 'react'

/**
 * localStorage persistence. Everything is namespaced and versioned. When a stored shape
 * changes, prefer migrating old data on load (see migrateTrack) so saved work survives;
 * bump VERSION only for changes that can't be migrated (old data is then ignored,
 * falling back to defaults).
 */
const VERSION = 1
const storageKey = (key: string) => `chords:v${VERSION}:${key}`

/** Copy stored values (as they are) from one key prefix to another, e.g. to save a session under a new name. */
export function copyKeys(keys: string[], from: string, to: string) {
  try {
    for (const key of keys) {
      const raw = localStorage.getItem(storageKey(from + key))
      if (raw === null) localStorage.removeItem(storageKey(to + key))
      else localStorage.setItem(storageKey(to + key), raw)
    }
  } catch {
    // Storage full or unavailable: the copy is best effort.
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

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value))
  } catch {
    // Storage full or unavailable (e.g. private mode): keep working without saving.
  }
}

const sameType = (fallback: unknown) => (v: unknown) => typeof v === typeof fallback && v !== null

/** useState that's saved to localStorage. Values of the wrong type are ignored on load. */
export function usePersistentState<T>(key: string, initial: T, isValid: (v: unknown) => boolean = sameType(initial)) {
  const [value, setValue] = useState<T>(() => load(key, initial, isValid))
  useEffect(() => save(key, value), [key, value])
  return [value, setValue] as const
}
