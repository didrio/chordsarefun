import { describe, expect, it } from 'vitest'
import { beginGesture, commit, initHistory, readHistory, redo, undo, updateGesture } from './history'

const inc = (n: number) => n + 1

describe('history', () => {
  it('undoes and redoes commits', () => {
    let h = initHistory(0)
    h = commit(h, inc)
    h = commit(h, inc)
    expect(h.present).toBe(2)
    h = undo(h)
    expect(h.present).toBe(1)
    h = redo(h)
    expect(h.present).toBe(2)
  })

  it('a new commit clears redo', () => {
    let h = commit(initHistory(0), inc)
    h = undo(h)
    h = commit(h, (n) => n + 10)
    expect(h.future).toEqual([])
    expect(redo(h).present).toBe(10)
  })

  it('no-op commits add no step', () => {
    const h = commit(initHistory(0), (n) => n)
    expect(h.past).toEqual([])
  })

  it('a gesture with many updates is a single undo step', () => {
    let h = commit(initHistory(0), inc)
    h = beginGesture(h)
    h = updateGesture(h, inc)
    h = updateGesture(h, inc)
    h = updateGesture(h, inc)
    expect(h.present).toBe(4)
    expect(undo(h).present).toBe(1)
  })

  it('a gesture that changes nothing adds no step', () => {
    let h = beginGesture(initHistory(0))
    h = updateGesture(h, (n) => n)
    expect(h.past).toEqual([])
  })

  it('separate gestures are separate steps', () => {
    let h = beginGesture(initHistory(0))
    h = updateGesture(h, inc)
    h = beginGesture(h)
    h = updateGesture(h, inc)
    expect(undo(h).present).toBe(1)
  })

  it('decodes what was saved before migrating and validating it', () => {
    const persist = {
      key: 'k',
      isValid: (v: unknown) => Number.isFinite(v),
      migrate: (v: unknown) => (typeof v === 'string' ? Number(v) : v),
      // Saved as an offset: every value stored relative to `base`.
      decode: (s: unknown) => {
        const p = s as { base?: number; past: number[]; present: number; future: number[] }
        if (p.base === undefined) return s
        const up = (n: number) => n + p.base!
        return { past: p.past.map(up), present: up(p.present), future: p.future.map(up) }
      },
    }
    expect(readHistory({ base: 10, past: [1], present: 2, future: [3] }, persist)).toMatchObject({ past: [11], present: 12, future: [13] })
    // Older saves (no `base`) pass through, then migrate.
    expect(readHistory({ past: ['1'], present: 2, future: [] }, persist)).toMatchObject({ past: [1], present: 2 })
    expect(readHistory({ past: ['x'], present: 2, future: [] }, persist)).toBeNull()
  })
})
