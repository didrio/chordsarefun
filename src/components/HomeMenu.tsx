import { useEffect, useRef } from 'react'
import type { Home } from '../music/home'
import { KEYS, keyName, MODE_INFO, MODE_LABELS, MODES } from '../music/theory'
import { arrowNav, useDropdown } from './useDropdown'

type Props = {
  home: Home
  /** A home the chords fit clearly better, if any. */
  suggestion: Home | null
  onChange: (home: Home) => void
}

/** "C major" with a capital mood word for the trigger: "C Major", "A Minor", "D Dorian". */
const title = (h: Home) => keyName(h.tonic, h.mode).replace(/ (\w)/, (_, c: string) => ` ${c.toUpperCase()}`)

/**
 * The song's key, shown as "Key" (the word people know; "home" is how the app explains
 * it): the 12 notes as buttons and the mood (described), most common first. Changing it
 * re-labels the chords and never changes them (the app then offers to move them).
 */
export function HomeMenu({ home, suggestion, onChange }: Props) {
  const { open, setOpen, rootRef } = useDropdown()
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('.home-moods [aria-selected="true"]')?.focus()
  }, [open])

  return (
    <div className="dropdown home-menu" ref={rootRef}>
      <button
        className="dropdown-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Key: ${keyName(home.tonic, home.mode)}`}
        title={`The key and mood your song is in: ${home.tonic} is home. Colors, numerals and "in key" are measured against it.`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="trigger-label">Key</span>
        <span className="trigger-value">{title(home)}</span>
        {suggestion && <span className="suggest-dot" aria-label="(suggestion available)" />}
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown-panel home-panel" role="dialog" aria-label="Key" ref={panelRef}>
          {suggestion && (
            <div className="home-suggest">
              <span>
                Your chords fit <strong>{keyName(suggestion.tonic, suggestion.mode)}</strong> best.
              </span>
              <button
                className="small"
                onClick={() => {
                  onChange(suggestion)
                  setOpen(false)
                }}
              >
                Use it
              </button>
            </div>
          )}
          <div className="home-section-label">Home note</div>
          <div className="home-keys" role="group" aria-label="Key">
            {KEYS.map((k) => (
              <button key={k} className="toggle" aria-pressed={k === home.tonic} onClick={() => onChange({ ...home, tonic: k })}>
                {k}
              </button>
            ))}
          </div>
          <div className="home-section-label">Mood</div>
          <div className="home-moods" role="listbox" aria-label="Mood" onKeyDown={arrowNav('.menu-item')}>
            {MODES.map((m) => (
              <button
                key={m}
                role="option"
                aria-selected={m === home.mode}
                className="menu-item"
                onClick={() => {
                  onChange({ ...home, mode: m })
                  setOpen(false)
                }}
              >
                <span className="menu-title">{MODE_LABELS[m]}</span>
                <span className="menu-desc">{MODE_INFO[m]}</span>
              </button>
            ))}
          </div>
          <p className="menu-foot">Changing the key never changes your chords; you'll be offered to move them.</p>
        </div>
      )}
    </div>
  )
}
