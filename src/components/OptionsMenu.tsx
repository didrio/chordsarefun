import { useState } from 'react'
import { BAR_OPTIONS, GRIDS, sigLabel, type GridKey, type TimeSignature } from '../music/timeline'
import { TimeSignatureControl } from './TimeSignatureControl'
import { useDropdown } from './useDropdown'

type TimingProps = {
  sig: TimeSignature
  onSig: (sig: TimeSignature) => void
  bars: number
  onBars: (bars: number) => void
  gridKey: GridKey
  onGrid: (key: GridKey) => void
}

/**
 * "4/4 · 4 bars" in the song bar: time signature, length and grid in one small popover,
 * one setting per row. The trigger shows the two you read most, so you rarely open it.
 */
export function TimingMenu({ sig, onSig, bars, onBars, gridKey, onGrid }: TimingProps) {
  const { open, setOpen, rootRef } = useDropdown()
  return (
    <div className="dropdown timing-menu" ref={rootRef}>
      <button
        className="dropdown-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Time signature, length and grid"
        onClick={() => setOpen((o) => !o)}
      >
        {sigLabel(sig)} · {bars} {bars === 1 ? 'bar' : 'bars'}
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown-panel timing-panel" role="dialog" aria-label="Time, length and grid">
          <span className="field field-time">
            <TimeSignatureControl sig={sig} onChange={onSig} />
          </span>
          <label className="field">
            Length
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
        </div>
      )}
    </div>
  )
}

const MIN_BPM = 30
const MAX_BPM = 300

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
