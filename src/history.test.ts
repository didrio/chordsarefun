import { describe, expect, it } from 'vitest'
import { beginGesture, commit, initHistory, redo, undo, updateGesture } from './history'

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
})
