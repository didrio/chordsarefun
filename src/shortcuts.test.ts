import { describe, expect, it } from 'vitest'
import { shortcutFor } from './shortcuts'

const press = (key: string, mods: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
  shortcutFor({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...mods })

describe('shortcutFor', () => {
  it('maps transport keys', () => {
    expect(press(' ')).toEqual({ type: 'playPause' })
    expect(press(' ', { shiftKey: true })).toEqual({ type: 'stop' })
    expect(press('l')).toEqual({ type: 'toggleLoop' })
    expect(press('M')).toEqual({ type: 'toggleMetronome' })
  })

  it('maps 1–7 to palette chords, and nothing else', () => {
    expect(press('1')).toEqual({ type: 'chord', index: 0 })
    expect(press('7')).toEqual({ type: 'chord', index: 6 })
    expect(press('8')).toBeNull()
    expect(press('0')).toBeNull()
  })

  it('maps undo/redo on both platforms', () => {
    expect(press('z', { metaKey: true })).toEqual({ type: 'undo' })
    expect(press('z', { ctrlKey: true })).toEqual({ type: 'undo' })
    expect(press('Z', { metaKey: true, shiftKey: true })).toEqual({ type: 'redo' })
    expect(press('y', { ctrlKey: true })).toEqual({ type: 'redo' })
  })

  it('maps select all on both platforms', () => {
    expect(press('a', { metaKey: true })).toEqual({ type: 'selectAll' })
    expect(press('A', { ctrlKey: true })).toEqual({ type: 'selectAll' })
    expect(press('a')).toBeNull()
  })

  it('leaves other modifier combos to the browser', () => {
    expect(press('1', { metaKey: true })).toBeNull()
    expect(press('l', { ctrlKey: true })).toBeNull()
    expect(press('ArrowLeft', { altKey: true })).toBeNull()
  })

  it('maps editing keys', () => {
    expect(press('ArrowLeft')).toEqual({ type: 'step', dir: -1 })
    expect(press('ArrowRight')).toEqual({ type: 'step', dir: 1 })
    expect(press('ArrowUp')).toEqual({ type: 'invert', dir: 1 })
    expect(press('ArrowDown')).toEqual({ type: 'invert', dir: -1 })
    expect(press('ArrowUp', { shiftKey: true })).toEqual({ type: 'octave', dir: 1 })
    expect(press('ArrowDown', { shiftKey: true })).toEqual({ type: 'octave', dir: -1 })
    expect(press('Backspace')).toEqual({ type: 'remove' })
    expect(press('Delete')).toEqual({ type: 'remove' })
    expect(press('Escape')).toEqual({ type: 'deselect' })
  })
})
