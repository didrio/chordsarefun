import { useEffect, useState } from 'react'
import { load, save } from './persist'

/**
 * Undo/redo history. Pure transitions (tested) plus a small hook.
 *
 * Two ways to change the value:
 * - `commit`: a discrete edit, one undo step.
 * - `beginGesture` + `updateGesture`: a continuous edit (e.g. dragging a clip edge) that
 *   updates the value many times but becomes a single undo step, recorded on its first
 *   actual change (a gesture that changes nothing leaves no step).
 */

const LIMIT = 100

export type History<T> = {
  past: T[]
  present: T
  future: T[]
  /** 'pending': gesture started, nothing recorded yet. 'open': its undo step exists. */
  gesture: 'pending' | 'open' | null
}

export const initHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [], gesture: null })

const push = <T,>(h: History<T>, next: T): History<T> => ({
  past: [...h.past, h.present].slice(-LIMIT),
  present: next,
  future: [],
  gesture: null,
})

export function commit<T>(h: History<T>, update: (value: T) => T): History<T> {
  const next = update(h.present)
  return next === h.present ? h : push(h, next)
}

export function beginGesture<T>(h: History<T>): History<T> {
  return { ...h, gesture: 'pending' }
}

export function updateGesture<T>(h: History<T>, update: (value: T) => T): History<T> {
  const next = update(h.present)
  if (next === h.present) return h
  if (h.gesture === 'open') return { ...h, present: next }
  return { ...push(h, next), gesture: 'open' }
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    gesture: null,
  }
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
    gesture: null,
  }
}

type Persist = { key: string; isValid: (value: unknown) => boolean }

const SAVE_DELAY_MS = 300

/** Undo/redo state. With `persist`, the whole history (not just the present) is saved. */
export function useHistory<T>(initial: T, persist?: Persist) {
  const [h, setH] = useState(() => {
    if (!persist) return initHistory(initial)
    const isHistory = (v: unknown) => {
      const s = v as History<T>
      return (
        typeof s === 'object' &&
        s !== null &&
        Array.isArray(s.past) &&
        Array.isArray(s.future) &&
        [...s.past, s.present, ...s.future].every(persist.isValid)
      )
    }
    const stored = load<History<T> | null>(persist.key, null, isHistory)
    return stored ? { ...stored, gesture: null } : initHistory(initial)
  })

  // Debounced so continuous drags don't write on every pointer move; flushed when the
  // page is closed/hidden so the last edit isn't lost.
  const persistKey = persist?.key
  useEffect(() => {
    if (!persistKey) return
    const write = () => save(persistKey, { past: h.past, present: h.present, future: h.future })
    const id = setTimeout(write, SAVE_DELAY_MS)
    window.addEventListener('pagehide', write)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pagehide', write)
    }
  }, [h, persistKey])

  return {
    value: h.present,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    commit: (update: (value: T) => T) => setH((s) => commit(s, update)),
    beginGesture: () => setH(beginGesture),
    updateGesture: (update: (value: T) => T) => setH((s) => updateGesture(s, update)),
    undo: () => setH(undo),
    redo: () => setH(redo),
  }
}
