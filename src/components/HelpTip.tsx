import { COPY_KEY, FREE_KEY, NUDGE_KEY } from '../platform'

/** [what you do, what happens] rows, grouped. Keep in sync with shortcuts.ts and AGENTS.md. */
const KEYS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Play',
    rows: [
      ['Space', 'Play / pause (the section, or the song if ▶ Song played last)'],
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
      ['Right-click · ⋯', 'Actions on a chord: ideas, inversion, octave, duplicate, clear, delete'],
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
    title: 'Song (with parts of the song selected)',
    rows: [
      ['Click', 'Select a part and edit its section'],
      ['⌘ / Ctrl + D', 'Play it again right after (the same music)'],
      ['Delete / Backspace', 'Take it out of the song (the section stays)'],
      ['← →', 'Previous / next part'],
      [`${NUDGE_KEY} + ← →`, 'Move it one place earlier / later'],
      ['Right-click · ⋯', 'Edit this section, duplicate, make a new section from it, remove'],
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
            (<b>Variations</b>), or its notes, inversion and bass note (<b>Notes</b>). Or type any chord you like.
            Clicking an idea uses it and plays it between its neighbors; undo puts the old one back.
          </li>
          <li>
            <b>Arrange.</b> Drag chords to move them (the preview tells you what will happen), drag an edge to resize,
            hold {COPY_KEY} to copy.
          </li>
          <li>
            <b>Choose Instruments</b> for the chords, bass and drums (the Instruments bar under the track), then press Play. Tempo, time signature, length,
            grid and the metronome are in the same song button as the key.
          </li>
          <li>
            <b>Make a song.</b> <b>+ Section</b> adds a verse, a chorus…, each with its own chords, length and
            instruments (the key and tempo are shared). Open <b>Song</b> and drag sections onto it in the order they
            play; repeats are the same music. <b>▶ Song</b> plays it all.
          </li>
          <li>
            <b>Keep it.</b> Everything saves as you go. The session name at the top opens all your sessions (folders,
            favorites, a backup file), and <b>Export</b> takes it into your DAW as audio (WAV) or MIDI.
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
