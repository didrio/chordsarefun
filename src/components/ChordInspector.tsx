import { useState, type CSSProperties } from 'react'
import { Note } from 'tonal'
import { analyzeChord, type Analysis } from '../music/analysis'
import { ArrowIcon } from './ArrowIcon'
import { PlayIcon } from './Icons'
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
  shiftOctave,
  MIN_NOTES,
  noteAt,
  toggleNote,
  voicedNoteNames,
  withBass,
  withRoot,
  type Chord,
} from '../music/chord'
import { chordFromNotes, readChordInput, type ParsedChord } from '../music/parse'
import { inContext, INTENTS, spotContext, suggestForSpot, type Intent, type Spot } from '../music/suggest'
import { KEYS, keyName, noteInKey, rootDegree, scaleNotes, type ModeName } from '../music/theory'

/**
 * The inspector's tabs: chords that fit the spot (the songwriter's question, so it comes
 * first), other flavors of the same root, and hands-on notes (keyboard, inversion, bass).
 */
export type InspectorTab = 'ideas' | 'flavors' | 'notes'

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
  /** Put the clip's chord back to `chord` (null = empty), for "Back to Cm". One undo step. */
  onRestore: (chord: Chord | null) => void
  /** Open the chord menu (the ⋯) at a viewport point; it acts on this chord. */
  onMenu: (x: number, y: number) => void
  /** Hear a chord. `fresh` = a new chord (an idea, typed), which the app plays in the track's octave, as it would place it. */
  onPreview: (chord: Chord, fresh?: boolean) => void
  /**
   * Hear a chord where it sits (the chord before, it, the chord after), after it was
   * used from a card. `fresh` as in onPreview.
   */
  onHearInContext: (chord: Chord, fresh?: boolean) => void
}

const WHITE = [0, 2, 4, 5, 7, 9, 11]
const BLACK = [1, 3, 6, 8, 10]
/** Black key positions, in white-key widths from the left edge. */
const BLACK_AT: Record<number, number> = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 }

/** The three fit categories, with what each means. */
const FIT_SECTIONS: Record<FitMark, { title: string; hint: string }> = {
  in: { title: 'In key', hint: 'every note is in the key' },
  common: { title: 'Common moves', hint: 'outside the key, but used all the time' },
  out: { title: 'Outside the key', hint: 'surprising, a bold choice' },
}

/** Flavors shown per fit group before "Show all": one row on a desktop-width panel. */
const FLAVORS_PER_GROUP = 6

/** Names for the 12 pitch classes: the key's spelling where it has one. */
function pitchNames(tonic: string, mode: ModeName): string[] {
  const scale = scaleNotes(tonic, mode)
  return Array.from({ length: 12 }, (_, c) => scale.find((n) => Note.chroma(n) === c) ?? KEYS[c])
}

/**
 * The inspected clip, in one layout whether it has a chord or is empty:
 *   header: ▶, name, numeral, notes, one plain sentence on how it fits · Back to the chord it opened with · type a chord · ⋯
 *   tabs:   Ideas for this spot | Variations of the root | Notes
 * The panel keeps one height; the tab content scrolls inside it when long.
 */
export function ChordInspector({ chord, spot, tab, onTab, onChange, onRestore, onMenu, onPreview, onHearInContext }: Props) {
  const { tonic, mode, next } = spot
  const names = pitchNames(tonic, mode)
  const analysis = chord && analyzeChord(chord, tonic, mode, next ?? spot.loopTo)
  const degree = chord && rootDegree(chord, tonic, mode)
  const hue = degree === null || degree === undefined ? undefined : (degree * 360) / 7
  // Notes picked on the keyboard of an empty clip, in click order; two or more make the chord.
  const [picked, setPicked] = useState<string[]>([])
  // The chord this clip had when it was selected (the inspector remounts per clip), for "Back to".
  const [opened] = useState(chord)
  const changed = JSON.stringify(opened) !== JSON.stringify(chord)
  const change = (c: Chord, fresh = false) => {
    onChange(c, fresh)
    onPreview(c, fresh)
  }
  // Using a card: set the chord and hear it where it sits (while the track plays, the loop does that).
  const use = (c: Chord, fresh = false) => {
    onChange(c, fresh)
    onHearInContext(c, fresh)
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
  // An empty clip has no root yet, so no flavors: it shows its ideas instead.
  const shownTab: InspectorTab = !chord && tab === 'flavors' ? 'ideas' : tab
  const mark = analysis ? FIT_MARK[analysis.fit.kind] : null
  const tabs: { id: InspectorTab; label: string; title: string }[] = [
    { id: 'ideas', label: 'Ideas for this spot', title: 'Chords that fit here, and why' },
    {
      id: 'flavors',
      label: chord ? `Variations of ${chord.root}` : 'Variations',
      title: chord ? `Other kinds of ${chord.root} chord: 7ths, sus, minor…` : 'Pick a chord first',
    },
    { id: 'notes', label: 'Notes', title: 'The notes on a keyboard, the bass note, the shape (inversion, octave) and why it sounds like this' },
  ]

  return (
    <div
      className={chord ? 'inspector' : 'inspector empty-clip'}
      style={{ '--hue': hue } as CSSProperties}
      data-diatonic={degree === null || degree === undefined ? 'no' : 'yes'}
    >
      <div className="insp-head">
        <button
          className="hear"
          onClick={() => chord && onPreview(chord)}
          disabled={!chord}
          title="Hear it"
          aria-label="Hear it"
        >
          <PlayIcon />
        </button>
        <div className="insp-title">
          <div className="insp-name-row">
            {chord && analysis ? (
              <>
                <span className="inspector-name">{chordName(chord)}</span>
                <span className="roman">{analysis.fit.roman}</span>
                <span className="notes">
                  {voicedNoteNames(chord).join(' ')}
                  {isSlash(chord) && <> · bass {chord.bass}</>}
                </span>
              </>
            ) : (
              <span className="inspector-name">Pick a chord</span>
            )}
          </div>
          {chord && analysis && mark ? (
            <p className={`insp-fit fit-${mark}`} title={analysis.fit.detail}>
              <span className="fit-badge">{analysis.fit.title}</span>
              {analysis.tension.level > 0 && (
                <span className={`tension-badge tension-${analysis.tension.level}`}>{analysis.tension.label}</span>
              )}
              <span className="insp-fit-detail">{analysis.fit.detail}</span>
            </p>
          ) : (
            <p className="insp-fit">
              <span className="insp-fit-detail">{spotContext(spot)} Pick an idea, type a chord, or click notes.</span>
            </p>
          )}
        </div>
        {changed && (
          <button
            className="link back"
            onClick={() => {
              onRestore(opened)
              if (opened) onPreview(opened)
            }}
            title="Put back the chord this spot had when you opened it (one undo step)"
          >
            ↺ Back to {opened ? chordName(opened) : 'empty'}
          </button>
        )}
        <TypeChord tonic={tonic} mode={mode} onSet={(p) => change(p.chord, p.from !== 'notes')} />
        <button
          className="chord-more"
          aria-label="Chord actions"
          title="Actions: inversion, octave, duplicate, clear, delete"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            onMenu(r.left, r.bottom + 4)
          }}
        >
          ⋯
        </button>
      </div>

      <div className="insp-tabs" role="tablist" aria-label="Chord options">
        {tabs.map((t) => (
          <button
            key={t.id}
            className="insp-tab"
            role="tab"
            aria-selected={shownTab === t.id}
            disabled={t.id === 'flavors' && !chord}
            title={t.title}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        {chord && <span className="insp-context">{spotContext(spot)}</span>}
      </div>

      <div className="insp-body" role="tabpanel">
        {shownTab === 'ideas' && (
          <SpotIdeas spot={spot} current={chord} onPick={(c) => use(c, true)} />
        )}
        {shownTab === 'flavors' && chord && (
          <Flavors chord={chord} spot={spot} onPick={(c) => use(c)} />
        )}
        {shownTab === 'notes' && (
          <div className="notes-tab">
            <div className="notes-keys">
              <label className="root-pick">
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
              <NoteKeyboard
                names={names}
                tonic={tonic}
                mode={mode}
                roles={
                  chord
                    ? new Map(chordIntervals(chord).map((i) => [Note.chroma(noteAt(chord.root, i)), intervalLabel(i)]))
                    : new Map(picked.map((n) => [Note.chroma(n), '']))
                }
                spelled={analysis ? analysis.notes.map((n) => n.note) : picked}
                disableLit={!!chord && chordIntervals(chord).length <= MIN_NOTES}
                onToggle={toggleKey}
              />
              <p className="keyboard-hint">
                Click a key to add or remove it. <span className="out-name">Yellow</span> = outside {keyName(tonic, mode)}; small
                labels = each note&apos;s role (R = root).
              </p>
            </div>
            <div className="notes-side">
              {chord && analysis ? (
                <>
                  <BassRow chord={chord} names={names} tonic={tonic} mode={mode} onChange={(c) => change(c)} />
                  <ShapeRow chord={chord} onChange={(c) => change(c)} />
                  <WhyItSounds analysis={analysis} />
                </>
              ) : (
                <p className="muted">Click two or more keys to build a chord for this spot.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

type CardProps = { spot: Spot; onPick: (c: Chord) => void }

/**
 * Chord ideas for a spot, all four kinds side by side (Feel at home, Build tension, Flow
 * smoothly, Add color), each with up to three cards. A kind with nothing to offer keeps
 * its column, so the layout never shifts. Clicking an idea uses it and plays it in place.
 */
function SpotIdeas({ spot, current, onPick }: CardProps & { current: Chord | null }) {
  const { groups } = suggestForSpot(spot)
  const byIntent = new Map(groups.map((g) => [g.intent, g]))
  const currentName = current ? chordName({ ...current, inversion: 0 }) : null
  return (
    <div className="ideas-grid">
      {(Object.keys(INTENTS) as Intent[]).map((intent) => {
        const g = byIntent.get(intent)
        return (
          <section key={intent} className={`idea-group idea-${intent}`}>
            <h4 className="idea-head">
              {INTENTS[intent].title} <span className="muted">{INTENTS[intent].hint}</span>
            </h4>
            {g ? (
              g.ideas.map((idea) => {
                const degree = rootDegree(idea.chord, spot.tonic, spot.mode)
                const name = chordName(idea.chord)
                return (
                  <div key={name} className="card">
                    <button
                      className={`idea${name === currentName ? ' current' : ''}`}
                      data-diatonic={degree === null ? 'no' : 'yes'}
                      style={{ '--hue': degree === null ? undefined : (degree * 360) / 7 } as CSSProperties}
                      aria-pressed={name === currentName}
                      title={
                        name === currentName
                          ? `${name} is the chord here now`
                          : `${currentName ? `Use ${name} here instead of ${currentName}` : `Use ${name} here`} and hear it in place: ${placeSteps(spot, idea.chord)}.\n\n${idea.why}`
                      }
                      onClick={() => onPick(idea.chord)}
                    >
                      <span className="idea-name">
                        {name} <span className="roman">{idea.roman}</span>
                      </span>
                      <span className="idea-why">{idea.why}</span>
                    </button>
                  </div>
                )
              })
            ) : (
              <p className="idea-none">Nothing obvious here.</p>
            )}
          </section>
        )
      })}
    </div>
  )
}

/**
 * Other flavors of the same root, grouped by how they fit the key, each with its feel in
 * plain words. The most expected come first; "Show all" reveals the rest. Click one to
 * use it (and hear it in place).
 */
function Flavors({ chord, spot, onPick }: CardProps & { chord: Chord }) {
  const [all, setAll] = useState(false)
  const options = flavorOptions(chord, spot.tonic, spot.mode, spot.next ?? spot.loopTo)
  const isCurrent = (symbol: string) => chord.type === symbol && chord.add.length === 0 && chord.omit.length === 0
  const groups = FIT_MARKS.map((mark) => {
    const group = options.filter((o) => o.mark === mark)
    // Collapsed: the first few, plus the current flavor wherever it ranks.
    const shown = all ? group : group.filter((o, i) => i < FLAVORS_PER_GROUP || isCurrent(o.t.symbol))
    return { mark, shown, hidden: group.length - shown.length }
  }).filter((g) => g.shown.length > 0)
  const hidden = groups.reduce((n, g) => n + g.hidden, 0)
  return (
    <div className="flavors">
      {groups.map(({ mark, shown }) => {
        return (
          <section key={mark} className={`flavor-group fit-${mark}`}>
            <h4 className="flavor-head">
              <span className="chip-dot" aria-hidden /> {FIT_SECTIONS[mark].title}{' '}
              <span className="muted">{FIT_SECTIONS[mark].hint}</span>
            </h4>
            <div className="flavor-list">
              {shown.map(({ t, c, a }) => (
                <div key={t.symbol} className="card">
                  <button
                    className={`flavor fit-${mark}${isCurrent(t.symbol) ? ' current' : ''}`}
                    aria-pressed={isCurrent(t.symbol)}
                    title={`${chordName(c)}: ${t.feel}. ${a.fit.title}${a.tension.level ? `; ${a.tension.label.toLowerCase()}` : ''}. Click to use it and hear it in place: ${placeSteps(spot, c)}.`}
                    onClick={() => onPick(c)}
                  >
                    <span className="flavor-name">
                      {chord.root}
                      {t.symbol}
                    </span>
                    <span className="flavor-feel">{t.feel}</span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )
      })}
      {(all || hidden > 0) && (
        <button className="link show-all" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${options.length}`}
        </button>
      )}
    </div>
  )
}

/** What a click on a card plays, in words: "C → G → Am". */
function placeSteps(spot: Spot, chord: Chord): string {
  return inContext(spot, chord)
    .map((c) => chordName(c))
    .join(' → ')
}

/**
 * The chord's shape: its inversion (which note is on the bottom of the hands) and its
 * octave. Neither changes the name or the bass note.
 */
function ShapeRow({ chord, onChange }: { chord: Chord; onChange: (c: Chord) => void }) {
  const hint = `Reshapes the chord; the bass note stays ${bassNote(chord)}`
  const lower = shiftOctave(chord, -1)
  const higher = shiftOctave(chord, 1)
  return (
    <div className="voice-row">
      <span className="voice-label" title={hint}>
        Shape
      </span>
      <span className="voice-value">
        {inversionName(chord)} <span className="muted">({lowestNote(chord)} on the bottom)</span>
      </span>
      <span className="group">
        <button
          className="small"
          onClick={() => onChange({ ...chord, inversion: chord.inversion - 1 })}
          disabled={!canInvert(chord, -1)}
          title={`Lower inversion (↓). ${hint}.`}
        >
          <ArrowIcon dir="down" /> Inversion
        </button>
        <button
          className="small"
          onClick={() => onChange({ ...chord, inversion: chord.inversion + 1 })}
          disabled={!canInvert(chord, 1)}
          title={`Higher inversion (↑). ${hint}.`}
        >
          <ArrowIcon dir="up" /> Inversion
        </button>
      </span>
      <span className="group">
        <button className="small" onClick={() => lower && onChange(lower)} disabled={!lower} title="An octave lower (⇧↓)">
          <ArrowIcon dir="down" /> Octave
        </button>
        <button className="small" onClick={() => higher && onChange(higher)} disabled={!higher} title="An octave higher (⇧↑)">
          <ArrowIcon dir="up" /> Octave
        </button>
      </span>
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
  const example = chordName(withBass(chord, chordNotes(chord)[1] ?? chord.root))
  return (
    <div className="voice-row">
      <span className="voice-label" title={`The bass plays the root. Pick another note for a slash chord (like ${example}).`}>
        Bass note
      </span>
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
        title={`Any note in the bass, for a slash chord (like ${example})`}
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
      {isSlash(chord) && (
        <span className="voice-hint">
          Slash chord: {chord.root}
          {chord.type} over {chord.bass}. The bass plays {chord.bass}; the chord above stays the same.
        </span>
      )}
    </div>
  )
}

/** The fuller story behind the header's one line: the theory name, the notes outside the key, and what rubs. */
function WhyItSounds({ analysis }: { analysis: Analysis }) {
  const outNotes = analysis.notes.filter((n) => !n.inKey)
  return (
    <div className="why">
      <h4 className="why-head">Why it sounds like this</h4>
      <div className={`fit fit-${FIT_MARK[analysis.fit.kind]}`}>
        <p className="fit-detail">
          <span className="fit-badge">{analysis.fit.title}</span> {analysis.fit.detail}{' '}
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
 * "Type a chord": a chord name (loosely spelled), a list of notes, or a roman numeral in
 * the home key. Shows how it reads it while you type, in a popover under the box (so the
 * header never changes height); Enter sets it.
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
      <input
        type="text"
        value={typed}
        placeholder="Type a chord: Am7, C E G, IV…"
        aria-label="Type any chord"
        title="Type any chord: a name (F#m7b5, Cadd9, G/B), notes (C E G) or a numeral (IV, V7). Enter sets it."
        aria-invalid={submitted && !parsed}
        onChange={(e) => {
          setTyped(e.target.value)
          setSubmitted(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setTyped('')
        }}
      />
      {typed.trim() && (
        <span className={parsed ? 'type-reading' : 'type-reading error'} role="status">
          {parsed ? (
            <>
              {reading} <span className="muted">· Enter to use it</span>
            </>
          ) : (
            "Can't read that yet. Try a name (Am7, Cadd9, G/B), notes (C E G) or a numeral (IV, V7)."
          )}
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
