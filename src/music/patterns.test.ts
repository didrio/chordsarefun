import { describe, expect, it } from 'vitest'
import { voiceChord } from './chord'
import { parseChord } from './parse'
import { bassNoteFor, BASS_PATTERNS, CHORD_PATTERNS, chordPartVoicing, DRUM_PATTERNS, drumEvents, drumPattern, renderTrack, swingTick, type Arrangement } from './patterns'
import { MAX_SIG_BEATS, NOTE_UNITS, sigBarTicks, TICKS_PER_BEAT, type Clip, type TimeSignature } from './timeline'

const BEAT = TICKS_PER_BEAT
const BAR = 4 * BEAT
const FOUR: TimeSignature = { beats: 4, unit: 4 }
const clip = (name: string, start: number, length: number): Clip => ({ id: name + start, chord: parseChord(name)!, start, length })
const arr = (over: Partial<Arrangement> = {}): Arrangement => ({ chordPattern: 'block', bassPattern: 'root', drumPattern: 'pop', swing: 0, ...over })
const render = (clips: Clip[], over: Partial<Arrangement>, total = 4 * BAR, sig = FOUR) => renderTrack(clips, total, sig, arr(over))

describe('chord patterns', () => {
  it('"Whole chord" plays each chord once, held (how the app always sounded)', () => {
    const { chords } = render([clip('C', 0, BAR), clip('G', BAR, BAR)], {})
    expect(chords.map((e) => [e.tick, e.midi])).toEqual([
      [0, 48], [0, 52], [0, 55], [BAR, 55], [BAR, 59], [BAR, 62],
    ])
    expect(chords[0].duration).toBeGreaterThan(0.95 * BAR)
    expect(chords[0].group).toBe(3)
  })

  it('pulsing 8ths hit the whole chord on every 8th', () => {
    const { chords } = render([clip('C', 0, BAR)], { chordPattern: 'pulse8' })
    expect(new Set(chords.map((e) => e.tick)).size).toBe(8)
  })

  it('offbeat stabs skip the beat, even when the chord starts', () => {
    const { chords } = render([clip('C', 0, BAR)], { chordPattern: 'offbeat' })
    expect(chords.every((e) => e.tick % BEAT === BEAT / 2)).toBe(true)
  })

  it('a rhythm without a hit where the chord starts still sounds it there', () => {
    const { chords } = render([clip('C', 0, BEAT), clip('F', BEAT, 3 * BEAT)], { chordPattern: 'pushes' })
    expect(chords.some((e) => e.tick === BEAT)).toBe(true)
  })

  it('arpeggios play one note at a time, cycling low to high', () => {
    const { chords } = render([clip('C', 0, BAR)], { chordPattern: 'arpUp' })
    expect(chords.slice(0, 4).map((e) => e.midi)).toEqual([48, 52, 55, 48])
    expect(chords.every((e) => e.group === 1)).toBe(true)
  })

  it('strums spread the notes, down low-to-high and up high-to-low', () => {
    const { chords } = render([clip('C', 0, BAR)], { chordPattern: 'strum' })
    const down = chords.filter((e) => e.tick < BEAT / 4)
    expect(down.map((e) => e.midi)).toEqual([48, 52, 55])
    expect(down[1].tick).toBeGreaterThan(down[0].tick)
  })

  it('ballad holds the bass note and repeats the rest on each beat', () => {
    const { chords } = render([clip('C', 0, BAR)], { chordPattern: 'ballad' })
    const low = chords.filter((e) => e.midi === 48)
    expect(low).toHaveLength(1)
    expect(low[0].duration).toBeGreaterThan(0.9 * BAR)
    expect(chords.filter((e) => e.midi === 55)).toHaveLength(4)
  })
})

describe('bass patterns', () => {
  it('play the bass note (root, or a slash chord\'s bass) in the bass register; inversions don\'t move it', () => {
    const inverted = { ...parseChord('C')!, inversion: 1 }
    const { bass } = render([clip('C', 0, BAR), clip('C/E', BAR, BAR), { ...clip('C', 2 * BAR, BAR), chord: inverted }], {})
    expect(bass.map((e) => e.midi)).toEqual([36, 40, 36])
  })

  it('walking bass steps into the next chord by a half step', () => {
    const { bass } = render([clip('C', 0, BAR), clip('F', BAR, BAR)], { bassPattern: 'walking' })
    const first = bass.filter((e) => e.tick < BAR).map((e) => e.midi)
    expect(first[0]).toBe(36)
    expect([40, 42]).toContain(first[3]) // a half step from F (41)
  })
})

describe('slash chords and empty clips', () => {
  it('chords carry a slash bass note themselves only when the bass part is off', () => {
    const c = clip('C/E', 0, BAR)
    const notes = (bassOn: boolean) => render([c], { bassOn }).chords.map((e) => e.midi)
    expect(notes(true)).toEqual([48, 52, 55])
    // E2 under the voicing, like a pianist's left hand.
    expect(notes(false)).toEqual([40, 48, 52, 55])
    expect(chordPartVoicing(parseChord('C')!, false)).toEqual([48, 52, 55])
  })

  it('a slash bass outside the chord is played too (F/G: G under F A C)', () => {
    expect(chordPartVoicing(parseChord('F/G')!, false)).toEqual([43, 53, 57, 60])
    expect(bassNoteFor(parseChord('F/G')!)).toBe(43)
  })

  it('empty clips are silent', () => {
    const r = render([{ id: 'e', chord: null, start: 0, length: BAR }, clip('F', BAR, BAR)], {})
    expect(r.chords.every((e) => e.tick >= BAR)).toBe(true)
    expect(r.bass.every((e) => e.tick >= BAR)).toBe(true)
  })
})

describe('drum patterns', () => {
  it('repeat every bar', () => {
    const kicks = drumEvents(drumPattern('four'), 2 * BAR, FOUR).filter((e) => e.voice === 'kick')
    expect(kicks.map((e) => e.tick)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => i * BEAT))
  })

  it('restart at each bar line in other meters', () => {
    const sig = { beats: 7, unit: 8 }
    const bar = sigBarTicks(sig)
    const events = drumEvents(drumPattern('pop'), 2 * bar, sig)
    expect(events.every((e) => e.tick < 2 * bar)).toBe(true)
    expect(events.filter((e) => e.voice === 'kick' && e.tick === bar)).toHaveLength(1)
  })
})

describe('swing', () => {
  it('pushes 8th offbeats late, up to a triplet', () => {
    expect(swingTick(BEAT / 2, 0)).toBe(BEAT / 2)
    expect(swingTick(BEAT / 2, 1)).toBe((2 * BEAT) / 3)
    expect(swingTick(BEAT, 1)).toBe(BEAT)
    const { drums } = render([], { drumPattern: 'rock', swing: 1 })
    expect(drums.some((e) => e.tick === (2 * BEAT) / 3)).toBe(true)
  })
})

describe('every pattern in every time signature', () => {
  const sigs: TimeSignature[] = []
  for (const unit of NOTE_UNITS) for (let beats = 1; beats <= MAX_SIG_BEATS; beats++) sigs.push({ beats, unit })

  it('keeps notes inside their clips, with positive lengths', () => {
    for (const sig of sigs) {
      const bar = sigBarTicks(sig)
      const total = 2 * bar
      // A clip starting off the grid and one crossing the bar line.
      const clips = [clip('Cmaj7', 0, Math.round(bar * 0.37)), clip('Am9/C', Math.round(bar * 0.37), total - Math.round(bar * 0.37))]
      // Chord and bass patterns are independent, so each list is checked on its own.
      const combos = [
        ...CHORD_PATTERNS.map((cp) => ({ chordPattern: cp.id, bassPattern: 'root' })),
        ...BASS_PATTERNS.map((bp) => ({ chordPattern: 'block', bassPattern: bp.id })),
      ]
      for (const combo of combos) {
        const r = renderTrack(clips, total, sig, arr(combo))
        for (const e of [...r.chords, ...r.bass]) {
          const c = clips.find((x) => x.start <= e.tick && e.tick < x.start + x.length)
          expect(c, `${combo.chordPattern}/${combo.bassPattern} in ${sig.beats}/${sig.unit}`).toBeDefined()
          expect(e.duration).toBeGreaterThan(0)
          expect(e.tick + e.duration).toBeLessThanOrEqual(c!.start + c!.length)
        }
        // Patterns that only play between beats can't fit in very short bars (e.g. 1/16);
        // everything else always sounds.
        if (!['offbeat', 'backbeat'].includes(combo.chordPattern)) expect(r.chords.length).toBeGreaterThan(0)
        if (combo.bassPattern !== 'offbeat') expect(r.bass.length).toBeGreaterThan(0)
      }
      for (const dp of DRUM_PATTERNS) {
        expect(drumEvents(dp, total, sig).every((e) => e.tick >= 0 && e.tick < total)).toBe(true)
      }
    }
  })

  it('only uses notes from the chord (or the bass approach note)', () => {
    const c = clip('Dm7', 0, BAR)
    const pcs = new Set(voiceChord(c.chord!).map((m) => m % 12))
    for (const cp of CHORD_PATTERNS) {
      for (const e of renderTrack([c], BAR, FOUR, arr({ chordPattern: cp.id })).chords) expect(pcs.has(e.midi % 12)).toBe(true)
    }
  })
})
