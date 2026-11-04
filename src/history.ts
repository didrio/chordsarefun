import { useEffect, useRef, useState } from 'react'
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

type Persist = {
  key: string
  isValid: (value: unknown) => boolean
  /** Upgrades a stored value from an older shape before it's validated. */
  migrate?: (value: unknown) => unknown
}

/** A stored history, with every value migrated; null if it isn't a valid history. */
export function readHistory<T>(stored: unknown, persist: Persist): History<T> | null {
  const s = stored as History<unknown>
  if (typeof s !== 'object' || s === null || !Array.isArray(s.past) || !Array.isArray(s.future)) return null
  const up = persist.migrate ?? ((v: unknown) => v)
  const h = { past: s.past.map(up), present: up(s.present), future: s.future.map(up), gesture: null }
  return [...h.past, h.present, ...h.future].every(persist.isValid) ? (h as History<T>) : null
}

const SAVE_DELAY_MS = 300

/** Undo/redo state. With `persist`, the whole history (not just the present) is saved. */
export function useHistory<T>(initial: T, persist?: Persist) {
  const [h, setH] = useState(() => {
    if (!persist) return initHistory(initial)
    return readHistory<T>(load<unknown>(persist.key, null, () => true), persist) ?? initHistory(initial)
  })

  // Debounced so continuous drags don't write on every pointer move; flushed when the
  // page is closed/hidden, on unmount (switching sessions) and on demand (flush), so
  // the last edit isn't lost.
  const persistKey = persist?.key
  const latest = useRef(h)
  const dirty = useRef(false)
  const write = () => {
    if (!persistKey || !dirty.current) return
    const { past, present, future } = latest.current
    save(persistKey, { past, present, future })
    dirty.current = false
  }
  const writeRef = useRef(write)
  useEffect(() => {
    writeRef.current = write
  })
  useEffect(() => {
    if (!persistKey) return
    latest.current = h
    dirty.current = true
    const id = setTimeout(() => writeRef.current(), SAVE_DELAY_MS)
    const onHide = () => writeRef.current()
    window.addEventListener('pagehide', onHide)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pagehide', onHide)
    }
  }, [h, persistKey])
  useEffect(() => () => writeRef.current(), [])

  return {
    /** Save now (e.g. before copying the saved session). */
    flush: () => writeRef.current(),
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
