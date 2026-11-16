import { beforeEach, describe, expect, it, vi } from 'vitest'
import { load, save } from './persist'

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
})

const always = () => true

describe('persist', () => {
  it('round-trips values', () => {
    save('bpm', 97)
    expect(load('bpm', 120, (v) => typeof v === 'number')).toBe(97)
  })

  it('falls back when missing, invalid, or corrupt', () => {
    expect(load('missing', 'x', always)).toBe('x')
    save('bpm', 'fast')
    expect(load('bpm', 120, (v) => typeof v === 'number')).toBe(120)
    localStorage.setItem('chords:v1:broken', '{not json')
    expect(load('broken', 1, always)).toBe(1)
  })

  it('keeps working if storage throws (e.g. full or private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('full')
      },
    })
    expect(() => save('x', 1)).not.toThrow()
    expect(load('x', 2, always)).toBe(2)
  })
})
