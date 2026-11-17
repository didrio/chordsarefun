import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { previewSession, stopPreview } from '../music/audio'
import { chordName } from '../music/chord'
import type { GrooveSettings } from '../music/grooves'
import {
  GENRES,
  PROGRESSIONS,
  progressionChords,
  progressionMusic,
  progressionPreset,
  searchProgressions,
  type Genre,
  type Progression,
  type ProgressionParts,
} from '../music/progressions'
import { keyName, rootDegree } from '../music/theory'
import { usePersistentState } from '../persist'
import { scrollMotion, UNDO_KEY } from '../platform'
import { PlayIcon, StopIcon } from './Icons'
import { Modal } from './Modal'

type Props = {
  /** The track's key note: progressions are shown and heard in it. */
  tonic: string
  /** "Your instruments": the open session's groove and tempo. */
  groove: GrooveSettings
  bpm: number
  /** Take a progression's chords, instruments, or both (one undo step); the caller closes the window. */
  onUse: (prog: Progression, parts: ProgressionParts) => void
  /** Before hearing one: pause the song if it's playing, so they never play over each other. */
  onBeforePreview: () => void
  onClose: () => void
}

type HearWith = 'own' | 'yours'

const BOTH: ProgressionParts = { chords: true, instruments: true }

/**
 * The progression browser: genres on the left, the list on the right (search), and what to take
 * from the selected one at the bottom: its chords, its instruments and tempo, or both. Clicking a
 * row plays it on a loop, with its own instruments or yours ("Hear with", saved globally).
 */
export function ProgressionBrowser({ tonic, groove, bpm, onUse, onBeforePreview, onClose }: Props) {
  const [genre, setGenre] = useState<Genre | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hearWith, setHearWith] = usePersistentState<HearWith>('progressionHearWith', 'own', (v) => v === 'own' || v === 'yours')
  /** The progression being heard (its ▶ shows ■), and which of its chords is sounding. */
  const [hearing, setHearing] = useState<{ id: string; at: number } | null>(null)
  const hearingRef = useRef(false)
  useEffect(() => {
    hearingRef.current = hearing !== null
  })
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  // On phones the genres are a sideways-scrolling row: keep the picked one fully in view.
  useEffect(() => {
    dialogRef.current
      ?.querySelector('.session-sidebar [aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollMotion() })
  }, [genre])

  const rows = searchProgressions(PROGRESSIONS, genre, query, tonic)
  // A selection the search hides isn't acted on.
  const selected = rows.find((p) => p.id === selectedId) ?? null
  const genreTitle = genre === 'all' ? 'All progressions' : genre

  // Closing the window stops a progression being heard.
  useEffect(
    () => () => {
      if (hearingRef.current) stopPreview(true)
    },
    [],
  )

  /** Hear one on a loop (until ■), with its own instruments and tempo or the session's. */
  const hear = (prog: Progression, using: HearWith = hearWith) => {
    onBeforePreview()
    const music = using === 'yours' ? progressionMusic(prog, tonic, groove, bpm) : progressionMusic(prog, tonic)
    void previewSession(music, {
      onChord: (at) => setHearing((h) => (h?.id === prog.id ? { ...h, at } : h)),
      onEnd: () => setHearing((h) => (h?.id === prog.id ? null : h)),
    })
    setHearing({ id: prog.id, at: -1 })
  }

  /** Select a row; play it (unless it's the one already playing). */
  const pick = (prog: Progression, play = true) => {
    setSelectedId(prog.id)
    if (play && hearing?.id !== prog.id) hear(prog)
  }

  const changeHearWith = (next: HearWith) => {
    setHearWith(next)
    const heard = hearing && PROGRESSIONS.find((p) => p.id === hearing.id)
    if (heard && next !== hearWith) hear(heard, next)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const rowButtons = [...dialogRef.current!.querySelectorAll<HTMLElement>('.prog-open')]
    const at = rowButtons.indexOf(target)
    const inList = at >= 0 || target === searchRef.current
    // ↑/↓ move the selection (from the search box too); they keep playing if something was.
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && inList) {
      e.preventDefault()
      if (e.key === 'ArrowUp' && at <= 0) return searchRef.current?.focus()
      const next = e.key === 'ArrowDown' ? Math.min(at + 1, rows.length - 1) : at - 1
      if (!rows[next]) return
      rowButtons[next].focus()
      pick(rows[next], hearing !== null)
    } else if (e.key === 'Enter' && inList) {
      // Enter = Use both, on the focused row (or the selected one, from the search box).
      e.preventDefault()
      const prog = at >= 0 ? rows[at] : selected
      if (prog) onUse(prog, BOTH)
    }
  }

  const row = (prog: Progression) => {
    const heard = hearing?.id === prog.id ? hearing : null
    const preset = progressionPreset(prog)
    const info = [prog.numerals.join(' – '), keyName(tonic, prog.mode), genre === 'all' ? prog.genre : null].filter(Boolean).join(' · ')
    return (
      <li key={prog.id} className={prog.id === selected?.id ? 'session-row prog-row selected' : 'session-row prog-row'}>
        <button
          className={heard ? 'session-hear playing' : 'session-hear'}
          aria-label={heard ? `Stop hearing ${prog.name}` : `Hear ${prog.name}`}
          title={heard ? 'Stop' : `Hear it on a loop, with ${hearWith === 'own' ? 'its own instruments' : 'your instruments'}`}
          onClick={() => (heard ? stopPreview(true) : pick(prog))}
        >
          {heard ? <StopIcon /> : <PlayIcon />}
        </button>
        <button
          className="session-open prog-open"
          aria-current={prog.id === selected?.id}
          title="Hear it (double-click to use its chords and instruments)"
          onClick={() => pick(prog)}
          onDoubleClick={() => onUse(prog, BOTH)}
        >
          <span className="session-title-line prog-title-line">
            <span className="session-title">{prog.name}</span>
            <span className="prog-feel">{prog.feel}</span>
            <span className="prog-sound">
              {preset?.name} · {prog.bpm} BPM
            </span>
          </span>
          <span className="session-meta">
            <span className="session-chords prog-chords" aria-live="off">
              {progressionChords(prog, tonic).map((c, i) => {
                const degree = rootDegree(c, tonic, prog.mode)
                return (
                  <span
                    key={i}
                    className={i === heard?.at ? 'bank-chord now' : 'bank-chord'}
                    data-diatonic={degree === null ? 'no' : 'yes'}
                    style={{ '--hue': degree === null ? undefined : (degree * 360) / 7 } as CSSProperties}
                  >
                    {chordName(c)}
                  </span>
                )
              })}
            </span>
            <span className="session-info">{info}</span>
          </span>
        </button>
      </li>
    )
  }

  const selectedPreset = selected && progressionPreset(selected)

  return (
    <Modal
      className="session-browser prog-browser"
      labelledBy="prog-browser-title"
      dialogRef={dialogRef}
      initialFocus={searchRef}
      onClose={onClose}
      onKeyDown={onKeyDown}
    >
      <header className="session-browser-head">
        <h2 id="prog-browser-title">Progressions</h2>
        <input
          ref={searchRef}
          type="search"
          className="session-search"
          placeholder="Search name, feel, chords"
          aria-label="Search progressions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="prog-hear-with" role="group" aria-label="Hear with">
          <span className="muted">Hear with</span>
          <span className="segmented">
            <button
              className="small toggle"
              aria-pressed={hearWith === 'own'}
              title="Hear each progression with its own instruments and tempo"
              onClick={() => changeHearWith('own')}
            >
              Its instruments
            </button>
            <button
              className="small toggle"
              aria-pressed={hearWith === 'yours'}
              title={`Hear each progression with your instruments, at ${bpm} BPM`}
              onClick={() => changeHearWith('yours')}
            >
              Your instruments
            </button>
          </span>
        </span>
        <button className="session-close" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          ×
        </button>
      </header>

      <nav className="session-sidebar" aria-label="Genres">
        {(['all', ...GENRES] as const).map((g) => (
          <button key={g} className="session-view" aria-current={genre === g} onClick={() => setGenre(g)}>
            <span className="session-view-name">{g === 'all' ? 'All' : g}</span>
            <span className="session-count">{g === 'all' ? PROGRESSIONS.length : PROGRESSIONS.filter((p) => p.genre === g).length}</span>
          </button>
        ))}
      </nav>

      <section className="session-main" aria-label={genreTitle}>
        <div className="session-list-head">
          <span className="session-view-title">
            {genreTitle}{' '}
            <span className="muted">
              · {rows.length} progression{rows.length === 1 ? '' : 's'} · shown in {tonic}
            </span>
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="session-empty">
            <p>
              No {genre === 'all' ? '' : `${genre} `}progressions match “{query.trim()}”.
            </p>
            {genre !== 'all' && (
              <button className="small" onClick={() => setGenre('all')}>
                Search all genres
              </button>
            )}
          </div>
        ) : (
          <ul className="session-rows">{rows.map(row)}</ul>
        )}
      </section>

      <footer className="session-browser-foot prog-foot">
        <span className="muted" role="status">
          {selected
            ? `${selected.name} · ${keyName(tonic, selected.mode)} · ${selectedPreset?.name}, ${selected.bpm} BPM`
            : 'Click a progression to hear it, then take what you like.'}
        </span>
        <span className="prog-use">
          <button
            disabled={!selected}
            title="Replace your chords with these, in its scale. Keeps your instruments and tempo."
            onClick={() => selected && onUse(selected, { chords: true, instruments: false })}
          >
            Use chords
          </button>
          <button
            disabled={!selected}
            title={
              selected
                ? `Switch to its instruments (${selectedPreset?.name}) and tempo (${selected.bpm} BPM). Keeps your chords.`
                : 'Switch to its instruments and tempo. Keeps your chords.'
            }
            onClick={() => selected && onUse(selected, { chords: false, instruments: true })}
          >
            Use instruments
          </button>
          <button
            className="primary"
            disabled={!selected}
            title={`Its chords, instruments and tempo (Enter). ${UNDO_KEY} undoes it.`}
            onClick={() => selected && onUse(selected, BOTH)}
          >
            Use both
          </button>
        </span>
      </footer>
    </Modal>
  )
}
