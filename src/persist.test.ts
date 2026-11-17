import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSaveStatus, load, save, saveErrorStatus, saveRaw } from './persist'

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

describe('save status', () => {
  const failing = (name: string) => ({
    getItem: () => null,
    setItem: () => {
      throw new DOMException('nope', name)
    },
  })

  it('reports a full storage, then clears once a save works again', () => {
    expect(save('a', 1)).toBe(true)
    expect(getSaveStatus()).toBe('ok')
    vi.stubGlobal('localStorage', failing('QuotaExceededError'))
    expect(save('a', 2)).toBe(false)
    expect(getSaveStatus()).toBe('full')
    expect(saveRaw('b', '1')).toBe(false)
    expect(getSaveStatus()).toBe('full')
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
    expect(save('a', 3)).toBe(true)
    expect(getSaveStatus()).toBe('ok')
  })

  it('tells blocked storage apart from full storage', () => {
    vi.stubGlobal('localStorage', failing('SecurityError'))
    save('a', 1)
    expect(getSaveStatus()).toBe('blocked')
    expect(saveErrorStatus(new DOMException('', 'QuotaExceededError'))).toBe('full')
    expect(saveErrorStatus(new Error('x'))).toBe('blocked')
  })
})
