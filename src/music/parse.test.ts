import { Note } from 'tonal'
import { describe, expect, it } from 'vitest'
import { bassNote, CHORD_TYPES, chordName, chordNotes, lowestNote, makeChord, toggleNote, withBass, type Chord } from './chord'
import { chordFromNotes, parseChord, parseNumeral, readChordInput } from './parse'
import type { ModeName } from './theory'

const name = (text: string) => {
  const c = parseChord(text)
  return c && chordName(c)
}

describe('parseChord', () => {
  it('reads common chord names and spellings', () => {
    expect(name('F#m7b5')).toBe('F#m7b5')
    expect(name('Cm(maj7)')).toBe('CmMaj7')
    expect(name('C69')).toBe('C6/9')
    expect(name('Am(add9)')).toBe('Amadd9')
    expect(name('Csus')).toBe('Csus4')
    expect(name('bbm')).toBe('Bbm')
  })

  it.each([
    ['CM7', 'Cmaj7'],
    ['CΔ', 'Cmaj7'],
    ['CΔ7', 'Cmaj7'],
    ['C^7', 'Cmaj7'],
    ['Cmaj', 'C'],
    ['CMAJ7', 'Cmaj7'],
    ['Cmajor7', 'Cmaj7'],
    ['C major 7', 'Cmaj7'],
    ['C maj 7', 'Cmaj7'],
    ['Cmin', 'Cm'],
    ['Cminor', 'Cm'],
    ['C minor', 'Cm'],
    ['c min7', 'Cm7'],
    ['Cmi7', 'Cm7'],
    ['C-7', 'Cm7'],
    ['C−7', 'Cm7'],
    ['Cdom7', 'C7'],
    ['C dominant 7', 'C7'],
    ['C seven', 'C7'],
    ['C 7', 'C7'],
    ['Cm7-5', 'Cm7b5'],
    ['Cm7(b5)', 'Cm7b5'],
    ['Cø', 'Cm7b5'],
    ['Cø7', 'Cm7b5'],
    ['C half diminished', 'Cm7b5'],
    ['C half-dim', 'Cm7b5'],
    ['C°', 'Cdim'],
    ['Co', 'Cdim'],
    ['Co7', 'Cdim7'],
    ['C diminished', 'Cdim'],
    ['C dim 7', 'Cdim7'],
    ['C+', 'Caug'],
    ['C augmented', 'Caug'],
    ['C+7', 'C7#5'],
    ['C7+5', 'C7#5'],
    ['C7+', 'C7#5'],
    ['C7-9', 'C7b9'],
    ['C7(b9)', 'C7b9'],
    ['C7+9', 'C7#9'],
    ['C7♭9', 'C7b9'],
    ['C sus 4', 'Csus4'],
    ['C suspended 2', 'Csus2'],
    ['C7sus', 'C7sus4'],
    ['C power chord', 'C5'],
    ['C5', 'C5'],
    ['C add 9', 'Cadd9'],
    ['Cadd2', 'Cadd9'],
    ['C (add 9)', 'Cadd9'],
    ['Cmaj6', 'C6'],
    ['C6add9', 'C6/9'],
    ['CmM7', 'CmMaj7'],
    ['Cm/maj7', 'CmMaj7'],
    ['Cminmaj7', 'CmMaj7'],
    ['C13', 'C13'],
    ['Cmaj7#11', 'Cmaj7#11'],
    ['C maj7 no 5', 'Cmaj7(no 5)'],
  ])('reads %s as %s', (text, expected) => {
    expect(name(text)).toBe(expected)
  })

  it('reads roots written as words or symbols', () => {
    expect(name('C sharp minor')).toBe('C#m')
    expect(name('c# m7')).toBe('C#m7')
    expect(name('E flat major')).toBe('Eb')
    expect(name('E-flat')).toBe('Eb')
    expect(name('D♭maj7')).toBe('Dbmaj7')
    expect(name('f♯m')).toBe('F#m')
    expect(name('am7.')).toBe('Am7')
  })

  it('reads alterations Tonal doesn\'t know by building on the base chord', () => {
    // Same notes as C E G♭ B (the canonical name may spell the ♭5 as a #11).
    const pcs = (c: Chord) => chordNotes(c).map((n) => Note.chroma(n)).sort((a, b) => a - b)
    expect(pcs(parseChord('Cmaj7b5')!)).toEqual([0, 4, 6, 11])
    expect(chordNotes(parseChord('C7sus2')!)).toEqual(['C', 'D', 'G', 'Bb'])
  })

  it('reads slash chords as a bass note, never an inversion', () => {
    const c = parseChord('C/E')!
    expect([chordName(c), bassNote(c), c.inversion]).toEqual(['C/E', 'E', 0])
    expect(name('C over E')).toBe('C/E')
    expect(name('G7/B')).toBe('G7/B')
    expect(name('D/f#')).toBe('D/F#')
    // A bass outside the chord stays just the bass (F/G is an F triad over G).
    expect(chordNotes(parseChord('F/G')!)).toEqual(['F', 'A', 'C'])
    expect(name('F/G')).toBe('F/G')
    // "6/9" is a chord type, not a bass note.
    expect(name('C6/9')).toBe('C6/9')
    expect(name('C/C')).toBe('C')
  })

  it('rejects nonsense', () => {
    expect(parseChord('')).toBeNull()
    expect(parseChord('Hm7')).toBeNull()
    expect(parseChord('Cxyz')).toBeNull()
    expect(parseChord('hello')).toBeNull()
  })

  // Names can't capture every voicing (Cadd9 with the D moved down still reads "Cadd9"),
  // so this checks the chord's name, notes and bass note.
  it('reads back every name it produces', () => {
    for (const t of CHORD_TYPES) {
      for (const root of ['C', 'F#', 'Bb']) {
        for (const extra of [null, 'D', 'F', 'Eb']) {
          for (const bass of [null, 'E', 'G#']) {
            let c: Chord = makeChord(root, t.symbol)
            if (extra) c = toggleNote(c, extra)
            c = withBass(c, bass)
            const back = parseChord(chordName(c))
            expect(back && chordName(back)).toBe(chordName(c))
            expect(back && bassNote(back)).toBe(bassNote(c))
            expect(back && chordNotes(back)).toEqual(chordNotes(c))
          }
        }
      }
    }
  })
})

describe('chordFromNotes / note lists', () => {
  it('finds the chord, preferring the first note as the root on ties', () => {
    expect(chordName(chordFromNotes(['C', 'E', 'G'])!)).toBe('C')
    expect(chordName(chordFromNotes(['A', 'C', 'E', 'G'])!)).toBe('Am7')
    expect(chordName(chordFromNotes(['C', 'E', 'G', 'A'])!)).toBe('C6')
    expect(chordName(chordFromNotes(['D', 'F#', 'A', 'C'])!)).toBe('D7')
  })

  it('keeps the typed order as the voicing (an inversion, not a slash chord)', () => {
    const c = chordFromNotes(['E', 'G', 'C'])!
    expect([chordName(c), lowestNote(c)]).toEqual(['C', 'E'])
  })

  it('reads lists however they are written', () => {
    for (const text of ['C E G', 'c e g', 'C, E, G', 'C-E-G', 'ceg', 'CEG']) {
      expect(readChordInput(text)?.chord && chordName(readChordInput(text)!.chord), text).toBe('C')
    }
    expect(readChordInput('C E G')?.from).toBe('notes')
    expect(chordName(readChordInput('Bb D F')!.chord)).toBe('Bb')
    expect(chordName(readChordInput('C Eb Gb')!.chord)).toBe('Cdim')
  })

  it('needs two different notes', () => {
    expect(chordFromNotes(['C'])).toBeNull()
    expect(chordFromNotes(['C', 'C'])).toBeNull()
  })
})

describe('parseNumeral', () => {
  const C = { tonic: 'C', mode: 'ionian' as const }
  const Cm = { tonic: 'C', mode: 'aeolian' as const }
  const n = (text: string, home: { tonic: string; mode: ModeName } = C) => {
    const c = parseNumeral(text, home)
    return c && chordName(c)
  }

  it('reads numerals in the home key', () => {
    expect(n('I')).toBe('C')
    expect(n('IV')).toBe('F')
    expect(n('vi')).toBe('Am')
    expect(n('V7')).toBe('G7')
    expect(n('ii7')).toBe('Dm7')
    expect(n('IVmaj7')).toBe('Fmaj7')
    expect(n('vii°')).toBe('Bdim')
    expect(n('viiø7')).toBe('Bm7b5')
    expect(n('Isus4')).toBe('Csus4')
    expect(n('iadd9')).toBe('Cmadd9')
  })

  it('reads flats and sharps from the major scale (pop convention), plain numerals from the home scale', () => {
    expect(n('bVII')).toBe('Bb')
    expect(n('♭VI')).toBe('Ab')
    expect(n('#iv°7')).toBe('F#dim7')
    expect(n('III', Cm)).toBe('Eb')
    expect(n('bIII', Cm)).toBe('Eb')
    expect(n('V', Cm)).toBe('G')
  })

  it('reads secondary chords (V7/ii is the V7 of ii)', () => {
    expect(n('V7/ii')).toBe('A7')
    expect(n('V/V')).toBe('D')
  })

  it('is only used when a home is given', () => {
    expect(readChordInput('V7')).toBeNull()
    expect(readChordInput('V7', C)).toEqual({ chord: parseChord('G7'), from: 'numeral' })
  })
})
