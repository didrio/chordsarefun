import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { BlockDragSource } from '../dropLabel'
import { copyKey } from '../platform'
import type { ClickMods } from '../selection'
import { blockGap } from '../song'

export type BlockDrag = {
  source: BlockDragSource
  x: number
  y: number
  /** Where it would land (see blockGap), or null when the pointer isn't over the song lane. */
  gap: number | null
  /** Option (Mac) / Ctrl held while moving blocks: copy them (linked) instead. */
  copy: boolean
}

type Options = {
  /** The song lane (blocks); null while the Song panel is collapsed. */
  laneRef: RefObject<HTMLDivElement | null>
  /** How many ticks the lane's full width stands for. */
  scaleTicks: number
  spans: { start: number; length: number }[]
  onDrop: (drag: BlockDrag & { gap: number }) => void
  /** Pointer went down and up on a block without moving: a click (with Shift / ⌘-Ctrl state). */
  onClick?: (mods: ClickMods) => void
}

const DRAG_THRESHOLD_PX = 4
/** How far above/below the lane still counts as over it. */
const LANE_MARGIN_PX = 40

/**
 * Pointer drag onto the song timeline: a section chip (adds it) or blocks (moves them, or
 * copies them with Option/Ctrl). Much simpler than the chord drag: the song has no grid,
 * gaps or lengths to fit, only an order, so the target is a gap between blocks.
 */
export function useBlockDrag(options: Options) {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })
  const [drag, setDrag] = useState<BlockDrag | null>(null)
  /** Set as a drag ends, until the events of that same release are handled: the click a chip may still get is ignored. */
  const dragEnding = useRef(false)
  const endDrag = () => {
    dragEnding.current = true
    window.setTimeout(() => (dragEnding.current = false))
  }

  const begin = (source: BlockDragSource, e: ReactPointerEvent, onClick?: (mods: ClickMods) => void) => {
    if (e.button !== 0) return
    const mods: ClickMods = { shift: e.shiftKey, toggle: e.metaKey || e.ctrlKey }
    const originX = e.clientX
    const originY = e.clientY
    let state: BlockDrag | null = null

    const gapAt = (x: number, y: number) => {
      const r = optionsRef.current.laneRef.current?.getBoundingClientRect()
      if (!r || y < r.top - LANE_MARGIN_PX || y > r.bottom + LANE_MARGIN_PX || x < r.left - LANE_MARGIN_PX || x > r.right + LANE_MARGIN_PX) {
        return null
      }
      const { spans, scaleTicks } = optionsRef.current
      return blockGap(spans, Math.min(Math.max((x - r.left) / r.width, 0), 1) * scaleTicks)
    }
    const update = (x: number, y: number, copy: boolean) => {
      state = { source, x, y, gap: gapAt(x, y), copy: source.kind === 'move' && copy }
      setDrag(state)
    }
    const move = (ev: PointerEvent) => {
      if (!state && Math.hypot(ev.clientX - originX, ev.clientY - originY) < DRAG_THRESHOLD_PX) return
      update(ev.clientX, ev.clientY, copyKey(ev))
    }
    // Pressing or releasing the copy key mid-drag updates the label without moving.
    const onModifier = (ev: KeyboardEvent) => {
      if (state && ['Alt', 'Control'].includes(ev.key)) update(state.x, state.y, copyKey(ev))
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cleanup)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keydown', onModifier)
      window.removeEventListener('keyup', onModifier)
      setDrag(null)
    }
    const up = () => {
      cleanup()
      const done: BlockDrag | null = state
      if (!done) return (onClick ?? optionsRef.current.onClick)?.(mods)
      endDrag()
      if (done.gap !== null) optionsRef.current.onDrop({ ...done, gap: done.gap })
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !state) return
      ev.stopPropagation()
      endDrag()
      cleanup()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cleanup)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keydown', onModifier)
    window.addEventListener('keyup', onModifier)
  }

  /** Whether a click that just arrived is the end of a drag (to ignore it). */
  const justDragged = () => dragEnding.current

  return { drag, begin, justDragged }
}
