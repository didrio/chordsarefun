import { homeReason, type Home, type RankedHome } from '../music/home'
import { KEYS, keyName, MODE_INFO, MODE_LABELS, MODES } from '../music/theory'
import { arrowNav } from './useDropdown'

type Props = {
  home: Home
  /** Keys detected from the chords, best first (keyCandidates); empty with no chords. */
  detected: RankedHome[]
  /** Picked by hand: re-labels, then offers to move the chords. */
  onChange: (home: Home) => void
  /** A detected key: re-labels only (the chords are already in it). */
  onDetect: (home: Home) => void
  /** A pick that settles the question (a detected key, a mood): the song popover closes. */
  onDone: () => void
}

/** "C major" with a capital mood word: "C Major", "A Minor", "D Dorian". */
const title = (h: Home) => keyName(h.tonic, h.mode).replace(/ (\w)/, (_, c: string) => ` ${c.toUpperCase()}`)

const isSame = (a: Home, b: Home) => a.tonic === b.tonic && a.mode === b.mode

/**
 * The song's key, shown as "Key" (the word people know; "home" is how the app explains
 * it): first the keys detected from the chords (best match, then close second opinions),
 * then the 12 notes as buttons and the mood (described), most common first. Changing it
 * re-labels the chords and never changes them (picked by hand, the app then offers to move
 * them; a detected key needs no move, the chords are already in it). It's the left half of
 * the song popover (`SongMenu`).
 */
export function KeyPanel({ home, detected, onChange, onDetect, onDone }: Props) {
  return (
    <div className="key-panel" role="group" aria-label="Key">
      <div className="home-section-label">Detect from your chords</div>
      {detected.length === 0 ? (
        <p className="home-detect-empty muted">Add chords and the key can be detected from them.</p>
      ) : (
        <div className="home-detect" role="group" aria-label="Detected keys">
          {detected.map((r, i) => {
            const current = isSame(r.home, home)
            return (
              <button
                key={`${r.home.tonic} ${r.home.mode}`}
                className="menu-item home-detect-item"
                aria-current={current}
                title={current ? 'Your song is already in this key' : 'Use this key (your chords stay as they are)'}
                onClick={() => {
                  if (!current) onDetect(r.home)
                  onDone()
                }}
              >
                <span className="menu-title">
                  {title(r.home)}
                  {i === 0 && <span className="home-detect-tag">Best match</span>}
                  {current && <span className="home-detect-tag current">Current</span>}
                </span>
                <span className="menu-desc">{homeReason(r)}</span>
              </button>
            )
          })}
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
              onDone()
            }}
          >
            <span className="menu-title">{MODE_LABELS[m]}</span>
            <span className="menu-desc">{MODE_INFO[m]}</span>
          </button>
        ))}
      </div>
      <p className="menu-foot">Changing the key never changes your chords; you'll be offered to move them.</p>
    </div>
  )
}
