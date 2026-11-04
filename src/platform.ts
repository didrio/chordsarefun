/**
 * Modifier keys for drags, following Ableton: on a Mac, Option-drag copies and ⌘-drag
 * ignores the grid; on Windows/Linux, Ctrl-drag copies and Alt-drag ignores the grid.
 */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

type Mods = { altKey: boolean; metaKey: boolean; ctrlKey: boolean }

/** Copy (duplicate) instead of move while dragging a clip. */
export const copyKey = (e: Mods, mac = IS_MAC) => (mac ? e.altKey : e.ctrlKey)

/** Ignore the grid while dragging, resizing or moving the playhead. */
export const freeKey = (e: Mods, mac = IS_MAC) => (mac ? e.metaKey : e.altKey)

export const COPY_KEY = IS_MAC ? '⌥ Option' : 'Ctrl'
export const FREE_KEY = IS_MAC ? '⌘ Cmd' : 'Alt'
