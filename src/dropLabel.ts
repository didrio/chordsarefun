import { chordName, type Chord } from './music/chord'
import type { Clip, DropPlan, HeldChord } from './music/timeline'

/** A clip's chord in words; empty clips read "empty clip". */
export const clipLabel = (chord: Chord | null) => (chord ? chordName(chord) : 'blank spot')

/** What's being dragged, in words: the chord name, or "3 chords" for a group. */
export function heldName(held: HeldChord): string {
  const n = held.groupIds?.length ?? 1
  return n > 1 ? `${n} chords` : clipLabel(held.chord)
}

/** Plain-words description of what releasing the drag will do. */
export function describeDrop(held: HeldChord, plan: DropPlan | null, overTrack: boolean, clips: Clip[]): string | null {
  if (!overTrack) return held.existing ? 'Release to cancel' : null
  if (!plan) return 'No room here'
  const name = (id: string) => clipLabel(clips.find((c) => c.id === id)?.chord ?? null)
  const chord = clipLabel(held.chord)
  const what = heldName(held)
  const copying = held.existing && held.copy
  const { action } = plan
  switch (action.kind) {
    case 'swap':
      return `Swap ${chord} ⇄ ${name(action.targetId)}`
    case 'replace':
      return `Replace ${name(action.targetId)} with ${chord}`
    case 'move':
      return `Move ${what} ${action.side} ${name(action.targetId)}`
    case 'insert':
      return `${copying ? 'Copy' : 'Add'} ${copying ? what : chord} ${action.side} ${name(action.targetId)}`
    case 'place':
      return copying ? `Copy ${what} here` : held.existing ? `Move ${what} here` : `Add ${what} here`
  }
}

/** What's dragged onto the song timeline: a section (from its chip) or blocks already in the song. */
export type BlockDragSource = { kind: 'add'; section: string } | { kind: 'move'; ids: string[] }

/**
 * Plain-words description of what releasing a drag on the song timeline will do: "Add Chorus
 * after Verse", "Move Chorus before Verse", "Copy 2 parts after Intro". `gap` is where it would
 * land (see blockGap), or null when the pointer isn't over the song (`open`: whether the song
 * timeline is showing at all).
 */
export function describeBlockDrop(
  src: BlockDragSource,
  gap: number | null,
  blocks: { id: string; section: string }[],
  nameOf: (section: string) => string,
  { copy = false, open = true }: { copy?: boolean; open?: boolean } = {},
): string {
  const moving = src.kind === 'move' ? blocks.filter((b) => src.ids.includes(b.id)) : []
  if (gap === null) return src.kind === 'add' ? (open ? `Drop on the song to add ${nameOf(src.section)}` : 'Open Song to arrange') : 'Release to cancel'
  const what = src.kind === 'add' ? nameOf(src.section) : moving.length === 1 ? nameOf(moving[0].section) : `${moving.length} parts`
  const verb = src.kind === 'add' ? 'Add' : copy ? 'Copy' : 'Move'
  // Where it lands among the blocks that stay put.
  const stays = src.kind === 'move' && !copy ? blocks.filter((b) => !src.ids.includes(b.id)) : blocks
  const g = blocks.slice(0, gap).filter((b) => stays.includes(b)).length
  if (src.kind === 'move' && !copy) {
    const order = [...stays.slice(0, g), ...moving, ...stays.slice(g)]
    if (order.every((b, i) => b === blocks[i])) return 'Already here'
  }
  if (stays.length === 0) return `${verb} ${what}`
  if (g === 0) return `${verb} ${what} before ${nameOf(stays[0].section)}`
  return `${verb} ${what} after ${nameOf(stays[g - 1].section)}`
}
