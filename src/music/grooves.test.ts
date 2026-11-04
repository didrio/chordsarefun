import { describe, expect, it } from 'vitest'
import { applyGroove, DEFAULT_GROOVE, GROOVES, isGrooveSettings, matchingGroove, pickRandom, randomBpm } from './grooves'
import { GENRES } from './progressions'
import { BASS_PATTERNS, CHORD_PATTERNS, DRUM_PATTERNS } from './patterns'
import { BASS_SOUNDS, CHORD_SOUNDS, chordSound } from './sound'

const has = (list: { id: string }[], id: string) => list.some((x) => x.id === id)

describe('grooves', () => {
  it('every preset uses real sounds and patterns, with unique ids', () => {
    expect(new Set(GROOVES.map((g) => g.id)).size).toBe(GROOVES.length)
    for (const g of GROOVES) {
      expect(has(CHORD_SOUNDS, g.chords.sound) && has(CHORD_PATTERNS, g.chords.pattern), g.id).toBe(true)
      expect(has(BASS_SOUNDS, g.bass.sound) && has(BASS_PATTERNS, g.bass.pattern), g.id).toBe(true)
      expect(has(DRUM_PATTERNS, g.drums.pattern), g.id).toBe(true)
    }
  })

  it('the default is Pop, with every part on; "Just chords" stays first', () => {
    expect(matchingGroove(DEFAULT_GROOVE)?.id).toBe('pop')
    expect(DEFAULT_GROOVE.bass.on && DEFAULT_GROOVE.drums.on).toBe(true)
    expect(GROOVES[0].id).toBe('just')
    expect(isGrooveSettings(DEFAULT_GROOVE)).toBe(true)
  })

  it('every preset has a real genre and a sensible tempo range', () => {
    for (const g of GROOVES) {
      expect(GENRES as readonly string[]).toContain(g.genre)
      expect(g.bpm[0]).toBeGreaterThanOrEqual(30)
      expect(g.bpm[1]).toBeLessThanOrEqual(300)
      expect(g.bpm[0]).toBeLessThanOrEqual(g.bpm[1])
    }
  })

  it('random picks avoid the current item and stay in range', () => {
    expect(pickRandom([1, 2], 1, () => 0)).toBe(2)
    expect(pickRandom([1], 1, () => 0.9)).toBe(1)
    expect(randomBpm([70, 90], () => 0)).toBe(70)
    expect(randomBpm([70, 90], () => 0.999)).toBe(90)
  })

  it('applying a preset sets its mix and brightness, and is recognized', () => {
    for (const g of GROOVES) {
      const s = applyGroove(DEFAULT_GROOVE, g)
      expect([s.chords.volume, s.bass.volume, s.drums.volume]).toEqual(g.mix)
      expect(s.chords.brightness).toBe(g.brightness ?? chordSound(g.chords.sound).brightness)
      expect(matchingGroove(s)?.id).toBe(g.id)
    }
  })

  it('volume and brightness tweaks keep the preset (not "Custom")', () => {
    const pop = applyGroove(DEFAULT_GROOVE, GROOVES.find((g) => g.id === 'pop')!)
    const tweaked = { ...pop, chords: { ...pop.chords, volume: 0.2, brightness: 0.1 } }
    expect(matchingGroove(tweaked)?.id).toBe('pop')
  })

  it('every mix volume is a usable slider position', () => {
    for (const g of GROOVES) for (const v of g.mix) expect(v > 0 && v <= 1, g.id).toBe(true)
  })

  it('a changed part no longer matches its preset', () => {
    const pop = applyGroove(DEFAULT_GROOVE, GROOVES.find((g) => g.id === 'pop')!)
    expect(matchingGroove({ ...pop, drums: { ...pop.drums, pattern: 'trap' } })).toBeNull()
  })

  it('rejects malformed stored settings', () => {
    expect(isGrooveSettings(null)).toBe(false)
    expect(isGrooveSettings({ ...DEFAULT_GROOVE, swing: 3 })).toBe(false)
    expect(isGrooveSettings({ ...DEFAULT_GROOVE, bass: { on: true } })).toBe(false)
  })
})
