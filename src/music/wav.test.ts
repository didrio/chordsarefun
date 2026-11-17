import { describe, expect, it } from 'vitest'
import { encodeWav, renderedWav, toInt24, trimTail } from './wav'

const ascii = (bytes: Uint8Array, at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n))
/** The signed 24-bit sample at a byte offset. */
const int24 = (bytes: Uint8Array, at: number) => {
  const v = bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)
  return v & 0x800000 ? v - 0x1000000 : v
}

describe('encodeWav', () => {
  it('writes a 24-bit stereo 44.1 kHz PCM header', () => {
    const frames = 10
    const bytes = encodeWav([new Float32Array(frames), new Float32Array(frames)], 44100)
    const view = new DataView(bytes.buffer)
    expect(bytes.length).toBe(44 + frames * 6)
    expect(ascii(bytes, 0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(36 + frames * 6)
    expect(ascii(bytes, 8, 4)).toBe('WAVE')
    expect(ascii(bytes, 12, 4)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(2) // stereo
    expect(view.getUint32(24, true)).toBe(44100)
    expect(view.getUint32(28, true)).toBe(44100 * 6) // byte rate
    expect(view.getUint16(32, true)).toBe(6) // block align: 2 channels × 3 bytes
    expect(view.getUint16(34, true)).toBe(24)
    expect(ascii(bytes, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(frames * 6)
  })

  it('interleaves the channels, little-endian', () => {
    const left = new Float32Array([0, 1, -1])
    const right = new Float32Array([-0.5, 0.5, 0])
    const bytes = encodeWav([left, right], 44100)
    const samples = Array.from({ length: 6 }, (_, i) => int24(bytes, 44 + i * 3))
    expect(samples).toEqual([0, toInt24(-0.5), 0x7fffff, toInt24(0.5), -0x800000, 0])
    expect(Array.from(bytes.subarray(47, 50))).toEqual([0x00, 0x00, 0xc0]) // −0.5 = −0x400000
  })

  it('clips samples outside −1…1 (and treats NaN as silence)', () => {
    expect(toInt24(1.7)).toBe(0x7fffff)
    expect(toInt24(-3)).toBe(-0x800000)
    expect(toInt24(NaN)).toBe(0)
    expect(toInt24(-0.5)).toBe(-0x400000)
  })
})

describe('trimTail', () => {
  it('cuts the silent end but keeps the last audible sample', () => {
    const left = new Float32Array([0.5, 0, 0.2, 0, 0, 0, 0, 0])
    const right = new Float32Array([0, 0, 0, 0.3, 0.00001, 0, 0, 0])
    const [l, r] = trimTail([left, right], 2)
    expect(l.length).toBe(4)
    expect(r.length).toBe(4)
    expect(r[3]).toBeCloseTo(0.3)
  })

  it('never cuts before the end of the last bar', () => {
    const quiet = new Float32Array([0.5, 0, 0, 0, 0, 0])
    expect(trimTail([quiet], 5)[0].length).toBe(5)
    expect(trimTail([new Float32Array(6)], 3)[0].length).toBe(3)
    expect(trimTail([new Float32Array(4)], 10)[0].length).toBe(4)
  })
})

describe('renderedWav', () => {
  it('writes every channel of a render, its silent tail cut but never before the last bar', () => {
    const rate = 10
    const left = new Float32Array(30).fill(0.1, 0, 12)
    const right = new Float32Array(30)
    const buffer = { numberOfChannels: 2, sampleRate: rate, getChannelData: (i: number) => (i === 0 ? left : right) }
    const view = (bytes: Uint8Array) => new DataView(bytes.buffer)
    // Sound until frame 12; the bars end at 1 s (frame 10): the file keeps the sound.
    expect(view(renderedWav({ buffer, end: 1 })).getUint32(40, true)).toBe(12 * 6)
    // The bars end at 2 s: silence up to there is kept.
    expect(view(renderedWav({ buffer, end: 2 })).getUint32(40, true)).toBe(20 * 6)
    expect(view(renderedWav({ buffer, end: 2 })).getUint32(24, true)).toBe(rate)
  })
})
