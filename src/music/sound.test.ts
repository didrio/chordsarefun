import { describe, expect, it } from 'vitest'
import { BASS_SOUNDS, CHORD_SOUNDS, cutoffHz, partDb } from './sound'

describe('sound', () => {
  it('maps brightness to a cutoff from dark to fully open', () => {
    expect(cutoffHz(0)).toBe(200)
    expect(cutoffHz(1)).toBeGreaterThan(15000)
    expect(cutoffHz(0.5)).toBeGreaterThan(cutoffHz(0.4))
  })

  it('mutes at zero volume and trims louder instruments', () => {
    expect(partDb(0)).toBe(-Infinity)
    expect(partDb(1, -7)).toBeLessThan(partDb(1))
  })

  it('has unique instrument ids, keeping the old wave ids', () => {
    expect(new Set(CHORD_SOUNDS.map((s) => s.id)).size).toBe(CHORD_SOUNDS.length)
    expect(new Set(BASS_SOUNDS.map((s) => s.id)).size).toBe(BASS_SOUNDS.length)
    for (const wave of ['triangle', 'sine', 'square', 'sawtooth']) expect(CHORD_SOUNDS.some((s) => s.id === wave)).toBe(true)
  })
})
