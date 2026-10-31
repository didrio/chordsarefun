import { useEffect, useState } from 'react'

/**
 * localStorage persistence. Everything is namespaced and versioned; bump VERSION when a
 * stored shape changes incompatibly (old data is then ignored, falling back to defaults).
 */
const VERSION = 1
const storageKey = (key: string) => `chords:v${VERSION}:${key}`

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
