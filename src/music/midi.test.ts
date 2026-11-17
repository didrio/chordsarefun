import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { makeChord } from './chord'
import { applyGroove, DEFAULT_GROOVE, GROOVES } from './grooves'
import { songMidi } from './midi'
import { TICKS_PER_BEAT } from './timeline'

const BAR = 4 * TICKS_PER_BEAT
const sig = { beats: 4, unit: 4 }
const chord = (root: string, start: number) => ({ id: root, chord: makeChord(root), start, length: BAR })

describe('songMidi', () => {
  const chordsOnly = applyGroove(DEFAULT_GROOVE, GROOVES[0])
  const segments = [
    { start: 0, length: BAR, clips: [chord('C', 0)], groove: chordsOnly },
    { start: BAR, length: BAR, clips: [chord('G', 0)], groove: chordsOnly },
  ]

  it('puts each block at its song time, with a marker at every block start', () => {
    const midi = new Midi(songMidi({ segments, markers: [{ tick: 0, text: 'Verse' }, { tick: BAR, text: 'Chorus' }], bpm: 120, sig, parts: ['chords'] }))
    const ppq = midi.header.ppq
    const notes = midi.tracks[0].notes
    expect(notes).toHaveLength(6)
    expect(notes[3].ticks).toBe(4 * ppq)
    expect(midi.header.meta.filter((m) => m.type === 'marker').map((m) => [m.text, m.ticks])).toEqual([
      ['Verse', 0],
      ['Chorus', 4 * ppq],
    ])
  })

  it("leaves out a part where a block's instruments have it off", () => {
    const withBass = { ...chordsOnly, bass: { ...DEFAULT_GROOVE.bass, on: true, volume: 1 } }
    const midi = new Midi(
      songMidi({ segments: [{ ...segments[0], groove: chordsOnly }, { ...segments[1], groove: withBass }], bpm: 120, sig, parts: ['chords', 'bass'] }),
    )
    const bass = midi.tracks[1].notes
    expect(bass.length).toBeGreaterThan(0)
    expect(bass.every((n) => n.ticks >= 4 * midi.header.ppq)).toBe(true)
  })
})
