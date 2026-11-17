import { useState } from 'react'
import type { GrooveSettings } from '../music/grooves'
import { PART_LABELS, type MidiPart } from '../music/midi'
import { audible } from '../music/segments'
import { usePersistentState } from '../persist'
import { useDropdown } from './useDropdown'

export type ExportScope = 'song' | 'section'
export type ExportFormat = 'wav' | 'midi'

/** What to export: the format, the whole song or the edited section, and its parts (`stem`: one part on its own). */
export type ExportChoice = { format: ExportFormat; scope: ExportScope; parts: MidiPart[]; stem: boolean }

type Props = {
  /** The edited section's instruments. */
  groove: GrooveSettings
  /** The instruments of every block of the song; empty when nothing is arranged (then there's only the section). */
  songGrooves: GrooveSettings[]
  disabled: boolean
  /** An audio render is running: audio can't be started again until it's done or cancelled. */
  rendering: boolean
  onExport: (choice: ExportChoice) => void
}

const PARTS = Object.keys(PART_LABELS) as MidiPart[]

const isFormat = (v: unknown) => v === 'wav' || v === 'midi'

/**
 * Export what you hear: Audio (WAV, rendered in the browser) or MIDI, each as every part that's
 * on (WAV: mixed into one file; MIDI: one file, a track each, which Ableton splits into tracks)
 * or one part alone (a stem). Once the song has parts arranged, the whole song or just the edited
 * section. The format is remembered for next time.
 */
export function ExportMenu({ groove, songGrooves, disabled, rendering, onExport }: Props) {
  const { open, setOpen, rootRef } = useDropdown()
  const [format, setFormat] = usePersistentState<ExportFormat>('exportFormat', 'wav', isFormat)
  const [chosen, setScope] = useState<ExportScope>('song')
  const hasSong = songGrooves.length > 0
  const scope: ExportScope = hasSong ? chosen : 'section'
  const grooves = scope === 'song' ? songGrooves : [groove]
  const on = PARTS.filter((part) => grooves.some((g) => audible(g[part])))
  const wav = format === 'wav'
  const busy = wav && rendering
  const pick = (parts: MidiPart[], stem: boolean) => {
    onExport({ format, scope, parts, stem })
    setOpen(false)
  }
  const offWhy = (part: MidiPart) => `${PART_LABELS[part]} is off${scope === 'song' ? ' in every part of the song' : ''}`
  return (
    <div className="dropdown export-menu" ref={rootRef}>
      <button
        className="dropdown-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        aria-label="Export audio or MIDI"
        title="Export audio (WAV) or MIDI"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>⤓</span> Export
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown-panel export-panel" role="menu">
          <div className="export-toggle" role="group" aria-label="Format">
            {(['wav', 'midi'] as const).map((f) => (
              <button key={f} className="toggle" aria-pressed={f === format} onClick={() => setFormat(f)}>
                {f === 'wav' ? 'Audio (WAV)' : 'MIDI'}
              </button>
            ))}
          </div>
          {hasSong && (
            <div className="export-toggle" role="group" aria-label="What to export">
              {(['song', 'section'] as const).map((sc) => (
                <button key={sc} className="toggle" aria-pressed={sc === scope} onClick={() => setScope(sc)}>
                  {sc === 'song' ? 'Whole song' : 'This section'}
                </button>
              ))}
            </div>
          )}
          <button className="menu-item" role="menuitem" disabled={on.length === 0 || busy} onClick={() => pick(on, false)}>
            <span className="menu-title">All parts that are on</span>
            <span className="menu-desc">
              {on.map((part) => PART_LABELS[part]).join(', ') || 'Nothing is on'}
              {wav ? ', mixed into one file' : ': one file, a track each'}
            </span>
          </button>
          {PARTS.map((part) => (
            <button
              key={part}
              className="menu-item"
              role="menuitem"
              disabled={!on.includes(part) || busy}
              title={on.includes(part) ? undefined : offWhy(part)}
              onClick={() => pick([part], true)}
            >
              <span className="menu-title">{PART_LABELS[part]} only</span>
              {wav && <span className="menu-desc">A stem, at its level in the mix</span>}
            </button>
          ))}
          <p className="menu-foot">
            {busy
              ? 'Rendering… wait for it to finish, or cancel it.'
              : wav
                ? 'Exactly what you hear, rendered in your browser (24-bit, 44.1 kHz).'
                : 'Exactly what you hear: patterns, swing and voicings included.'}
          </p>
        </div>
      )}
    </div>
  )
}
