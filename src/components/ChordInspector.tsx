import { useState, type CSSProperties } from 'react'
import { Note } from 'tonal'
import { analyzeChord } from '../music/analysis'
import { ArrowIcon } from './ArrowIcon'
import { FIT_MARK, FIT_MARKS, flavorOptions, type FitMark } from '../music/flavors'
import {
  bassNote,
  canInvert,
  chordIntervals,
  chordName,
  chordNotes,
  intervalLabel,
  inversionName,
  isSlash,
  lowestNote,
  makeChord,
  MIN_NOTES,
  noteAt,
  toggleNote,
  voicedNoteNames,
  withBass,
  withRoot,
  type Chord,
} from '../music/chord'
import { chordFromNotes, readChordInput, type ParsedChord } from '../music/parse'
import { spotContext, suggestForSpot, type Intent, type Spot } from '../music/suggest'
import { KEYS, keyName, noteInKey, rootDegree, scaleNotes, type ModeName } from '../music/theory'

/** Which view the inspector's side column shows for a chord: its other flavors, or ideas for its spot. */
export type InspectorTab = 'flavors' | 'ideas'

type Props = {
  /** Null for an empty clip. */
  chord: Chord | null
  /** Where the clip sits (neighbors, loop), for ideas and "does it resolve?". */
  spot: Spot
  tab: InspectorTab
  onTab: (tab: InspectorTab) => void
  /**
   * Set the clip's chord. `fresh` = a new chord (typed, an idea, built on the keyboard),
   * which gets voiced to fit its neighbors; edits of the current chord keep its voicing.
   */
  onChange: (chord: Chord, fresh?: boolean) => void
  /** Clear chord: the clip becomes empty, staying where it is. */
  onClear: () => void
  /** Hear a chord. `fresh` = a new chord (an idea, typed), which the app plays in the track's octave, as it would place it. */
  onPreview: (chord: Chord, fresh?: boolean) => void
}

const WHITE = [0, 2, 4, 5, 7, 9, 11]
const BLACK = [1, 3, 6, 8, 10]
/** Black key positions, in white-key widths from the left edge. */
const BLACK_AT: Record<number, number> = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 }

/** The three fit categories, with what each means. */
const FIT_SECTIONS: Record<FitMark, { title: string; hint: string }> = {
  in: { title: 'In key', hint: 'every note is in the key' },
  common: { title: 'Borrowed & leading', hint: 'outside the key, but a common move' },
  out: { title: 'Outside the key', hint: 'surprising, a bold choice' },
}

/** Names for the 12 pitch classes: the key's spelling where it has one. */
function pitchNames(tonic: string, mode: ModeName): string[] {
  const scale = scaleNotes(tonic, mode)
  return Array.from({ length: 12 }, (_, c) => scale.find((n) => Note.chroma(n) === c) ?? KEYS[c])
}

/**
 * The inspected clip, explained and editable, in one layout whether it has a chord or
 * is empty (rows hide/show, nothing moves):
 *   left:  title (▶, name, notes, Clear chord) · root + type any chord · what it is
 *          (fit, tension; for an empty clip, where it sits) · keyboard + legend
 *   right: inversion · bass note (chords only) · tabs: Ideas for this spot | Other flavors
 */
export function ChordInspector({ chord, spot, tab, onTab, onChange, onClear, onPreview }: Props) {
  const { tonic, mode, next } = spot
  const names = pitchNames(tonic, mode)
  const analysis = chord && analyzeChord(chord, tonic, mode, next ?? spot.loopTo)
  const degree = chord && rootDegree(chord, tonic, mode)
  const hue = degree === null || degree === undefined ? undefined : (degree * 360) / 7
  // Notes picked on the keyboard of an empty clip, in click order; two or more make the chord.
  const [picked, setPicked] = useState<string[]>([])
  const change = (c: Chord, fresh = false) => {
    onChange(c, fresh)
    onPreview(c, fresh)
  }
  const toggleKey = (name: string) => {
    if (chord) return change(toggleNote(chord, name))
    const nextPicked = picked.some((n) => Note.chroma(n) === Note.chroma(name))
      ? picked.filter((n) => Note.chroma(n) !== Note.chroma(name))
      : [...picked, name]
    setPicked(nextPicked)
    const built = nextPicked.length >= MIN_NOTES ? chordFromNotes(nextPicked) : null
    if (built) change(built)
  }
  const roles: Map<number | undefined, string> = chord
    ? new Map(chordIntervals(chord).map((i) => [Note.chroma(noteAt(chord.root, i)), intervalLabel(i)]))
    : new Map(picked.map((n) => [Note.chroma(n), '']))
  const spelled = analysis ? analysis.notes.map((n) => n.note) : picked
  const outNotes = analysis ? analysis.notes.filter((n) => !n.inKey) : []
  // An empty clip only has the ideas tab; a chord can switch between ideas and flavors.
  const shownTab: InspectorTab = chord ? tab : 'ideas'

  return (
    <div
      className={chord ? 'inspector' : 'inspector empty-clip'}
      style={{ '--hue': hue } as CSSProperties}
      data-diatonic={degree === null || degree === undefined ? 'no' : 'yes'}
    >
      <div className="inspector-main">
        <div className="inspector-title">
          <button
            className="hear"
            onClick={() => chord && onPreview(chord)}
            disabled={!chord}
            title="Hear it"
            aria-label="Hear it"
          >
            ▶
          </button>
          {chord && analysis ? (
            <>
              <span className="inspector-name">{chordName(chord)}</span>
              <span className="roman">{analysis.fit.roman}</span>
              <span className="notes">
                {voicedNoteNames(chord).join(' ')}
                {isSlash(chord) && <span className="muted"> · bass {chord.bass}</span>}
              </span>
              <button className="link danger clear-chord" onClick={onClear} title="Remove this chord but keep its place, so you can pick another">
                Clear chord
              </button>
            </>
          ) : (
            <>
              <span className="inspector-name">Select a chord</span>
              <span className="muted">Pick one for this spot</span>
            </>
          )}
        </div>

        <div className="change-row">
          <label>
            Root
            <select
              value={chord ? Note.chroma(chord.root) : ''}
              onChange={(e) => {
                const root = names[Number(e.target.value)]
                if (chord) change(withRoot(chord, root))
                else change(makeChord(root), true)
              }}
            >
              {!chord && <option value="">–</option>}
              {names.map((n, c) => (
                <option key={c} value={c}>
                  {n}
                  {noteInKey(n, tonic, mode) ? '' : ' (not in key)'}
                </option>
              ))}
            </select>
          </label>
          <TypeChord tonic={tonic} mode={mode} onSet={(p) => change(p.chord, p.from !== 'notes')} />
        </div>

        <div className="keyboard-block">
          <NoteKeyboard
            names={names}
            tonic={tonic}
            mode={mode}
            roles={roles}
            spelled={spelled}
            disableLit={!!chord && chordIntervals(chord).length <= MIN_NOTES}
            onToggle={toggleKey}
          />
          <ul className="keyboard-hint">
            <li>
              <span className="out-name">Yellow</span> names are outside {keyName(tonic, mode)}.
            </li>
            <li>Small gray labels are each note&apos;s role (R = root, 3 = 3rd, b7 = flat 7th…).</li>
            <li>Click a key to add or remove it.</li>
          </ul>
        </div>

        {/* Everything below the keyboard varies with the chord; it scrolls if it's long, so the panel keeps its height. */}
        <div className="inspector-desc">
          {chord && analysis ? (
            <>
              <div className={`fit fit-${FIT_MARK[analysis.fit.kind]}`}>
                <p>
                  <span className="fit-badge">{analysis.fit.title}</span>
                </p>
                <p className="fit-detail">
                  <span className="context-label">Context:</span> {analysis.fit.detail}{' '}
                  {analysis.fit.term && <span className="term">Theory: {analysis.fit.term}.</span>}
                </p>
                {outNotes.length > 0 && (
                  <ul className="out-notes">
                    {outNotes.map((n) => (
                      <li key={n.note}>
                        <strong>{n.note}</strong> ({n.role === 'bass' ? 'bass note' : n.role}): {n.why}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={`tension tension-${analysis.tension.level}`}>
                <span className="tension-badge">{analysis.tension.label}</span>
                {analysis.tension.reasons.length === 0 ? (
                  <span className="tension-detail">No notes rub against each other.</span>
                ) : (
                  <ul>
                    {analysis.tension.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="fit">
              <p className="fit-detail">
                <span className="context-label">Context:</span> {spotContext(spot)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="inspector-side">
        {chord && (
          <>
            <div className="voice-row">
              <span className="voice-label">Inversion</span>
              <span className="voice-value">
                {inversionName(chord)} <span className="muted">({lowestNote(chord)} on the bottom)</span>
              </span>
              <span className="group">
                <button
                  className="small"
                  onClick={() => change({ ...chord, inversion: chord.inversion - 1 })}
                  disabled={!canInvert(chord, -1)}
                  title="Lower inversion (↓)"
                >
                  <ArrowIcon dir="down" /> Lower
                </button>
                <button
                  className="small"
                  onClick={() => change({ ...chord, inversion: chord.inversion + 1 })}
                  disabled={!canInvert(chord, 1)}
                  title="Higher inversion (↑)"
                >
                  <ArrowIcon dir="up" /> Higher
                </button>
              </span>
              <span className="voice-hint">Reshapes the chord. The bass note stays {bassNote(chord)}.</span>
            </div>
            <BassRow chord={chord} names={names} tonic={tonic} mode={mode} onChange={(c) => change(c)} />
          </>
        )}

        {chord ? (
          <div className="segmented side-tabs" role="tablist" aria-label="Chord options">
            <button
              className="toggle small"
              role="tab"
              aria-pressed={shownTab === 'flavors'}
              aria-selected={shownTab === 'flavors'}
              onClick={() => onTab('flavors')}
              title={`Other flavors of ${chord.root}`}
            >
              Alternatives
            </button>
            <button
              className="toggle small"
              role="tab"
              aria-pressed={shownTab === 'ideas'}
              aria-selected={shownTab === 'ideas'}
              onClick={() => onTab('ideas')}
              title="Chords that fit this spot in the progression"
            >
              Ideas
            </button>
          </div>
        ) : (
          <h3 className="side-heading">Ideas</h3>
        )}
        <div className="side-content">
          {chord && shownTab === 'flavors' ? (
            <Flavors chord={chord} spot={spot} onPick={(c) => change(c)} />
          ) : (
            // For an empty clip the left side already says where it sits.
            <SpotIdeas spot={spot} current={chord} showContext={!!chord} onPick={(c) => change(c, true)} />
          )}
        </div>
      </div>
    </div>
  )
}

/** Short names for the idea pages, shown under the arrows. */
const PAGE_NAMES: Record<Intent, string> = { home: 'Home', tension: 'Tension', flow: 'Flow', color: 'Color' }

/**
 * Chord ideas for a spot, one page per kind (Feel at home, Build tension, ...), so the
 * panel keeps its height. Arrows and page names underneath. Click an idea to use it.
 */
function SpotIdeas({
  spot,
  current,
  showContext,
  onPick,
}: {
  spot: Spot
  current: Chord | null
  showContext: boolean
  onPick: (c: Chord) => void
}) {
  const { context, groups } = suggestForSpot(spot)
  const [page, setPage] = useState(0)
  const at = Math.min(page, groups.length - 1)
  const g = groups[at]
  const currentName = current ? chordName({ ...current, inversion: 0 }) : null
  if (!g) return null
  return (
    <div className="ideas">
      {showContext && <p className="ideas-context">{context}</p>}
      <div className={`idea-group idea-${g.intent}`}>
        <span className="idea-head">
          <strong>{g.title}</strong> <span className="muted">· {g.hint}</span>
        </span>
        <div className="idea-list">
          {g.ideas.map((idea) => {
            const degree = rootDegree(idea.chord, spot.tonic, spot.mode)
            const name = chordName(idea.chord)
            return (
              <button
                key={name}
                className={`idea${name === currentName ? ' current' : ''}`}
                data-diatonic={degree === null ? 'no' : 'yes'}
                style={{ '--hue': degree === null ? undefined : (degree * 360) / 7 } as CSSProperties}
                aria-pressed={name === currentName}
                onClick={() => onPick(idea.chord)}
              >
                <span className="idea-name">
                  {name} <span className="roman">{idea.roman}</span>
                </span>
                <span className="idea-why">{idea.why}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="idea-pager" role="group" aria-label="Idea pages">
        <button className="small" onClick={() => setPage(at - 1)} disabled={at === 0} aria-label="Previous ideas">
          ‹
        </button>
        {groups.map((x, i) => (
          <button
            key={x.intent}
            className={i === at ? 'page-name current' : 'page-name'}
            aria-current={i === at}
            onClick={() => setPage(i)}
            title={x.title}
          >
            {PAGE_NAMES[x.intent]}
          </button>
        ))}
        <button
          className="small"
          onClick={() => setPage(at + 1)}
          disabled={at === groups.length - 1}
          aria-label="Next ideas"
        >
          ›
        </button>
      </div>
    </div>
  )
}

/**
 * Other flavors of the same root as one list of chips. The left edge of each chip shows
 * its fit (the legend on top), and within a fit the most expected chords come first.
 */
function Flavors({ chord, spot, onPick }: { chord: Chord; spot: Spot; onPick: (c: Chord) => void }) {
  const options = flavorOptions(chord, spot.tonic, spot.mode, spot.next ?? spot.loopTo)
  return (
    <div className="variations">
      <ul className="fit-legend">
        {FIT_MARKS.map((mark) => (
          <li key={mark} className={`fit-${mark}`}>
            <span className="chip-dot" aria-hidden />
            <b>{FIT_SECTIONS[mark].title}</b>
            <span className="muted">{FIT_SECTIONS[mark].hint}</span>
          </li>
        ))}
      </ul>
      <div className="chips">
        {options.map(({ t, c, a, mark }) => {
          const current = chord.type === t.symbol && chord.add.length === 0 && chord.omit.length === 0
          return (
            <button
              key={t.symbol}
              className={`chip fit-${mark}${current ? ' current' : ''}`}
              aria-pressed={current}
              title={`${t.feel}. ${a.fit.title}${a.tension.level ? `; ${a.tension.label.toLowerCase()}` : ''}.`}
              onClick={() => onPick(c)}
            >
              {chord.root}
              {t.symbol}
            </button>
          )
        })}
      </div>
      <p className="variations-note muted">Within each color, the most expected chords come first.</p>
    </div>
  )
}

/**
 * The bass note, separate from the inversion: the root by default, or another note for
 * a slash chord (C/E). Chord notes first (the usual choices), then any other note.
 */
function BassRow({
  chord,
  names,
  tonic,
  mode,
  onChange,
}: {
  chord: Chord
  names: string[]
  tonic: string
  mode: ModeName
  onChange: (c: Chord) => void
}) {
  const bass = Note.chroma(bassNote(chord))
  const tones = chordIntervals(chord).map((i) => ({ note: noteAt(chord.root, i), role: intervalLabel(i) }))
  const toneChromas = new Set(tones.map((t) => Note.chroma(t.note)))
  const others = names.filter((n) => !toneChromas.has(Note.chroma(n)))
  const otherBass = !toneChromas.has(bass)
  return (
    <div className="voice-row">
      <span className="voice-label">Bass note</span>
      <span className="segmented" role="group" aria-label="Bass note">
        {tones.map((t) => (
          <button
            key={t.note}
            className="toggle small"
            aria-pressed={Note.chroma(t.note) === bass}
            title={t.role === 'root' ? 'The root: the normal bass note' : `${chord.root} chord over ${t.note} (${chordName(withBass(chord, t.note))})`}
            onClick={() => onChange(withBass(chord, t.note))}
          >
            {t.note} <span className="muted">{t.role === 'root' ? 'root' : t.role}</span>
          </button>
        ))}
      </span>
      <select
        className={otherBass ? 'active' : undefined}
        value={otherBass ? String(bass) : ''}
        aria-label="Another bass note"
        onChange={(e) => e.target.value !== '' && onChange(withBass(chord, names[Number(e.target.value)]))}
      >
        <option value="">Other note…</option>
        {others.map((n) => (
          <option key={n} value={Note.chroma(n)}>
            {n}
            {noteInKey(n, tonic, mode) ? '' : ' (not in key)'}
          </option>
        ))}
      </select>
      <span className="voice-hint">
        {isSlash(chord)
          ? `Slash chord: ${chord.root}${chord.type} over ${chord.bass}. The bass plays ${chord.bass}; the chord above stays the same.`
          : `The bass plays the root. Pick another note for a slash chord (like ${chordName(withBass(chord, chordNotes(chord)[1] ?? chord.root))}).`}
      </span>
    </div>
  )
}

/** One octave of keys: lit = in the chord (with its role), dots = in the key. */
function NoteKeyboard({
  names,
  tonic,
  mode,
  roles,
  spelled,
  disableLit = false,
  onToggle,
}: {
  names: string[]
  tonic: string
  mode: ModeName
  /** Role label per lit pitch class. */
  roles: Map<number | undefined, string>
  /** How lit notes are spelled (the chord's spelling). */
  spelled: string[]
  disableLit?: boolean
  onToggle: (name: string) => void
}) {
  const key = (c: number, black: boolean) => {
    const role = roles.get(c)
    const name = spelled.find((n) => Note.chroma(n) === c) ?? names[c]
    const inKey = noteInKey(name, tonic, mode)
    const lit = role !== undefined
    const disabled = lit && disableLit
    const label = `${lit ? 'Remove' : 'Add'} ${name}${role ? ` (${role})` : ''}${inKey ? '' : ' (not in the key)'}`
    return (
      <button
        key={c}
        className={['key', black ? 'black' : 'white', lit && 'lit', !inKey && 'out'].filter(Boolean).join(' ')}
        style={black ? { left: `calc(${BLACK_AT[c]} * (100% / 7))` } : undefined}
        title={disabled ? `A chord needs at least ${MIN_NOTES} notes` : label}
        aria-label={label}
        aria-pressed={lit}
        disabled={disabled}
        onClick={() => onToggle(name)}
      >
        {lit && role && <span className="key-role">{role === 'root' ? 'R' : role}</span>}
        <span className="key-name">{name}</span>
      </button>
    )
  }
  return (
    <div className="keyboard" role="group" aria-label="Notes in the chord">
      {WHITE.map((c) => key(c, false))}
      {BLACK.map((c) => key(c, true))}
    </div>
  )
}

/**
 * "Type any chord": a chord name (loosely spelled), a list of notes, or a roman numeral
 * in the home key. Shows how it reads it while you type; Enter sets it.
 */
function TypeChord({
  tonic,
  mode,
  onSet,
}: {
  tonic: string
  mode: ModeName
  onSet: (parsed: ParsedChord) => void
}) {
  const [typed, setTyped] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const parsed = readChordInput(typed, { tonic, mode })
  const reading = parsed && describeReading(parsed, typed, tonic, mode)
  return (
    <form
      className="type-chord"
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        if (parsed) {
          onSet(parsed)
          setTyped('')
          setSubmitted(false)
        }
      }}
    >
      <span className="type-row">
        <input
          type="text"
          value={typed}
          placeholder="Type any chord: F#m7b5, C E G, V7…"
          aria-label="Type any chord"
          aria-invalid={submitted && !parsed}
          onChange={(e) => {
            setTyped(e.target.value)
            setSubmitted(false)
          }}
        />
        <button type="submit" disabled={!parsed}>
          Set
        </button>
      </span>
      {typed.trim() && (
        <span className={parsed ? 'type-reading' : 'type-reading error'}>
          {parsed ? reading : "Can't read that yet. Try a name (Am7, Cadd9, G/B), notes (C E G) or a numeral (IV, V7)."}
        </span>
      )}
    </form>
  )
}

/** How a typed chord was read, in words: "→ Cmaj7 · C E G B", "From the notes: C major". */
function describeReading({ chord, from }: ParsedChord, typed: string, tonic: string, mode: ModeName): string {
  const name = chordName(chord)
  const notes = chordNotes(chord).join(' ')
  if (from === 'notes') return `Those notes make ${name} (${notes})`
  if (from === 'numeral') return `${typed.trim()} in ${keyName(tonic, mode)} is ${name} (${notes})`
  return `→ ${name} (${isSlash(chord) ? `${notes}, bass ${chord.bass}` : notes})`
}
