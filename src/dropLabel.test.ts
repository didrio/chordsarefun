import { describe, expect, it } from 'vitest'
import { describeDrop } from './dropLabel'
import { parseChord } from './music/parse'
import { planDrop, TICKS_PER_BAR, TICKS_PER_BEAT, type Clip, type HeldChord } from './music/timeline'

const BAR = TICKS_PER_BAR
const clips: Clip[] = ['C', 'G', 'Am', 'F'].map((name, i) => ({ id: name, chord: parseChord(name)!, start: i * BAR, length: BAR }))
const moving: HeldChord = { id: 'C', chord: parseChord('C')!, existing: true, grabOffset: 0 }
const adding: HeldChord = { id: 'new', chord: parseChord('Em')!, existing: false, grabOffset: 0 }
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

describe('describeDrop: copies and empty clips', () => {
  const copyIds = { C: 'C2', G: 'G2' }
  it('says "Copy" when Option/Ctrl turns a move into a copy', () => {
    const copy = { ...moving, copy: true, copyIds }
    expect(label(copy, 3 * BAR - 10)).toBe('Copy C after Am')
    expect(label(copy, 2.5 * BAR)).toBe('Replace Am with C')
    const group = { ...copy, groupIds: ['C', 'G'] }
    // A full track has no room for two more chords; a longer one does.
    expect(label(group, 4 * BAR - 10)).toBe('No room here')
    expect(describeDrop(group, planDrop(clips, group, 4 * BAR - 10, 8 * BAR, TICKS_PER_BEAT), true, clips)).toBe(
      'Copy 2 chords after F',
    )
  })

  it('names empty clips', () => {
    const empty: Clip = { id: 'e', chord: null, start: 0, length: BAR }
    const held: HeldChord = { id: 'e', chord: null, existing: true, grabOffset: 0 }
    const track = [empty, ...clips.slice(1)]
    expect(describeDrop(held, planDrop(track, held, 2.5 * BAR, 4 * BAR, TICKS_PER_BEAT), true, track)).toBe('Swap empty clip ⇄ Am')
  })
})
