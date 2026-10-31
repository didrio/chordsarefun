import type { CSSProperties, PointerEvent } from 'react'
import { chordNotes, type ChordSpec } from '../music/theory'

type Props = {
  chords: ChordSpec[]
  /** Pointer down on a chord: may become a click or a drag (see useChordDrag). */
  onPointerDown: (chord: ChordSpec, e: PointerEvent) => void
  /** Keyboard activation (Enter/Space) of a chord. */
  onPick: (chord: ChordSpec) => void
}

export function Palette({ chords, onPointerDown, onPick }: Props) {
  return (
    <div className="palette">
      {chords.map((chord, i) => (
        <button
          key={chord.symbol}
          className="chord"
          onPointerDown={(e) => onPointerDown(chord, e)}
          onClick={(e) => e.detail === 0 && onPick(chord)}
          style={{ '--hue': (i * 360) / 7 } as CSSProperties}
        >
          <span className="key-hint" aria-hidden>
            {i + 1}
          </span>
          <span className="symbol">{chord.symbol}</span>
          <span className="roman">{chord.roman}</span>
          <span className="notes">{chordNotes(chord.symbol).join(' ')}</span>
        </button>
      ))}
    </div>
  )
}
