import { IS_MAC, nudgeKey } from './platform'

/** Keyboard shortcuts: which key does what. Pure, so the mapping is testable. */

export type Shortcut =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'playPause' }
  | { type: 'stop' }
  /** Previous/next clip, or move the playhead when nothing is selected. */
  | { type: 'step'; dir: -1 | 1 }
  /** Move the selected chords one inversion up/down. */
  | { type: 'invert'; dir: -1 | 1 }
  /** Move the selected chords (or all, with nothing selected) an octave up/down. */
  | { type: 'octave'; dir: -1 | 1 }
  | { type: 'toggleLoop' }
  | { type: 'toggleMetronome' }
  | { type: 'remove' }
  | { type: 'deselect' }
  | { type: 'selectAll' }
  /** Copy the selected chords right after them (⌘D / Ctrl+D). */
  | { type: 'duplicate' }
  /** Move the selected chords one grid step into empty space (⌥←/→ on a Mac, Ctrl+←/→ elsewhere). */
  | { type: 'nudge'; dir: -1 | 1 }

type Keys = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'>

export function shortcutFor(e: Keys, mac = IS_MAC): Shortcut | null {
  const key = e.key.toLowerCase()
  const mod = e.metaKey || e.ctrlKey
  if (mod && key === 'z') return { type: e.shiftKey ? 'redo' : 'undo' }
  if (mod && key === 'y') return { type: 'redo' }
  if (mod && key === 'a') return { type: 'selectAll' }
  // Duplicate, as in Ableton (and instead of the browser's "bookmark this page").
  if (mod && !e.shiftKey && key === 'd') return { type: 'duplicate' }
  if (nudgeKey(e, mac) && key === 'arrowleft') return { type: 'nudge', dir: -1 }
  if (nudgeKey(e, mac) && key === 'arrowright') return { type: 'nudge', dir: 1 }
  // Leave every other modifier combo (browser shortcuts like ⌘1, ⌘L) alone.
  if (mod || e.altKey) return null
  if (key === ' ') return { type: e.shiftKey ? 'stop' : 'playPause' }
  if (key === 'arrowleft') return { type: 'step', dir: -1 }
  if (key === 'arrowright') return { type: 'step', dir: 1 }
  // Shift+↑/↓ is octave transpose, as in Ableton's MIDI editor.
  if (key === 'arrowup' && e.shiftKey) return { type: 'octave', dir: 1 }
  if (key === 'arrowdown' && e.shiftKey) return { type: 'octave', dir: -1 }
  if (key === 'arrowup') return { type: 'invert', dir: 1 }
  if (key === 'arrowdown') return { type: 'invert', dir: -1 }
  if (key === 'l') return { type: 'toggleLoop' }
  if (key === 'm') return { type: 'toggleMetronome' }
  if (key === 'backspace' || key === 'delete') return { type: 'remove' }
  if (key === 'escape') return { type: 'deselect' }
  return null
}
