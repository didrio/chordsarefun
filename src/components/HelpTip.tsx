import { COPY_KEY, FREE_KEY, NUDGE_KEY } from '../platform'

/** [what you do, what happens] rows, grouped. Keep in sync with shortcuts.ts and AGENTS.md. */
const KEYS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Play',
    rows: [
      ['Space', 'Play / pause'],
      ['Shift + Space', 'Stop and go back to the start'],
      ['L', 'Loop on / off'],
      ['M', 'Metronome on / off'],
      ['← →', 'Move the playhead one grid step (or the previous / next chord, if one is selected)'],
    ],
  },
  {
    title: 'Select',
    rows: [
      ['Click', 'Select a chord and open its details'],
      ['Shift + click', 'Select everything from the last chord to this one'],
      ['⌘ / Ctrl + click', 'Add or remove one chord from the selection'],
      ['⌘ / Ctrl + A', 'Select all chords'],
      ['Esc', 'Deselect'],
    ],
  },
  {
    title: 'Edit',
    rows: [
      ['Delete / Backspace', 'Remove the selected chords'],
      ['⌘ / Ctrl + D', 'Duplicate the selected chords (the copy goes right after them)'],
      [`${NUDGE_KEY} + ← →`, 'Move the selected chords one grid step (into empty space only)'],
      ['↑ ↓', 'Next / previous inversion (selected chords, or all)'],
      ['Shift + ↑ ↓', 'Octave up / down (selected chords, or all)'],
      ['⌘ / Ctrl + Z', 'Undo'],
      ['⇧⌘Z / Ctrl + Y', 'Redo'],
    ],
  },
  {
    title: 'While dragging',
    rows: [
      [COPY_KEY, 'Copy instead of move'],
      [FREE_KEY, 'Ignore the grid (also when resizing or moving the playhead)'],
      ['Esc', 'Cancel the drag'],
    ],
  },
]

/**
 * The little (i) next to the logo: hover or focus it for how the app works and every
 * shortcut. Pure CSS (no state), so it can't get stuck open.
 */
export function HelpTip() {
  return (
    <span className="help">
      <button className="help-icon" aria-label="How it works and keyboard shortcuts" aria-describedby="help-tip">
        i
      </button>
      <div className="help-tip" id="help-tip" role="tooltip">
        <h2 className="help-brand">chords are fun</h2>
        <div>
        <h2>How it works</h2>
        <ol>
          <li>
            <b>Pick a Key</b> (the song button, top right): a home note and a mood. Chords are colored by how well they fit it, and
            anything outside it is explained, never forbidden.
          </li>
          <li>
            <b>Add chords.</b> Start from a <b>Progression</b> (the dice picks one for you), or press <b>Add chord</b> (or
            double-click empty space on the track) to add a spot and pick one of its ideas.
          </li>
          <li>
            <b>Click a chord</b> to see what could go there instead (<b>Ideas</b>), other kinds of the same chord
            (<b>Flavors</b>), or its notes, inversion and bass note (<b>Notes</b>). Or type any chord you like. The
            small ▶ on an idea plays it between its neighbors without changing anything; click the idea to use it.
          </li>
          <li>
            <b>Arrange.</b> Drag chords to move them (the preview tells you what will happen), drag an edge to resize,
            hold {COPY_KEY} to copy.
          </li>
          <li>
            <b>Choose a Groove</b> for the chords, bass and drums, then press Play. Tempo, time signature, length,
            grid and the metronome are in the same song button as the key.
          </li>
          <li>
            <b>Keep it.</b> Everything saves as you go. The session name at the top opens all your sessions (folders,
            favorites, a backup file), and Download MIDI takes the chords into your DAW.
          </li>
        </ol>
        </div>
        <div>
        <h2>Shortcuts</h2>
        {KEYS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.rows.map(([k, v]) => (
                <div key={k + v}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        </div>
      </div>
    </span>
  )
}
