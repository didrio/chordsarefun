import { describe, expect, it } from 'vitest'
import { commit, initHistory, readHistory, redo, undo, type StoredHistory } from './history'
import { chordName, makeChord } from './music/chord'
import { applyGroove, DEFAULT_GROOVE, GROOVES } from './music/grooves'
import { PROGRESSIONS } from './music/progressions'
import { chordToKey } from './music/theory'
import type { Clip } from './music/timeline'
import {
  addSection,
  blockGap,
  blockSpans,
  formatDuration,
  changedSection,
  duplicateBlocks,
  forkBlock,
  insertBlocks,
  moveBlocks,
  removeBlocks,
  songSegments,
  songTicks,
  stepGap,
  copySection,
  DEFAULT_SONG,
  isSong,
  MAIN_SECTION,
  mapSongChords,
  migrateSong,
  packSongHistory,
  removeSection,
  renameSection,
  rescaleSong,
  sectionHue,
  sectionKind,
  sectionName,
  sectionTrack,
  songClips,
  songFromTrack,
  songWithProgression,
  unpackSongHistory,
  withSectionTrack,
  type Song,
} from './song'
import { DEFAULT_TRACK, withMusic, type Track } from './track'

const BAR = 1920
const clip = (id: string, chord: string, bar: number, type = ''): Clip => ({ id, chord: makeChord(chord, type), start: bar * BAR, length: BAR })
const funk = applyGroove(DEFAULT_GROOVE, GROOVES.find((g) => g.id === 'funk')!)

/** A song: the main (unnamed) section with C F, plus a Chorus with Am and its own instruments. */
const twoSections = (): Song => {
  const base = songFromTrack({ ...DEFAULT_TRACK, clips: [clip('a', 'C', 0), clip('b', 'F', 1)] })
  const withChorus = addSection(base, 'chorus', 'Chorus', MAIN_SECTION)
  return withSectionTrack(withChorus, 'chorus', { ...sectionTrack(withChorus, 'chorus'), clips: [clip('c', 'A', 0, 'm')], groove: funk })
}

/** A stored history as old versions saved it: tracks, with chord names and without groove/tempo. */
const { groove: _g, bpm: _b, ...oldTrack } = DEFAULT_TRACK
const oldStep = (bars: number) => ({ ...oldTrack, bars, clips: [{ id: 'x', symbol: 'Dm7', start: 0, length: BAR }] })
const persist = (legacy = { groove: funk, bpm: 87 }) => ({
  key: 'track',
  isValid: isSong,
  migrate: (v: unknown) => migrateSong(v, legacy),
  decode: unpackSongHistory,
})

describe('isSong', () => {
  it('accepts the default song and rejects malformed ones', () => {
    expect(isSong(DEFAULT_SONG)).toBe(true)
    expect(isSong(twoSections())).toBe(true)
    expect(isSong({ ...DEFAULT_SONG, sections: [] })).toBe(false)
    expect(isSong({ ...DEFAULT_SONG, bpm: 5 })).toBe(false)
    expect(isSong({ ...DEFAULT_SONG, mode: 'nope' })).toBe(false)
    const s = DEFAULT_SONG.sections[0]
    expect(isSong({ ...DEFAULT_SONG, sections: [s, s] })).toBe(false) // ids must be unique
    expect(isSong({ ...DEFAULT_SONG, sections: [{ ...s, clips: [{ id: 'a' }] }] })).toBe(false)
    expect(isSong({ ...DEFAULT_SONG, sections: [{ ...s, name: 3 }] })).toBe(false)
    expect(isSong({ ...DEFAULT_SONG, arrangement: [{ id: 'b1', section: 'main' }] })).toBe(true)
    expect(isSong({ ...DEFAULT_SONG, arrangement: [{ id: 'b1', section: 'gone' }] })).toBe(false)
    expect(isSong(DEFAULT_TRACK)).toBe(false)
  })
})

describe('migrateSong', () => {
  it('turns a track into a song with one unnamed section', () => {
    const t: Track = { ...DEFAULT_TRACK, clips: [clip('a', 'C', 0)], bars: 2, tonic: 'D', mode: 'dorian', bpm: 90, groove: funk }
    const song = migrateSong(t) as Song
    expect(isSong(song)).toBe(true)
    expect(song).toMatchObject({ tonic: 'D', mode: 'dorian', sig: t.sig, bpm: 90, arrangement: [] })
    expect(song.sections).toEqual([{ id: MAIN_SECTION, name: null, clips: t.clips, bars: 2, groove: funk }])
    expect(sectionTrack(song, MAIN_SECTION)).toEqual(t)
  })

  it('leaves songs alone and invalid data invalid', () => {
    const song = twoSections()
    expect(migrateSong(song)).toBe(song)
    expect(isSong(migrateSong({ nonsense: true }))).toBe(false)
    expect(isSong(migrateSong(null))).toBe(false)
  })

  it('opens an old stored history unchanged: every step a one-section song, old chords and sound kept', () => {
    const stored = { past: [oldStep(1), oldStep(2)], present: oldStep(4), future: [oldStep(8)] }
    const h = readHistory<Song>(JSON.parse(JSON.stringify(stored)), persist())
    expect(h).not.toBeNull()
    const steps = [...h!.past, h!.present, ...h!.future]
    expect(steps.map((s) => s.sections[0].bars)).toEqual([1, 2, 4, 8])
    for (const s of steps) {
      expect(s.sections.map((x) => x.id)).toEqual([MAIN_SECTION])
      expect(s.sections[0].groove).toEqual(funk)
      expect(s.bpm).toBe(87)
      expect(chordName(s.sections[0].clips[0].chord!)).toBe('Dm7')
    }
    // Undo still walks the same steps.
    expect(undo({ ...h!, gesture: null }).present.sections[0].bars).toBe(2)
  })
})

describe('saving the history', () => {
  it('round-trips, storing each section version once', () => {
    let h = initHistory(twoSections())
    for (const bars of [2, 8, 1]) h = commit(h, (s) => withSectionTrack(s, 'chorus', { ...sectionTrack(s, 'chorus'), bars }))
    h = undo(h)
    const stored: StoredHistory<Song> = { past: h.past, present: h.present, future: h.future }
    const packed = packSongHistory(stored)
    // The main section never changed: one copy. The chorus: four versions.
    expect(packed.pool).toHaveLength(5)
    const back = readHistory<Song>(JSON.parse(JSON.stringify(packed)), persist())!
    expect({ past: back.past, present: back.present, future: back.future }).toEqual(JSON.parse(JSON.stringify(stored)))
    // Steps share sections again, as they did before saving.
    expect(back.past[0].sections[0]).toBe(back.present.sections[0])
  })

  it('shares equal copies too (a freshly migrated history)', () => {
    const a = songFromTrack(DEFAULT_TRACK)
    const b = { ...songFromTrack(DEFAULT_TRACK), tonic: 'D' }
    expect(packSongHistory({ past: [a], present: b, future: [] }).pool).toHaveLength(1)
  })

  it('keeps a long song history about the size of one section per step', () => {
    let song = twoSections()
    for (const id of ['v1', 'v2']) song = addSection(song, id, 'Verse', MAIN_SECTION)
    let h = initHistory(song)
    for (let i = 0; i < 200; i++) {
      const id = song.sections[i % 4].id
      h = commit(h, (s) => withSectionTrack(s, id, { ...sectionTrack(s, id), clips: [clip(`n${i}`, 'G', i % 4)] }))
    }
    const plain = JSON.stringify({ past: h.past, present: h.present, future: h.future }).length
    const packed = JSON.stringify(packSongHistory(h)).length
    expect(packed).toBeLessThan(plain / 2.5)
  })

  it('treats a step pointing outside the pool as invalid', () => {
    const packed = JSON.parse(JSON.stringify(packSongHistory({ past: [], present: DEFAULT_SONG, future: [] })))
    packed.present.sections = [7]
    expect(readHistory(packed, persist())).toBeNull()
  })
})

describe('a section seen as a track', () => {
  it('reads the shared settings from the song and the rest from the section', () => {
    const song = { ...twoSections(), tonic: 'A', bpm: 100 }
    expect(sectionTrack(song, 'chorus')).toMatchObject({ tonic: 'A', bpm: 100, groove: funk, clips: [clip('c', 'A', 0, 'm')] })
    // A stale id falls back to the first section.
    expect(sectionTrack(song, 'gone').clips).toBe(song.sections[0].clips)
  })

  it('writes shared settings to the song and the rest to that section only', () => {
    const song = twoSections()
    const t = sectionTrack(song, 'chorus')
    const next = withSectionTrack(song, 'chorus', { ...t, bpm: 140, mode: 'aeolian', bars: 2 })
    expect(next).toMatchObject({ bpm: 140, mode: 'aeolian' })
    expect(next.sections[1].bars).toBe(2)
    expect(next.sections[0]).toBe(song.sections[0])
    expect(sectionTrack(next, MAIN_SECTION)).toMatchObject({ bpm: 140, mode: 'aeolian', bars: 4 })
  })

  it('an edit that changes nothing returns the same song, so it adds no undo step', () => {
    const song = twoSections()
    const t = sectionTrack(song, 'chorus')
    expect(withSectionTrack(song, 'chorus', t)).toBe(song)
    expect(withSectionTrack(song, 'chorus', withMusic(t, { bpm: t.bpm }))).toBe(song)
    const lens = (update: (t: Track) => Track) => (s: Song) => withSectionTrack(s, 'chorus', update(sectionTrack(s, 'chorus')))
    expect(commit(initHistory(song), lens((x) => withMusic(x, { groove: JSON.parse(JSON.stringify(x.groove)) }))).past).toHaveLength(0)
    expect(commit(initHistory(song), lens((x) => ({ ...x, bars: 8 }))).past).toHaveLength(1)
  })
})

describe('section edits', () => {
  it('adds an empty section with the current one’s instruments and length, numbered when taken', () => {
    const song = twoSections()
    const next = addSection(song, 'v', 'Verse', 'chorus')
    expect(next.sections.at(-1)).toEqual({ id: 'v', name: 'Verse', clips: [], bars: 4, groove: funk })
    expect(addSection(next, 'v2', 'Verse', MAIN_SECTION).sections.at(-1)).toMatchObject({ name: 'Verse 2', groove: song.sections[0].groove })
  })

  it('renames, trimmed and kept unique; empty or unchanged names change nothing', () => {
    const song = twoSections()
    expect(renameSection(song, MAIN_SECTION, '  Verse ').sections[0].name).toBe('Verse')
    expect(renameSection(song, MAIN_SECTION, 'Chorus').sections[0].name).toBe('Chorus 2')
    expect(renameSection(song, MAIN_SECTION, '   ')).toBe(song)
    expect(renameSection(song, 'chorus', 'Chorus')).toBe(song)
    expect(renameSection(song, 'gone', 'X')).toBe(song)
  })

  it('makes a new section from one: a numbered copy right after it', () => {
    const song = addSection(twoSections(), 'v', 'Verse', MAIN_SECTION)
    const next = copySection(song, 'chorus', 'chorus2')
    expect(next.sections.map(sectionName)).toEqual(['Progression', 'Chorus', 'Chorus 2', 'Verse'])
    expect(next.sections[2]).toMatchObject({ clips: song.sections[1].clips, groove: funk, bars: 4 })
    expect(copySection(next, 'chorus2', 'c3').sections[3].name).toBe('Chorus 3')
    expect(copySection(song, MAIN_SECTION, 'p2').sections[1].name).toBe('Progression 2')
  })

  it('deletes a section and its places in the song, never the last one', () => {
    const song = { ...twoSections(), arrangement: [{ id: 'b1', section: 'chorus' }, { id: 'b2', section: MAIN_SECTION }] }
    const next = removeSection(song, 'chorus')
    expect(next.sections.map((s) => s.id)).toEqual([MAIN_SECTION])
    expect(next.arrangement).toEqual([{ id: 'b2', section: MAIN_SECTION }])
    expect(removeSection(next, MAIN_SECTION)).toBe(next)
  })

  it('knows each label’s kind and color', () => {
    expect(sectionKind('Verse 2')).toBe('verse')
    expect(sectionKind('pre chorus')).toBe('pre-chorus')
    expect(sectionKind('PRE-CHORUS 3')).toBe('pre-chorus')
    expect(sectionKind('My bit')).toBeNull()
    expect(sectionKind(null)).toBeNull()
    const song = twoSections()
    expect(sectionHue(song.sections[0])).toBeNull()
    expect(sectionHue(song.sections[1])).toBe(330)
  })
})

describe('changedSection: undo never changes something off screen', () => {
  const song = twoSections()
  const editMain = (s: Song) => withSectionTrack(s, MAIN_SECTION, { ...sectionTrack(s, MAIN_SECTION), clips: [] })

  it('switches to the section an undo changed', () => {
    let h = commit(initHistory(song), editMain)
    // Editing the Chorus now: undo changes the main section.
    const before = h.present
    h = undo(h)
    expect(changedSection(before, h.present, 'chorus')).toBe(MAIN_SECTION)
    expect(changedSection(h.present, redo(h).present, 'chorus')).toBe(MAIN_SECTION)
  })

  it('stays when the edited section changed, or only shared settings did', () => {
    const edited = editMain(song)
    expect(changedSection(edited, song, MAIN_SECTION)).toBe(MAIN_SECTION)
    expect(changedSection(song, { ...song, tonic: 'D' }, 'chorus')).toBe('chorus')
    // A meter change rescales every section: still no reason to move.
    expect(changedSection(song, rescaleSong(song, { beats: 3, unit: 4 }), 'chorus')).toBe('chorus')
    expect(changedSection(song, renameSection(song, MAIN_SECTION, 'Verse'), 'chorus')).toBe('chorus')
  })

  it('goes to the section before one that undo removed, and to one that came back', () => {
    const added = addSection(song, 'v', 'Verse', 'chorus')
    expect(changedSection(added, song, 'v')).toBe('chorus')
    const removed = removeSection(song, 'chorus')
    expect(changedSection(removed, song, MAIN_SECTION)).toBe('chorus')
  })

  it('works after a reload, when steps no longer share objects', () => {
    const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
    expect(changedSection(copy(editMain(song)), copy(song), 'chorus')).toBe(MAIN_SECTION)
    expect(changedSection(copy(song), copy({ ...song, bpm: 99 }), 'chorus')).toBe('chorus')
  })
})

describe('song-wide changes', () => {
  it('a new time signature rescales every section', () => {
    const next = rescaleSong(twoSections(), { beats: 3, unit: 4 })
    expect(next.sections.map((s) => s.clips.map((c) => [c.start, c.length]))).toEqual([
      [
        [0, 1440],
        [1440, 1440],
      ],
      [[0, 1440]],
    ])
    const same = twoSections()
    expect(rescaleSong(same, { beats: 4, unit: 4 })).toBe(same)
  })

  it('moves every section’s chords', () => {
    const next = mapSongChords(twoSections(), (c) => chordToKey(c, { tonic: 'C', mode: 'ionian' }, { tonic: 'D', mode: 'ionian' }))
    expect(next.sections.map((s) => s.clips.map((c) => chordName(c.chord!)))).toEqual([['D', 'G'], ['Bm']])
  })

  it('lays every section end to end for key detection', () => {
    expect(songClips(twoSections()).map((c) => [chordName(c.chord!), c.start / BAR])).toEqual([
      ['C', 0],
      ['F', 1],
      ['Am', 4],
    ])
  })

  it('a progression takes its mood only when no other section has chords; its tempo is the song’s', () => {
    const minor = PROGRESSIONS.find((p) => p.mode === 'aeolian')!
    const song = twoSections()
    const into = songWithProgression(song, 'chorus', minor, { chords: true, instruments: true })
    expect(into.mode).toBe('ionian')
    expect(into.bpm).toBe(minor.bpm)
    expect(into.sections[0]).toBe(song.sections[0])
    expect(into.sections[1].clips.length).toBeGreaterThan(0)
    const alone = removeSection(song, MAIN_SECTION)
    expect(songWithProgression(alone, 'chorus', minor, { chords: true, instruments: false }).mode).toBe('aeolian')
  })
})

describe('the arrangement', () => {
  /** Main (4 bars, C F) and Chorus (4 bars, Am) arranged as: main, chorus, main, chorus (blocks 1–4). */
  const arranged = () => insertBlocks(twoSections(), 0, [MAIN_SECTION, 'chorus', MAIN_SECTION, 'chorus'], ['1', '2', '3', '4'])
  const order = (s: Song) => s.arrangement.map((b) => b.id).join('')

  it('blocks play back to back, each as long as its section', () => {
    const song = changeChorusBars(arranged(), 2)
    expect(blockSpans(song).map((b) => [b.id, b.start / BAR, b.length / BAR])).toEqual([
      ['1', 0, 4],
      ['2', 4, 2],
      ['3', 6, 4],
      ['4', 10, 2],
    ])
    expect(songTicks(song)).toBe(12 * BAR)
    expect(songTicks(twoSections())).toBe(0)
  })

  it('inserts sections at a gap; unknown sections are skipped', () => {
    const song = insertBlocks(arranged(), 1, ['chorus', 'nope'], ['x', 'y'])
    expect(order(song)).toBe('1x234')
    expect(order(insertBlocks(arranged(), 99, ['chorus'], ['x']))).toBe('1234x')
    const empty = twoSections()
    expect(insertBlocks(empty, 0, ['nope'], ['x'])).toBe(empty)
  })

  it('moves blocks as one run, gap counted before they are lifted out', () => {
    expect(order(moveBlocks(arranged(), ['1'], 3))).toBe('2314')
    expect(order(moveBlocks(arranged(), ['4'], 0))).toBe('4123')
    // Scattered blocks are gathered, in song order.
    expect(order(moveBlocks(arranged(), ['3', '1'], 4))).toBe('2413')
    expect(order(moveBlocks(arranged(), ['1', '3'], 2))).toBe('2134')
  })

  it('a move that changes nothing is the same song (no undo step)', () => {
    const song = arranged()
    expect(moveBlocks(song, ['2'], 1)).toBe(song)
    expect(moveBlocks(song, ['2'], 2)).toBe(song)
    expect(moveBlocks(song, ['nope'], 0)).toBe(song)
  })

  it('⌥←/→ moves a selection one place, not past the edges', () => {
    const song = arranged()
    expect(order(moveBlocks(song, ['2'], stepGap(song, ['2'], 1)!))).toBe('1324')
    expect(order(moveBlocks(song, ['2', '3'], stepGap(song, ['2', '3'], -1)!))).toBe('2314')
    expect(stepGap(song, ['1'], -1)).toBeNull()
    expect(stepGap(song, ['4'], 1)).toBeNull()
  })

  it('duplicates are linked copies right after the last selected block', () => {
    const song = duplicateBlocks(arranged(), ['3', '1'], ['a', 'b'])
    expect(order(song)).toBe('123ab4')
    expect(song.arrangement.slice(3, 5).map((b) => b.section)).toEqual([MAIN_SECTION, MAIN_SECTION])
    expect(song.sections.length).toBe(2)
  })

  it('removing blocks keeps their sections', () => {
    const song = removeBlocks(arranged(), ['2', '4'])
    expect(order(song)).toBe('13')
    expect(song.sections.map((s) => s.id)).toEqual([MAIN_SECTION, 'chorus'])
    const same = arranged()
    expect(removeBlocks(same, ['nope'])).toBe(same)
  })

  it('"Make a new section from this" on a block: that block plays an independent copy, the others stay linked', () => {
    const song = forkBlock(arranged(), '2', 'chorus2')
    expect(song.sections.map(sectionName)).toEqual([UNNAMED, 'Chorus', 'Chorus 2'])
    expect(song.arrangement.map((b) => b.section)).toEqual([MAIN_SECTION, 'chorus2', MAIN_SECTION, 'chorus'])
    expect(isSong(song)).toBe(true)
  })

  it('plays one segment per block with its section’s chords and instruments', () => {
    const segs = songSegments(arranged())
    expect(segs.map((s) => [s.start / BAR, s.length / BAR, s.clips.length, s.groove === funk])).toEqual([
      [0, 4, 2, false],
      [4, 4, 1, true],
      [8, 4, 2, false],
      [12, 4, 1, true],
    ])
  })

  it('key detection hears the song in order, then sections that aren’t in it', () => {
    const song = insertBlocks(twoSections(), 0, ['chorus', 'chorus'], ['x', 'y'])
    expect(songClips(song).map((c) => [chordName(c.chord!), c.start / BAR])).toEqual([
      ['Am', 0],
      ['Am', 4],
      ['C', 8],
      ['F', 9],
    ])
  })

  it('the gap under the pointer: before the block whose first half it is in', () => {
    const spans = blockSpans(arranged())
    expect([0, 1.9, 2.1, 6, 15.9, 40].map((bar) => blockGap(spans, bar * BAR))).toEqual([0, 0, 1, 2, 4, 4])
    expect(blockGap([], 0)).toBe(0)
  })

  it('song length in minutes and seconds', () => {
    expect(formatDuration(64 * BAR, 120)).toBe('2:08')
    expect(formatDuration(BAR, 120)).toBe('0:02')
  })

  it('a deleted section leaves the song too', () => {
    expect(order(removeSection(arranged(), 'chorus'))).toBe('13')
  })
})

const UNNAMED = sectionName({ id: '', name: null, clips: [], bars: 4, groove: DEFAULT_GROOVE })
const changeChorusBars = (song: Song, bars: number): Song => ({
  ...song,
  sections: song.sections.map((s) => (s.id === 'chorus' ? { ...s, bars } : s)),
})
