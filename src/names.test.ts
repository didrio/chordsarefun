import { describe, expect, it } from 'vitest'
import { exportFileName, uniqueName } from './names'

describe('uniqueName', () => {
  it('numbers a name that is taken', () => {
    expect(uniqueName('Verse', [])).toBe('Verse')
    expect(uniqueName('Verse', ['Verse', 'Verse 2'])).toBe('Verse 3')
  })
})

describe('exportFileName', () => {
  it('is named after the session, then the section and the part when there is one', () => {
    expect(exportFileName({ session: 'My song', ext: 'wav' })).toBe('My song.wav')
    expect(exportFileName({ session: 'My song', section: 'Chorus', ext: 'wav' })).toBe('My song - Chorus.wav')
    expect(exportFileName({ session: 'My song', part: 'Bass', ext: 'mid' })).toBe('My song - Bass.mid')
    expect(exportFileName({ session: 'My song', section: 'Verse 2', part: 'Drums', ext: 'wav' })).toBe('My song - Verse 2 - Drums.wav')
  })

  it("drops characters a file name can't hold", () => {
    expect(exportFileName({ session: 'AC/DC: "Back" <in> black?', ext: 'wav' })).toBe('ACDC Back in black.wav')
    expect(exportFileName({ session: '  lots   of  space ', ext: 'wav' })).toBe('lots of space.wav')
    expect(exportFileName({ session: '...hidden', ext: 'wav' })).toBe('hidden.wav')
  })

  it('falls back to a name when nothing is left', () => {
    expect(exportFileName({ session: '///', ext: 'wav' })).toBe('chords.wav')
    expect(exportFileName({ session: '', part: 'Bass', ext: 'mid' })).toBe('chords - Bass.mid')
  })
})
