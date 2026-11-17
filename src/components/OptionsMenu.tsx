import { useState } from 'react'
import { BAR_OPTIONS, GRIDS, sigLabel, type GridKey, type TimeSignature } from '../music/timeline'
import { MAX_BPM, MIN_BPM } from '../track'
import { TimeSignatureControl } from './TimeSignatureControl'

type TimingProps = {
  sig: TimeSignature
  onSig: (sig: TimeSignature) => void
  bars: number
  onBars: (bars: number) => void
  /** "Length", or "Length of Chorus" when each section has its own. */
  lengthLabel?: string
  gridKey: GridKey
  onGrid: (key: GridKey) => void
}

/** "4/4 · 4 bars": what the song's length and meter read like in words. */
export const timingLabel = (sig: TimeSignature, bars: number) => `${sigLabel(sig)} · ${bars} ${bars === 1 ? 'bar' : 'bars'}`

/** Time signature, length and grid, one setting per row (the body of the song popover's right column). */
export function TimingFields({ sig, onSig, bars, onBars, lengthLabel = 'Length', gridKey, onGrid }: TimingProps) {
  return (
    <>
      <span className="field field-time">
        <TimeSignatureControl sig={sig} onChange={onSig} />
      </span>
      <label className="field">
        {lengthLabel}
        <select value={bars} onChange={(e) => onBars(Number(e.target.value))}>
          {BAR_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'bar' : 'bars'}
            </option>
          ))}
        </select>
      </label>
      <label className="field" title="What chords snap to when you drag or resize them">
        Grid
        <select value={gridKey} onChange={(e) => onGrid(e.target.value as GridKey)}>
          {GRIDS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}


/**
 * Tempo you can type freely: a value in range applies as soon as it's typed (so "127"
 * works even though "1" and "12" are too slow on the way), and on leaving the field
 * (or Enter) anything out of range is clamped and anything unreadable goes back.
 */
export function TempoInput({ bpm, onBpm }: { bpm: number; onBpm: (bpm: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const n = Math.round(Number(text))
    if (text.trim() !== '' && Number.isFinite(n)) onBpm(Math.min(MAX_BPM, Math.max(MIN_BPM, n)))
    setText(null)
  }
  return (
    <input
      type="number"
      min={MIN_BPM}
      max={MAX_BPM}
      value={text ?? bpm}
      aria-label="Tempo (BPM)"
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value !== '' && Number.isInteger(n) && n >= MIN_BPM && n <= MAX_BPM) onBpm(n)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
