import type { Clip } from './music/timeline'

/**
 * Clip selection, DAW-style. `anchor` is the clip a Shift+click range extends from
 * (the last plain or ⌘/Ctrl-clicked clip).
 */
export type Selection = { ids: string[]; anchor: string | null }

export const EMPTY_SELECTION: Selection = { ids: [], anchor: null }

export type ClickMods = { shift: boolean; toggle: boolean }

const byStart = (clips: Clip[]) => [...clips].sort((a, b) => a.start - b.start)

/**
 * Selection after clicking clip `id`:
 * - plain click: just that clip
 * - Shift: everything from the anchor to it (inclusive), in track order
 * - ⌘/Ctrl: add or remove that clip, keeping the rest
 */
export function clickSelect(sel: Selection, clips: Clip[], id: string, mods: ClickMods): Selection {
  if (mods.shift && sel.anchor && clips.some((c) => c.id === sel.anchor)) {
    const order = byStart(clips).map((c) => c.id)
    const [a, b] = [order.indexOf(sel.anchor), order.indexOf(id)].sort((x, y) => x - y)
    return { ids: order.slice(a, b + 1), anchor: sel.anchor }
  }
  if (mods.toggle) {
    const ids = sel.ids.includes(id) ? sel.ids.filter((x) => x !== id) : [...sel.ids, id]
    return { ids, anchor: id }
  }
  return { ids: [id], anchor: id }
}

export function selectAll(clips: Clip[], sel: Selection): Selection {
  const ids = byStart(clips).map((c) => c.id)
  return { ids, anchor: sel.anchor ?? ids[0] ?? null }
}

/** Drop ids of clips that no longer exist (e.g. after undo or delete). */
export function pruneSelection(sel: Selection, clips: Clip[]): Selection {
  const exists = new Set(clips.map((c) => c.id))
  const ids = sel.ids.filter((id) => exists.has(id))
  const anchor = sel.anchor && exists.has(sel.anchor) ? sel.anchor : null
  return ids.length === sel.ids.length && anchor === sel.anchor ? sel : { ids, anchor }
}
