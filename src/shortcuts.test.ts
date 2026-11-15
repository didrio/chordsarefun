import { describe, expect, it } from 'vitest'
import { shortcutFor } from './shortcuts'

type Mods = Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }>
const press = (key: string, mods: Mods = {}, mac = true) =>
  shortcutFor({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...mods }, mac)

describe('shortcutFor', () => {
  it('maps transport keys', () => {
    expect(press(' ')).toEqual({ type: 'playPause' })
    expect(press(' ', { shiftKey: true })).toEqual({ type: 'stop' })
    expect(press('l')).toEqual({ type: 'toggleLoop' })
    expect(press('M')).toEqual({ type: 'toggleMetronome' })
  })

  it('ignores number keys', () => {
    expect(press('1')).toBeNull()
    expect(press('7')).toBeNull()
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

  it('maps duplicate on both platforms', () => {
    expect(press('d', { metaKey: true })).toEqual({ type: 'duplicate' })
    expect(press('D', { ctrlKey: true }, false)).toEqual({ type: 'duplicate' })
    expect(press('d')).toBeNull()
  })

  it('nudges with Option+arrows on a Mac and Ctrl+arrows elsewhere', () => {
    expect(press('ArrowLeft', { altKey: true })).toEqual({ type: 'nudge', dir: -1 })
    expect(press('ArrowRight', { altKey: true })).toEqual({ type: 'nudge', dir: 1 })
    expect(press('ArrowRight', { ctrlKey: true }, false)).toEqual({ type: 'nudge', dir: 1 })
    // ⌘← on a Mac and Alt+← elsewhere are the browser's Back: left alone.
    expect(press('ArrowLeft', { metaKey: true })).toBeNull()
    expect(press('ArrowLeft', { altKey: true }, false)).toBeNull()
    expect(press('ArrowLeft', { ctrlKey: true })).toBeNull()
  })

  it('leaves other modifier combos to the browser', () => {
    expect(press('1', { metaKey: true })).toBeNull()
    expect(press('l', { ctrlKey: true })).toBeNull()
    expect(press('ArrowUp', { altKey: true })).toBeNull()
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
