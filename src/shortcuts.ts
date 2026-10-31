/** Keyboard shortcuts: which key does what. Pure, so the mapping is testable. */

export type Shortcut =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'playPause' }
  | { type: 'stop' }
  /** Add (or replace the selected clip with) palette chord 0–6. */
  | { type: 'chord'; index: number }
  /** Previous/next clip, or move the playhead when nothing is selected. */
  | { type: 'step'; dir: -1 | 1 }
  | { type: 'toggleLoop' }
  | { type: 'toggleMetronome' }
  | { type: 'remove' }
  | { type: 'deselect' }
  | { type: 'selectAll' }

type Keys = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'>

export function shortcutFor(e: Keys): Shortcut | null {
  const key = e.key.toLowerCase()
  const mod = e.metaKey || e.ctrlKey
  if (mod && key === 'z') return { type: e.shiftKey ? 'redo' : 'undo' }
  if (mod && key === 'y') return { type: 'redo' }
  if (mod && key === 'a') return { type: 'selectAll' }
  // Leave every other modifier combo (browser shortcuts like ⌘1, ⌘L) alone.
  if (mod || e.altKey) return null
  if (key === ' ') return { type: e.shiftKey ? 'stop' : 'playPause' }
  if (/^[1-7]$/.test(key)) return { type: 'chord', index: Number(key) - 1 }
  if (key === 'arrowleft') return { type: 'step', dir: -1 }
  if (key === 'arrowright') return { type: 'step', dir: 1 }
  if (key === 'l') return { type: 'toggleLoop' }
  if (key === 'm') return { type: 'toggleMetronome' }
  if (key === 'backspace' || key === 'delete') return { type: 'remove' }
  if (key === 'escape') return { type: 'deselect' }
  return null
}
