import { describe, expect, it } from 'vitest'
import { createLimiter, LIMITER, LIMITER_CEILING, limiterLatency, limiterWorkletSource } from './limiter'

const RATE = 44100
const LATENCY = limiterLatency(RATE)

/** Run stereo audio through a fresh limiter in blocks of `block` frames (as an AudioWorklet does: 128). */
function run(channels: Float32Array[], block = 128): Float32Array[] {
  const limiter = createLimiter(RATE, LIMITER)
  const frames = channels[0].length
  const out = channels.map(() => new Float32Array(frames))
  for (let s = 0; s < frames; s += block) {
    const e = Math.min(frames, s + block)
    limiter.process(
      channels.map((c) => c.subarray(s, e)),
      out.map((c) => c.subarray(s, e)),
    )
  }
  return out
}

const peak = (channels: Float32Array[]) => Math.max(...channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)))

/** A seeded random generator, so the noise test is the same every run. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32
    return seed / 2 ** 32
  }
}

const sine = (frames: number, amp: number, hz = 220) => Float32Array.from({ length: frames }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE))

describe('limiter', () => {
  it('is 5 ms of lookahead, with a −1 dBFS ceiling', () => {
    expect(LATENCY).toBe(Math.round(0.005 * RATE))
    expect(LIMITER_CEILING).toBeCloseTo(0.8913, 4)
    expect(LIMITER.ceilingDb).toBe(-1)
  })

  it('never goes over the ceiling: impulses, loud bursts, noise', () => {
    const frames = RATE
    const impulses = new Float32Array(frames)
    for (let i = 100; i < frames; i += 997) impulses[i] = i % 2 ? 4 : -3
    const burst = Float32Array.from({ length: frames }, (_, i) => (i % 5000 < 400 ? (i % 40 < 20 ? 4 : -4) : 0.3 * Math.sin(i / 10)))
    const r = rng(7)
    const noise = Float32Array.from({ length: frames }, () => (r() * 2 - 1) * 3)
    for (const signal of [impulses, burst, noise]) {
      expect(peak(run([signal, signal.map((v) => -v * 0.5)]))).toBeLessThanOrEqual(LIMITER_CEILING)
    }
  })

  it('passes audio under the ceiling untouched, only delayed', () => {
    const left = sine(4000, 0.85)
    const right = sine(4000, 0.5, 330)
    const [l, r] = run([left, right])
    expect(Array.from(l.subarray(0, LATENCY))).toEqual(new Array(LATENCY).fill(0))
    expect(l.subarray(LATENCY)).toEqual(left.subarray(0, 4000 - LATENCY))
    expect(r.subarray(LATENCY)).toEqual(right.subarray(0, 4000 - LATENCY))
  })

  it('turns a peak down smoothly before it arrives, then comes back up', () => {
    const frames = 2 * RATE
    const signal = Float32Array.from({ length: frames }, () => 0.5)
    signal[10000] = 2 // one hit, 4× over the level, 2.2× over the ceiling
    const [out] = run([signal, signal])
    const gainAt = (i: number) => out[i + LATENCY] / signal[i]
    expect(out[10000 + LATENCY]).toBeCloseTo(LIMITER_CEILING, 5) // the peak lands exactly on the ceiling
    expect(gainAt(10000 - LATENCY - 1)).toBe(1) // untouched before the lookahead window
    // The attack ramps down across the lookahead: no step.
    for (let i = 10000 - LATENCY; i < 10000; i++) expect(gainAt(i)).toBeLessThanOrEqual(gainAt(i - 1))
    const after = gainAt(10000 + LATENCY + 1)
    expect(after).toBeLessThan(0.5)
    expect(gainAt(10000 + Math.round(LIMITER.release * RATE))).toBeGreaterThan(after) // released...
    expect(gainAt(10000 + Math.round(10 * LIMITER.release * RATE))).toBeCloseTo(1, 4) // ...and back after 10 time constants
  })

  it('gives both channels the same gain', () => {
    const left = sine(8000, 3)
    const right = sine(8000, 0.4, 330)
    const [l, r] = run([left, right])
    for (let i = LATENCY + 100; i < 8000; i += 37) {
      if (Math.abs(left[i - LATENCY]) > 0.1 && Math.abs(right[i - LATENCY]) > 0.1) {
        expect(l[i] / left[i - LATENCY]).toBeCloseTo(r[i] / right[i - LATENCY], 5)
      }
    }
  })

  it('sounds the same whatever the block size', () => {
    const r = rng(3)
    const signal = Float32Array.from({ length: 20000 }, () => (r() * 2 - 1) * 2)
    expect(run([signal, signal], 128)).toEqual(run([signal, signal], 20000))
  })

  it('treats a missing input as silence', () => {
    const limiter = createLimiter(RATE, LIMITER)
    const out = [new Float32Array(128), new Float32Array(128)].map((c) => c.fill(9))
    limiter.process([], out)
    expect(peak(out)).toBe(0)
  })
})

describe('limiterWorkletSource', () => {
  it('registers a "limiter" processor that runs the same limiter, with nothing imported', () => {
    let registered: (new () => { process: (i: Float32Array[][], o: Float32Array[][]) => boolean; port: { onmessage: () => void } }) | null = null
    class AudioWorkletProcessor {
      port = { onmessage: () => {} }
    }
    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', limiterWorkletSource())(
      AudioWorkletProcessor,
      (name: string, processor: typeof registered) => {
        expect(name).toBe('limiter')
        registered = processor
      },
      RATE,
    )
    const processor = new registered!()
    const r = rng(11)
    const signal = Float32Array.from({ length: 2048 }, () => (r() * 2 - 1) * 3)
    const out = [new Float32Array(2048), new Float32Array(2048)]
    for (let s = 0; s < 2048; s += 128) {
      expect(processor.process([[signal.subarray(s, s + 128), signal.subarray(s, s + 128)]], [out.map((c) => c.subarray(s, s + 128))])).toBe(true)
    }
    expect(out).toEqual(run([signal, signal]))
    processor.port.onmessage() // "stop"
    expect(processor.process([[]], [[new Float32Array(128)]])).toBe(false)
  })
})
