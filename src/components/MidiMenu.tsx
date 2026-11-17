import { useState } from 'react'
import type { GrooveSettings } from '../music/grooves'
import type { MidiPart } from '../music/midi'
import { useDropdown } from './useDropdown'

export type MidiScope = 'song' | 'section'

type Props = {
  /** The edited section's instruments. */
  groove: GrooveSettings
  /** The instruments of every block of the song; empty when nothing is arranged (then there's only the section). */
  songGrooves: GrooveSettings[]
  disabled: boolean
  onDownload: (scope: MidiScope, parts: MidiPart[], filename: string) => void
}

const PARTS: { part: MidiPart; label: string }[] = [
  { part: 'chords', label: 'Chords' },
  { part: 'bass', label: 'Bass' },
  { part: 'drums', label: 'Drums' },
]

/**
 * Download MIDI: every part that's on, one track each in one file (Ableton splits them
 * into tracks when dropped in), or a single part on its own. Once the song has parts
 * arranged, the whole song (one arrangement, a marker per part) or just the edited section.
 */
export function MidiMenu({ groove, songGrooves, disabled, onDownload }: Props) {
  const { open, setOpen, rootRef } = useDropdown()
  const [chosen, setScope] = useState<MidiScope>('song')
  const hasSong = songGrooves.length > 0
  const scope: MidiScope = hasSong ? chosen : 'section'
  const grooves = scope === 'song' ? songGrooves : [groove]
  const on = PARTS.filter(({ part }) => grooves.some((g) => g[part].on))
  const base = scope === 'song' ? 'song' : 'progression'
  const pick = (parts: MidiPart[], filename: string) => {
    onDownload(scope, parts, filename)
    setOpen(false)
  }
  return (
    <div className="dropdown midi-menu" ref={rootRef}>
      <button className="dropdown-trigger" aria-haspopup="menu" aria-expanded={open} disabled={disabled} aria-label="Download MIDI" title="Download MIDI" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden>⤓</span> MIDI
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown-panel midi-panel" role="menu">
          {hasSong && (
            <div className="midi-scope" role="group" aria-label="What to download">
              {(['song', 'section'] as const).map((sc) => (
                <button key={sc} className="toggle" aria-pressed={sc === scope} onClick={() => setScope(sc)}>
                  {sc === 'song' ? 'Whole song' : 'This section'}
                </button>
              ))}
            </div>
          )}
          <button className="menu-item" role="menuitem" disabled={on.length === 0} onClick={() => pick(on.map((p) => p.part), `${base}.mid`)}>
            <span className="menu-title">All parts that are on</span>
            <span className="menu-desc">{on.map((p) => p.label).join(', ') || 'Nothing is on'}: one file, a track each</span>
          </button>
          {PARTS.map(({ part, label }) => (
            <button key={part} className="menu-item" role="menuitem" onClick={() => pick([part], `${base}-${part}.mid`)}>
              <span className="menu-title">{label} only</span>
            </button>
          ))}
          <p className="menu-foot">Exactly what you hear: patterns, swing and voicings included.</p>
        </div>
      )}
    </div>
  )
}
