import { describe, expect, it } from 'vitest'
import { describeDrop } from './dropLabel'
import { planDrop, TICKS_PER_BAR, TICKS_PER_BEAT, type Clip } from './music/timeline'

const BAR = TICKS_PER_BAR
const clips: Clip[] = ['C', 'G', 'Am', 'F'].map((symbol, i) => ({ id: symbol, symbol, start: i * BAR, length: BAR }))
const moving = { id: 'C', symbol: 'C', existing: true, grabOffset: 0 }
const adding = { id: 'new', symbol: 'Em', existing: false, grabOffset: 0 }
const label = (held: typeof moving, x: number) =>
  describeDrop(held, planDrop(clips, held, x, 4 * BAR, TICKS_PER_BEAT), true, clips)

describe('describeDrop', () => {
  it('describes moves, swaps, inserts and replaces in plain words', () => {
    expect(label(moving, 3 * BAR - 10)).toBe('Move C after Am')
    expect(label(moving, 2.5 * BAR)).toBe('Swap C ⇄ Am')
    expect(label(adding, 1.5 * BAR)).toBe('Replace G with Em')
    expect(label(adding, BAR + 10)).toBe('Add Em before G')
  })

  it('counts chords for group moves', () => {
    const group = { ...moving, groupIds: ['C', 'G'] }
    expect(label(group, 4 * BAR - 10)).toBe('Move 2 chords after F')
  })

  it('explains invalid and off-track drops', () => {
    expect(describeDrop(moving, null, true, clips)).toBe('No room here')
    expect(describeDrop(moving, null, false, clips)).toBe('Release to cancel')
    expect(describeDrop(adding, null, false, clips)).toBeNull()
  })
})
