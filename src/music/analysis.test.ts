import { describe, expect, it } from 'vitest'
import { analyzeChord, chordTension } from './analysis'
import { parseChord } from './parse'

const chord = (name: string) => parseChord(name)!
const fit = (name: string, tonic = 'C', mode: Parameters<typeof analyzeChord>[2] = 'ionian', next?: string) =>
  analyzeChord(chord(name), tonic, mode, next ? chord(next) : null).fit
const tension = (name: string) => chordTension(chord(name))

describe('chord fit', () => {
  it('in key', () => {
    expect(fit('Dm7').kind).toBe('diatonic')
    expect(fit('G9').kind).toBe('diatonic')
    expect(fit('Dm7').tag).toBeNull()
  })

  it('borrowed from the parallel minor / other modes', () => {
    expect(fit('Fm')).toMatchObject({ kind: 'borrowed', title: 'Borrowed from C minor', common: true, roman: 'iv' })
    expect(fit('Bb')).toMatchObject({ kind: 'borrowed', roman: 'bVII' })
    expect(fit('Ab').kind).toBe('borrowed')
    // The major V in a minor key comes from harmonic minor.
    expect(fit('G7', 'C', 'aeolian').title).toBe('Borrowed from C harmonic minor')
    // Major IV in minor: Dorian.
    expect(fit('F', 'C', 'aeolian').title).toBe('Borrowed from C Dorian')
  })

  it('secondary dominants point at a chord of the key', () => {
    expect(fit('D7')).toMatchObject({ kind: 'secondary', roman: 'V7/V', tag: '→ G' })
    expect(fit('A7')).toMatchObject({ kind: 'secondary', roman: 'V7/ii', tag: '→ Dm' })
    expect(fit('E')).toMatchObject({ kind: 'secondary', roman: 'V/vi' })
  })

  it('says whether a leading chord resolves', () => {
    expect(fit('A7', 'C', 'ionian', 'Dm').detail).toContain('And it does: Dm comes next.')
    expect(fit('A7', 'C', 'ionian', 'F').detail).toContain('Try putting Dm right after it.')
    // A plain major chord followed by its target reads as leading there, not borrowed.
    expect(fit('C7', 'C', 'ionian', 'F').kind).toBe('secondary')
  })

  it('passing diminished and tritone substitutes', () => {
    expect(fit('C#dim7')).toMatchObject({ kind: 'passing', tag: '→ Dm' })
    expect(fit('Db7')).toMatchObject({ kind: 'substitute', tag: '→ C' })
  })

  it('diminished chords are explained by the chord they slide into', () => {
    expect(fit('Edim')).toMatchObject({ kind: 'passing', roman: 'vii°/IV', tag: '→ F' })
    // Aimed at home, the numeral needs no "/I".
    expect(fit('Bdim7')).toMatchObject({ kind: 'passing', roman: 'vii°7' })
    expect(fit('Db7').roman).toBe('subV7')
  })

  it('counts a slash bass note outside the chord', () => {
    // F/G is all in key; F/F# is not, because of the bass.
    expect(fit('F/G').kind).toBe('diatonic')
    const a = analyzeChord(chord('F/F#'), 'C', 'ionian')
    expect(a.fit.kind).not.toBe('diatonic')
    expect(a.notes[0]).toMatchObject({ note: 'F#', role: 'bass', inKey: false })
    // An inversion is never "outside" just because of its shape.
    expect(fit('G').kind).toBe('diatonic')
  })

  it('outside the key, with each outside note explained', () => {
    const a = analyzeChord(chord('F#'), 'C', 'ionian')
    expect(a.fit).toMatchObject({ kind: 'outside', common: false })
    const out = a.notes.filter((n) => !n.inKey)
    expect(out.map((n) => n.note)).toEqual(['F#', 'A#', 'C#'])
    expect(out[0].why).toBe('The key has F; F# is F raised a half step.')
  })
})

describe('chord tension', () => {
  it('standard chords are smooth', () => {
    for (const name of ['C', 'Cmaj7', 'Cm9', 'C13', 'Cadd9', 'Cmadd9', 'Csus4', 'C6/9']) {
      expect([name, tension(name).level]).toEqual([name, 0])
    }
  })

  it('classic colors have some bite', () => {
    expect(tension('C7b9').level).toBe(1)
    expect(tension('C7#9').level).toBe(1)
    expect(tension('Cmaj7#11').level).toBe(1)
    expect(tension('Cdim7').level).toBe(1)
  })

  it('half-step rubs clash, and say why', () => {
    const t = tension('Cadd11')
    expect(t.level).toBe(2)
    expect(t.reasons[0]).toContain('The 11 (F) rubs a half step above the 3rd (E)')
    expect(tension('C(addb9)').level).toBe(2)
  })

  it('a bass note under the chord can rub', () => {
    expect(tension('C/B').level).toBe(1)
    expect(tension('C/Db').level).toBe(2)
    expect(tension('F/G').level).toBe(0)
    expect(tension('C/E').level).toBe(0)
  })

  it('tension is separate from fitting the key', () => {
    // In key but clashing; outside the key but smooth.
    expect(fit('Cadd11').kind).toBe('diatonic')
    expect(tension('Cadd11').level).toBe(2)
    expect(fit('Ab').kind).not.toBe('diatonic')
    expect(tension('Ab').level).toBe(0)
  })
})
