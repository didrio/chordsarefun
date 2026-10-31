import { describe, expect, it } from 'vitest'
import type { Clip } from './music/timeline'
import { clickSelect, EMPTY_SELECTION, pruneSelection, selectAll } from './selection'

const clips: Clip[] = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, symbol: id, start: i * 100, length: 100 }))
const plain = { shift: false, toggle: false }
const shift = { shift: true, toggle: false }
const toggle = { shift: false, toggle: true }

describe('selection', () => {
  it('plain click selects only that clip', () => {
    const sel = clickSelect({ ids: ['a', 'b'], anchor: 'a' }, clips, 'c', plain)
    expect(sel).toEqual({ ids: ['c'], anchor: 'c' })
  })

  it('shift-click selects the range from the anchor, either direction', () => {
    const fromB = clickSelect(EMPTY_SELECTION, clips, 'b', plain)
    expect(clickSelect(fromB, clips, 'd', shift).ids).toEqual(['b', 'c', 'd'])
    expect(clickSelect(fromB, clips, 'a', shift).ids).toEqual(['a', 'b'])
    // Extending again re-ranges from the same anchor.
    const ranged = clickSelect(fromB, clips, 'e', shift)
    expect(clickSelect(ranged, clips, 'c', shift).ids).toEqual(['b', 'c'])
  })

  it('shift-click with no anchor acts like a plain click', () => {
    expect(clickSelect(EMPTY_SELECTION, clips, 'c', shift)).toEqual({ ids: ['c'], anchor: 'c' })
  })

  it('cmd/ctrl-click toggles single clips without the ones between', () => {
    let sel = clickSelect(EMPTY_SELECTION, clips, 'a', plain)
    sel = clickSelect(sel, clips, 'c', toggle)
    sel = clickSelect(sel, clips, 'e', toggle)
    expect(sel.ids).toEqual(['a', 'c', 'e'])
    sel = clickSelect(sel, clips, 'c', toggle)
    expect(sel.ids).toEqual(['a', 'e'])
  })

  it('selects all in track order', () => {
    expect(selectAll([...clips].reverse(), EMPTY_SELECTION).ids).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('prunes clips that no longer exist', () => {
    const sel = pruneSelection({ ids: ['a', 'x'], anchor: 'x' }, clips)
    expect(sel).toEqual({ ids: ['a'], anchor: null })
    const same = { ids: ['a'], anchor: 'a' }
    expect(pruneSelection(same, clips)).toBe(same)
  })
})
