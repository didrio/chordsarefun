import { COPY_KEY, FREE_KEY } from '../platform'

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
        <div>
        <h2>How it works</h2>
        <ol>
          <li>
            <b>Pick a Home</b> (a key and mood). Chords are colored by how well they fit it, and anything outside it is
            explained, never forbidden.
          </li>
          <li>
            <b>Add chords.</b> Choose a <b>Progression</b> (the dice picks one for you), or press <b>+ New</b> (or
            double-click empty space on the track) to add a spot and pick one of its chord ideas.
          </li>
          <li>
            <b>Click a chord</b> to open its details: other flavors, inversions, the bass note, or type any chord
            you like.
          </li>
          <li>
            <b>Arrange.</b> Drag chords to move them (the preview tells you what will happen), drag an edge to resize,
            hold {COPY_KEY} to copy.
          </li>
          <li>
            <b>Choose a Groove</b> for the chords, bass and drums, then press Play. Tempo, time signature, length and
            grid are under the BPM button.
          </li>
          <li>
            <b>Keep it.</b> Everything saves as you go. Name a session to keep it, and Download MIDI to take the chords
            into your DAW.
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
