import type { GrooveSettings } from '../music/grooves'
import type { MidiPart } from '../music/midi'
import { useDropdown } from './useDropdown'

type Props = {
  groove: GrooveSettings
  disabled: boolean
  onDownload: (parts: MidiPart[], filename: string) => void
}

const PARTS: { part: MidiPart; label: string }[] = [
  { part: 'chords', label: 'Chords' },
  { part: 'bass', label: 'Bass' },
  { part: 'drums', label: 'Drums' },
]

/**
 * Download MIDI: every part that's on, one track each in one file (Ableton splits them
 * into tracks when dropped in), or a single part on its own.
 */
export function MidiMenu({ groove, disabled, onDownload }: Props) {
  const { open, setOpen, rootRef } = useDropdown()
  const on = PARTS.filter(({ part }) => groove[part].on)
  const pick = (parts: MidiPart[], filename: string) => {
    onDownload(parts, filename)
    setOpen(false)
  }
  return (
    <div className="dropdown midi-menu" ref={rootRef}>
      <button className="dropdown-trigger" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        Download MIDI
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown-panel midi-panel" role="menu">
          <button className="menu-item" role="menuitem" disabled={on.length === 0} onClick={() => pick(on.map((p) => p.part), 'progression.mid')}>
            <span className="menu-title">All parts that are on</span>
            <span className="menu-desc">{on.map((p) => p.label).join(', ') || 'Nothing is on'}: one file, a track each</span>
          </button>
          {PARTS.map(({ part, label }) => (
            <button key={part} className="menu-item" role="menuitem" onClick={() => pick([part], `progression-${part}.mid`)}>
              <span className="menu-title">{label} only</span>
            </button>
          ))}
          <p className="menu-foot">Exactly what you hear: patterns, swing and voicings included.</p>
        </div>
      )}
    </div>
  )
}
