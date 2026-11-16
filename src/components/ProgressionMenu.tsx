import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref } from 'react'
import { chordName } from '../music/chord'
import { GENRES, PROGRESSIONS, progressionChords, type Genre, type Progression } from '../music/progressions'
import { keyName, rootDegree } from '../music/theory'
import { UNDO_KEY } from '../platform'
import { arrowNav, useDropdown } from './useDropdown'

type Props = {
  tonic: string
  onUse: (prog: Progression) => void
  onPreview: (prog: Progression) => void
  /** Stand out as the place to start (the one accent button, while the track is empty). */
  highlight?: boolean
  /** Lets the empty track's "Start from a progression" open this menu. */
  ref?: Ref<ProgressionMenuHandle>
}

export type ProgressionMenuHandle = { open: () => void }

/** Hovering a genre switches to it after this long, so moving across to its list doesn't flip genres. */
const HOVER_DELAY_MS = 120

/**
 * "Progressions": genres on the left, that genre's progressions (in the
 * current key) on the right. Clicking one replaces the track; ▶ previews it.
 */
export function ProgressionMenu({ tonic, onUse, onPreview, highlight = false, ref }: Props) {
  const { open, setOpen, rootRef } = useDropdown()
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), [setOpen])
  const [genre, setGenre] = useState<Genre>(GENRES[0])
  const hoverTimer = useRef<number | undefined>(undefined)
  const genresRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) genresRef.current?.querySelector<HTMLElement>('.active')?.focus()
    return () => clearTimeout(hoverTimer.current)
  }, [open])

  const hoverGenre = (g: Genre) => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setGenre(g), HOVER_DELAY_MS)
  }

  // → from a genre into its progressions, ← back.
  const onGenreKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      listRef.current?.querySelector<HTMLElement>('.menu-item')?.focus()
    } else arrowNav('.menu-item')(e)
  }
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      genresRef.current?.querySelector<HTMLElement>('.active')?.focus()
    } else arrowNav('.menu-item')(e)
  }

  return (
    <div className="dropdown progression-menu" ref={rootRef}>
      <button
        className={highlight ? 'dropdown-trigger accent' : 'dropdown-trigger'}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Start from a progression: over 180 by genre, most common first"
        onClick={() => setOpen((o) => !o)}
      >
        Progressions
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown-panel progression-panel" role="menu">
          <div className="genres" ref={genresRef} onKeyDown={onGenreKey}>
            {GENRES.map((g) => (
              <button
                key={g}
                className={g === genre ? 'menu-item active' : 'menu-item'}
                aria-haspopup="menu"
                aria-expanded={g === genre}
                onPointerEnter={() => hoverGenre(g)}
                onPointerLeave={() => clearTimeout(hoverTimer.current)}
                onFocus={() => setGenre(g)}
                onClick={() => setGenre(g)}
              >
                <span>{g}</span>
                <span className="caret" aria-hidden>
                  ›
                </span>
              </button>
            ))}
          </div>
          <div className="progressions" ref={listRef} onKeyDown={onListKey}>
            {PROGRESSIONS.filter((prog) => prog.genre === genre).map((prog) => (
              <div key={prog.id} className="progression-row">
                <button
                  className="menu-item"
                  role="menuitem"
                  title="Use it (replaces the track)"
                  onClick={() => {
                    onUse(prog)
                    setOpen(false)
                  }}
                >
                  {/* Plain words first: the name, the chords and how it feels. The numerals are extra info. */}
                  <span className="progression-title">
                    <span className="menu-title">{prog.name}</span>
                    <span className="menu-desc">
                      {prog.numerals.join(' – ')} · {keyName(tonic, prog.mode)}
                    </span>
                  </span>
                  <span className="bank-chords">
                    {progressionChords(prog, tonic).map((c, i) => {
                      const degree = rootDegree(c, tonic, prog.mode)
                      return (
                        <span
                          key={i}
                          className="bank-chord"
                          data-diatonic={degree === null ? 'no' : 'yes'}
                          style={{ '--hue': degree === null ? undefined : (degree * 360) / 7 } as CSSProperties}
                        >
                          {chordName(c)}
                        </span>
                      )
                    })}
                  </span>
                  <span className="progression-feel">{prog.feel}</span>
                </button>
                <button className="hear" aria-label={`Hear ${prog.name}`} title="Hear it (doesn't change the track)" onClick={() => onPreview(prog)}>
                  ▶
                </button>
              </div>
            ))}
          </div>
          <p className="menu-foot">
            Shown in {tonic}. ▶ plays one; clicking it replaces your chords and switches to its scale ({UNDO_KEY} to
            undo).
          </p>
        </div>
      )}
    </div>
  )
}
