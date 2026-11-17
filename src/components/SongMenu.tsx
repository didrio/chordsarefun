import { useEffect, useRef } from 'react'
import { keyName } from '../music/theory'
import type { Home, RankedHome } from '../music/home'
import { sigLabel, type GridKey, type TimeSignature } from '../music/timeline'
import { KeyPanel } from './KeyPanel'
import { MetronomeIcon } from './Icons'
import { TempoInput, TimingFields } from './OptionsMenu'
import { useDropdown } from './useDropdown'

type Props = {
  home: Home
  /** A home the chords fit clearly better, if any (a dot on the trigger). */
  suggestion: Home | null
  /** Keys detected from the chords, best first (keyCandidates); empty with no chords. */
  detected: RankedHome[]
  onChange: (home: Home) => void
  onDetect: (home: Home) => void
  bpm: number
  onBpm: (bpm: number) => void
  sig: TimeSignature
  onSig: (sig: TimeSignature) => void
  bars: number
  onBars: (bars: number) => void
  /** The Length row's label: "Length of Chorus" once the song has several sections (each has its own). */
  lengthLabel: string
  gridKey: GridKey
  onGrid: (key: GridKey) => void
  metronomeOn: boolean
  onMetronome: () => void
  metronomeVolume: number
  onMetronomeVolume: (volume: number) => void
}

/**
 * The song's settings behind one button that shows their values ("C minor · 120 BPM · 4/4"):
 * the key on the left, everything else on the right (tempo, time signature, length, grid,
 * metronome). They're read often and changed rarely, so one button replaces five controls
 * and the rest of the screen stays still. The trigger keeps the key suggestion's dot.
 */
export function SongMenu({
  home,
  suggestion,
  detected,
  onChange,
  onDetect,
  bpm,
  onBpm,
  sig,
  onSig,
  bars,
  onBars,
  lengthLabel,
  gridKey,
  onGrid,
  metronomeOn,
  onMetronome,
  metronomeVolume,
  onMetronomeVolume,
}: Props) {
  const { open, setOpen, rootRef } = useDropdown()
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('.home-moods [aria-selected="true"]')?.focus()
  }, [open])

  const key = keyName(home.tonic, home.mode)
  return (
    <div className="dropdown song-menu" ref={rootRef}>
      <button
        className="dropdown-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Song settings: ${key}, ${bpm} BPM, ${sigLabel(sig)}`}
        title={`Key, tempo, time signature, length, grid and metronome. ${home.tonic} is home: colors, numerals and "in key" are measured against it.`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="trigger-value">
          {key}
          <span className="trigger-sep" aria-hidden>
            {' · '}
          </span>
          <span className="trigger-bpm">{bpm} BPM</span>
          <span className="trigger-sep trigger-time" aria-hidden>
            {' · '}
          </span>
          <span className="trigger-time">{sigLabel(sig)}</span>
        </span>
        {suggestion && <span className="suggest-dot" aria-label="(suggestion available)" />}
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown-panel song-panel" role="dialog" aria-label="Song settings" ref={panelRef}>
          <div className="song-col song-col-key">
            <KeyPanel home={home} detected={detected} onChange={onChange} onDetect={onDetect} onDone={() => setOpen(false)} />
          </div>
          <div className="song-col song-col-rest">
            <div className="home-section-label">Tempo and time</div>
            <label className="field" title="Tempo in beats (quarter notes) per minute">
              Tempo
              <span className="tempo-field">
                <TempoInput bpm={bpm} onBpm={onBpm} />
                <span className="tempo-unit">BPM</span>
              </span>
            </label>
            <TimingFields sig={sig} onSig={onSig} bars={bars} onBars={onBars} lengthLabel={lengthLabel} gridKey={gridKey} onGrid={onGrid} />
            <div className="home-section-label">Metronome</div>
            <div className="field">
              <button
                className="toggle"
                aria-pressed={metronomeOn}
                aria-label="Metronome"
                onClick={onMetronome}
                title="Metronome (M)"
              >
                <MetronomeIcon />
                {metronomeOn ? 'On' : 'Off'}
              </button>
              <input
                type="range"
                className="volume"
                min={0}
                max={1}
                step={0.01}
                value={metronomeVolume}
                onChange={(e) => onMetronomeVolume(Number(e.target.value))}
                aria-label="Metronome volume"
                title="Metronome volume"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
