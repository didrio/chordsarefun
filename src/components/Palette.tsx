import type { CSSProperties, PointerEvent } from 'react'
import { chordName, voicedNoteNames } from '../music/chord'
import type { SpiceChord } from '../music/home'
import { rootDegree, type ChordSpec, type ModeName } from '../music/theory'

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
      {chords.map((spec, i) => (
        <button
          key={i}
          className="chord"
          onPointerDown={(e) => onPointerDown(spec, e)}
          onClick={(e) => e.detail === 0 && onPick(spec)}
          style={{ '--hue': (i * 360) / 7 } as CSSProperties}
        >
          <span className="key-hint" aria-hidden>
            {i + 1}
          </span>
          <span className="symbol">{chordName(spec.chord)}</span>
          <span className="roman">{spec.roman}</span>
          <span className="notes">{voicedNoteNames(spec.chord).join(' ')}</span>
        </button>
      ))}
    </div>
  )
}

type SpiceProps = {
  spice: SpiceChord[]
  tonic: string
  mode: ModeName
  onPointerDown: (chord: SpiceChord, e: PointerEvent) => void
  onPick: (chord: SpiceChord) => void
}

/**
 * Popular chords from outside the key, ready to borrow: same click/drag as the palette,
 * each with its reason ("borrowed", "→ G"). Colored by root like everything else.
 */
export function SpiceRow({ spice, tonic, mode, onPointerDown, onPick }: SpiceProps) {
  return (
    <div className="picker-half spice">
      <span className="picker-label" title="Popular chords from outside the key. Click to hear, drag one in; select it on the track to see why it works.">
        Spice · outside the key
      </span>
      <div className="spice-chords" style={{ gridTemplateColumns: `repeat(${spice.length}, minmax(0, 1fr))` }}>
        {spice.map((s) => {
          const degree = rootDegree(s.chord, tonic, mode)
          return (
            <button
              key={chordName(s.chord)}
              className="chord spice-chord"
              data-diatonic={degree === null ? 'no' : 'yes'}
              style={{ '--hue': degree === null ? undefined : (degree * 360) / 7 } as CSSProperties}
              onPointerDown={(e) => onPointerDown(s, e)}
              onClick={(e) => e.detail === 0 && onPick(s)}
              title={`${chordName(s.chord)} (${s.roman}): ${voicedNoteNames(s.chord).join(' ')}`}
            >
              <span className="symbol">{chordName(s.chord)}</span>
              <span className="roman">{s.roman}</span>
              <span className="spice-tag">{s.tag}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
