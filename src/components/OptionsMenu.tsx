import { useState } from 'react'
import { BAR_OPTIONS, GRIDS, type GridKey, type TimeSignature } from '../music/timeline'
import { TimeSignatureControl } from './TimeSignatureControl'

type Props = {
  bpm: number
  onBpm: (bpm: number) => void
  sig: TimeSignature
  onSig: (sig: TimeSignature) => void
  bars: number
  onBars: (bars: number) => void
  gridKey: GridKey
  onGrid: (key: GridKey) => void
}

/**
 * Tempo, time signature, length and grid, each with its own space in the Configuration
 * panel (they used to hide behind one dropdown).
 */
export function OptionsFields({ bpm, onBpm, sig, onSig, bars, onBars, gridKey, onGrid }: Props) {
  return (
    <>
      <label className="field">
        Tempo
        <span className="bpm">
          <TempoInput bpm={bpm} onBpm={onBpm} />
          BPM
        </span>
      </label>
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
      <label className="field">
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

const MIN_BPM = 30
const MAX_BPM = 300

/**
 * Tempo you can type freely: a value in range applies as soon as it's typed (so "127"
 * works even though "1" and "12" are too slow on the way), and on leaving the field
 * (or Enter) anything out of range is clamped and anything unreadable goes back.
 */
function TempoInput({ bpm, onBpm }: { bpm: number; onBpm: (bpm: number) => void }) {
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
