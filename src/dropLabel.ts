import type { Clip, DropPlan, HeldChord } from './music/timeline'

/** What's being dragged, in words: the chord name, or "3 chords" for a group. */
export function heldName(held: HeldChord): string {
  const n = held.groupIds?.length ?? 1
  return n > 1 ? `${n} chords` : held.symbol
}

/** Plain-words description of what releasing the drag will do. */
export function describeDrop(held: HeldChord, plan: DropPlan | null, overTrack: boolean, clips: Clip[]): string | null {
  if (!overTrack) return held.existing ? 'Release to cancel' : null
  if (!plan) return 'No room here'
  const name = (id: string) => clips.find((c) => c.id === id)?.symbol ?? ''
  const what = heldName(held)
  const { action } = plan
  switch (action.kind) {
    case 'swap':
      return `Swap ${held.symbol} ⇄ ${name(action.targetId)}`
    case 'replace':
      return `Replace ${name(action.targetId)} with ${held.symbol}`
    case 'move':
      return `Move ${what} ${action.side} ${name(action.targetId)}`
    case 'insert':
      return `Add ${held.symbol} ${action.side} ${name(action.targetId)}`
    case 'place':
      return held.existing ? `Move ${what} here` : `Add ${what} here`
  }
}
