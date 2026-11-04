import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { HeldChord } from '../music/timeline'
import { copyKey, freeKey } from '../platform'
import type { ClickMods } from '../selection'

export type DragState = {
  held: HeldChord
  x: number
  y: number
  /** Pointer position on the track in ticks, or null when not over the track. */
  overTicks: number | null
  /** ⌘ (Mac) / Alt held: ignore the grid. */
  free: boolean
  /** Option (Mac) / Ctrl held: copy existing clips instead of moving them. */
  copy: boolean
}

type Options = {
  trackRef: RefObject<HTMLDivElement | null>
  totalTicks: number
  onDrop: (state: DragState) => void
  /** Pointer went down and up without moving: treat as a click (with Shift / ⌘-Ctrl state). */
  onClick: (held: HeldChord, mods: ClickMods) => void
}

const DRAG_THRESHOLD_PX = 4
/** How far above/below the track still counts as "over" it. */
const TRACK_MARGIN_PX = 48

/**
 * Pointer-based drag for chords (palette chords and existing clips share it).
 * Uses window listeners so a drag can start in the palette and end on the track.
 */
export function useChordDrag(options: Options) {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })
  const [drag, setDrag] = useState<DragState | null>(null)

  const begin = (held: HeldChord, e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const mods: ClickMods = { shift: e.shiftKey, toggle: e.metaKey || e.ctrlKey }
    const originX = e.clientX
    const originY = e.clientY
    let state: DragState | null = null

    const overTicks = (x: number, y: number) => {
      const r = optionsRef.current.trackRef.current?.getBoundingClientRect()
      if (!r || y < r.top - TRACK_MARGIN_PX || y > r.bottom + TRACK_MARGIN_PX) return null
      if (x < r.left - TRACK_MARGIN_PX || x > r.right + TRACK_MARGIN_PX) return null
      return Math.min(Math.max((x - r.left) / r.width, 0), 0.9999) * optionsRef.current.totalTicks
    }

    const move = (ev: PointerEvent) => {
      if (!state && Math.hypot(ev.clientX - originX, ev.clientY - originY) < DRAG_THRESHOLD_PX) return
      const x = ev.clientX
      const y = ev.clientY
      state = { held, x, y, overTicks: overTicks(x, y), free: freeKey(ev), copy: copyKey(ev) }
      setDrag(state)
    }
    // Pressing or releasing a modifier mid-drag updates the preview without moving.
    const onModifier = (ev: KeyboardEvent) => {
      if (!state || !['Alt', 'Control', 'Meta'].includes(ev.key)) return
      state = { ...state, free: freeKey(ev), copy: copyKey(ev) }
      setDrag(state)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keydown', onModifier)
      window.removeEventListener('keyup', onModifier)
      setDrag(null)
    }
    const up = () => {
      cleanup()
      if (state) optionsRef.current.onDrop(state)
      else optionsRef.current.onClick(held, mods)
    }
    const cancel = () => cleanup()
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.stopPropagation()
      cleanup()
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keydown', onModifier)
    window.addEventListener('keyup', onModifier)
  }

  return { drag, begin }
}
