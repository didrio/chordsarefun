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

/**
 * Nudge the selected chords with ←/→: Option on a Mac (⌘← is the browser's Back there),
 * Ctrl elsewhere (Alt+← is Back there). Only that modifier, so other combos stay the browser's.
 */
export const nudgeKey = (e: Mods, mac = IS_MAC) =>
  mac ? e.altKey && !e.metaKey && !e.ctrlKey : e.ctrlKey && !e.altKey && !e.metaKey

export const COPY_KEY = IS_MAC ? '⌥ Option' : 'Ctrl'
export const NUDGE_KEY = IS_MAC ? '⌥ Option' : 'Ctrl'
export const FREE_KEY = IS_MAC ? '⌘ Cmd' : 'Alt'
/** "Tap" on a touch screen, "Click" with a mouse: the verb on-screen hints use. */
export const TAP =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'Tap' : 'Click'
/** Shortcuts as written in on-screen hints. */
export const UNDO_KEY = IS_MAC ? '⌘Z' : 'Ctrl+Z'
export const DUPLICATE_KEY = IS_MAC ? '⌘D' : 'Ctrl+D'

/** Smooth scrolling, unless the user asked their system for less motion (then it jumps). */
export function scrollMotion(): ScrollBehavior {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}
