import { useState } from 'react'
import { MAX_SIG_BEATS, NOTE_UNITS, sigLabel, TIME_SIGNATURES, type TimeSignature } from '../music/timeline'

type Props = {
  sig: TimeSignature
  onChange: (sig: TimeSignature) => void
}

const CUSTOM = 'custom'

/** Preset time signatures, plus "Custom…" which reveals beats / note-value pickers. */
export function TimeSignatureControl({ sig, onChange }: Props) {
  const isPreset = TIME_SIGNATURES.some((p) => p.beats === sig.beats && p.unit === sig.unit)
  const [customOpen, setCustomOpen] = useState(false)
  const showCustom = customOpen || !isPreset

  return (
    <>
      <label>
        Time
        <select
          value={showCustom ? CUSTOM : sigLabel(sig)}
          onChange={(e) => {
            if (e.target.value === CUSTOM) return setCustomOpen(true)
            setCustomOpen(false)
            onChange(TIME_SIGNATURES.find((p) => sigLabel(p) === e.target.value)!)
          }}
        >
          {TIME_SIGNATURES.map((p) => (
            <option key={sigLabel(p)} value={sigLabel(p)}>
              {sigLabel(p)}
            </option>
          ))}
          <option value={CUSTOM}>Custom…</option>
        </select>
      </label>
      {showCustom && (
        <span className="custom-sig">
          <select
            aria-label="Beats per bar"
            value={sig.beats}
            onChange={(e) => onChange({ ...sig, beats: Number(e.target.value) })}
          >
            {Array.from({ length: MAX_SIG_BEATS }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          /
          <select aria-label="Beat note value" value={sig.unit} onChange={(e) => onChange({ ...sig, unit: Number(e.target.value) })}>
            {NOTE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </span>
      )}
    </>
  )
}
