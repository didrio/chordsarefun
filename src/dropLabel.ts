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
