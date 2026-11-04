import { analyzeChord, type Analysis, type FitKind } from './analysis'
import { CHORD_TYPES, withType, type Chord, type ChordType } from './chord'
import type { ModeName } from './theory'

/** Fit marks: in key, a common move (borrowed, leading), or outside. */
export type FitMark = 'in' | 'common' | 'out'

export const FIT_MARK: Record<FitKind, FitMark> = {
  diatonic: 'in',
  borrowed: 'common',
  secondary: 'common',
  passing: 'common',
  substitute: 'common',
  outside: 'out',
}

/** Display order of the categories. */
export const FIT_MARKS: FitMark[] = ['in', 'common', 'out']

/**
 * Chord types from most to least expected in popular music: the plain triads, then the
 * 7ths and suspensions everyone uses, then 9ths and 6ths, then jazzier and tenser colors.
 */
const EXPECTED_ORDER = [
  '', 'm', '7', 'maj7', 'm7', 'sus4', 'sus2', 'add9', 'madd9', '6', 'm6', 'dim', '9', 'maj9', 'm9', '5',
  'aug', '7sus4', 'm7b5', '6/9', 'mMaj7', 'dim7', 'm11', '11', 'maj7#11', 'maj13', '13', 'm13', '7#9', '7b9',
  '7#5', '7b5',
]

/** Lower = more expected. Clashing chords sort after smooth ones; unlisted types go last. */
function expectedness(symbol: string, tension: number): number {
  const i = EXPECTED_ORDER.indexOf(symbol)
  const rank = i === -1 ? EXPECTED_ORDER.length + CHORD_TYPES.findIndex((t) => t.symbol === symbol) : i
  return rank + tension * 12
}

export type FlavorOption = { t: ChordType; c: Chord; a: Analysis; mark: FitMark }

/**
 * Every other flavor of a chord's root, grouped by how it fits the key (in key, then
 * borrowed & leading, then outside) and, within each group, most expected first.
 */
export function flavorOptions(chord: Chord, tonic: string, mode: ModeName, next?: Chord | null): FlavorOption[] {
  return CHORD_TYPES.map((t) => {
    const c = withType(chord, t.symbol)
    const a = analyzeChord(c, tonic, mode, next)
    return { t, c, a, mark: FIT_MARK[a.fit.kind] }
  }).sort(
    (x, y) =>
      FIT_MARKS.indexOf(x.mark) - FIT_MARKS.indexOf(y.mark) ||
      expectedness(x.t.symbol, x.a.tension.level) - expectedness(y.t.symbol, y.a.tension.level),
  )
}
