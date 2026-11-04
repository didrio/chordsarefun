import { describe, expect, it } from 'vitest'
import { chordName } from './chord'
import { parseChord } from './parse'
import { pullsInto, suggestForSpot, type Intent, type Spot } from './suggest'

const c = (n: string) => parseChord(n)!
const spot = (over: Partial<Spot>): Spot => ({ prev: null, next: null, loopTo: null, tonic: 'C', mode: 'ionian', flavor: 'triads', ...over })
const ideas = (s: Spot, intent: Intent) =>
  suggestForSpot(s).groups.find((g) => g.intent === intent)?.ideas.map((i) => chordName(i.chord)) ?? []
const all = (s: Spot) => suggestForSpot(s).groups.flatMap((g) => g.ideas.map((i) => chordName(i.chord)))

describe('pullsInto', () => {
  it('knows dominants (a 5th above) and leading diminished chords (a half step below)', () => {
    expect(pullsInto(c('G7'), c('C'))).toBe(true)
    expect(pullsInto(c('G'), c('C'))).toBe(true)
    expect(pullsInto(c('Bdim'), c('C'))).toBe(true)
    expect(pullsInto(c('Gm'), c('C'))).toBe(false)
    expect(pullsInto(c('F'), c('C'))).toBe(false)
  })
})

describe('suggestForSpot', () => {
  it('offers home first on an empty track, and the most-used chords to flow', () => {
    const s = spot({})
    expect(ideas(s, 'home')[0]).toBe('C')
    expect(ideas(s, 'flow')).toEqual(['F'])
    expect(suggestForSpot(s).context).toMatch(/Nothing around it/)
  })

  it('suggests what pulls into the next chord', () => {
    expect(ideas(spot({ next: c('Dm') }), 'tension').slice(0, 2)).toEqual(['A', 'C#dim'])
    expect(ideas(spot({ prev: c('F'), loopTo: c('C') }), 'tension')[0]).toBe('G')
  })

  it("uses the V's 7th when the plain V is already next to the spot", () => {
    expect(ideas(spot({ prev: c('C'), next: c('F') }), 'tension')[0]).toBe('C7')
  })

  it('explains a deceptive cadence after the V', () => {
    const g = suggestForSpot(spot({ prev: c('G'), next: c('F') })).groups.find((x) => x.intent === 'home')!
    expect(g.ideas.map((i) => chordName(i.chord))).toEqual(['C', 'Am'])
    expect(g.ideas[0].why).toMatch(/G pulls here/)
    expect(g.ideas[1].why).toMatch(/deceptive cadence/)
  })

  it('ends at home or hangs on the V at the end of a track that does not loop', () => {
    const s = spot({ prev: c('F') })
    expect(ideas(s, 'home')[0]).toBe('C')
    expect(suggestForSpot(s).groups.find((g) => g.intent === 'tension')!.ideas[0].why).toMatch(/half cadence/)
  })

  it('flows with chords that share notes with both neighbors, dim chords last', () => {
    const f = ideas(spot({ prev: c('C'), next: c('F') }), 'flow')
    expect(f[0]).toBe('Dm')
    expect(f).not.toContain('Bdim')
  })

  it('never repeats a chord, or suggests the chords already beside the spot', () => {
    const list = all(spot({ prev: c('C'), next: c('F') }))
    expect(new Set(list).size).toBe(list.length)
    expect(list).not.toContain('C')
    expect(list).not.toContain('F')
  })

  it('reads numerals in context (Edim before F is a passing chord)', () => {
    const t = suggestForSpot(spot({ prev: c('C'), next: c('F') })).groups.find((g) => g.intent === 'tension')!
    expect(t.ideas.find((i) => chordName(i.chord) === 'Edim')?.roman).toBe('vii°/IV')
  })

  it('works in minor and at the palette size', () => {
    const s = spot({ tonic: 'A', mode: 'aeolian', flavor: '7ths', prev: c('Am7'), next: c('Fmaj7') })
    expect(ideas(s, 'tension')[0]).toBe('C7')
    expect(ideas(s, 'home')).toEqual(['Cmaj7'])
  })
})
