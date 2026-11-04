# AGENTS.md

Context for AI agents (and humans) working on this repo. **Keep it current**: when a
behavior, decision, or file layout changes, update the matching section here in the
same change.

## What we're building

A browser app that helps musicians come up with chord progressions. It must be
**equally intuitive for people who know no music theory and can't read sheet music**
(e.g. producers who play keys by ear in Ableton) and for people who do. Theory is
there to help, never required: always show the plain chord name and the actual notes,
and treat roman numerals / theory labels as extra info, never the only info.

It's also a **brainstorming tool**: guided by default (palette, progression library,
variations that fit the key), free when you want (any chord, any note, inversions).
Going outside the key is information, never an error: the app says what a chord is
and how it's used, in plain words.

The feel is **a single DAW track** (Ableton-like): clips, a grid, a playhead, a
transport, keyboard shortcuts, multi-select. Where there's a DAW convention, follow it
unless it conflicts with the fixed-length model below.

Static site only: no backend, no accounts. State is saved in the browser's
localStorage, as sessions (see Sessions). Hosted on GitHub Pages via `.github/workflows/deploy.yml` (tests, builds,
deploys on push to `main`) and on Cloudflare (Workers static assets: `wrangler.jsonc` serves
`dist`; build command `npm run build`, deploy command `npx wrangler deploy`).

## Working with the owner

- The owner is a fullstack (React) developer and long-time Ableton/keyboard producer
  with little formal theory. Explain things with DAW analogies, not theory jargon.
- They describe what they want and explicitly invite pushback: give an honest opinion,
  propose a simpler/more consistent model when there is one, then build it and say
  clearly where you deviated from their ask.
- Intuitive and predictable beats clever. Prefer one consistent rule over several
  position-dependent behaviors, and make every drag/edit explain its result before it
  happens.
- Layouts must not jump: panels keep their size and position as content changes
  (fixed heights, anchored controls, rows that hide/show in place, paging instead of
  long lists). Similar views (e.g. a chord vs an empty clip) share one layout.
- Verify UI changes in a real browser before calling them done (see Verifying).

## The paradigm: Home, palette, chord

Everything is organized around one **Home** (key + mood), in three layers:

- **Song**: Home and Groove, the context everything is measured against.
- **Palette**: chord options around home (7 home chords, the Spice row, palette size,
  progressions).
- **Chord**: one chord up close (the inspector).

**Home is context, not content: nothing on the track changes unless you ask.** Every
chord anywhere (palette, spice, track, inspector, progression menu) uses the same
colors, fit dots and plain-language reasons, always relative to Home.

## Explaining theory

- Plain words first, theory term second, as extra info ("Borrowed from C minor ...
  Theory: borrowed chord (modal interchange)").
- Descriptive, never judgmental: "outside the key", "clashing", not "wrong".
- **"Out of key" and "dissonant" are separate questions** (`analysis.ts`): fit is how
  a chord relates to the key; tension is half-step rubs inside the chord. A chord can be
  outside the key and smooth, or in key and clashing.

## Core model: the workspace

- **One workspace**: a single horizontal track = one chord progression.
- **Fixed length** in bars of a chosen time signature (1, 2, 4 or 8 bars). Playback
  time depends only on bars, time signature and BPM, **never on how many chords there
  are**. Adding chords subdivides the same span; it never makes the track longer.
- Each chord is a **clip** (`{ id, chord, start, length }`). Clips never overlap and
  never extend past the track. Gaps (silence) are allowed. `chord: null` is an **empty
  clip**: a silent placeholder waiting for a chord (see Empty clips); analysis, home
  detection and playback skip it (`chordClips`).
- A **chord is a description, not raw notes** (`src/music/chord.ts`):
  `{ root, type, add, omit, inversion, bass? }`. Notes, name ("Cmaj7(no 5)/E") and voicing are
  derived. `type` is one of `CHORD_TYPES`; `fromIntervals` keeps it canonical (adding
  B♭ to C gives C7, not "C add ♭7"). Voicing = close position from the root in octave 3,
  then `inversion`: k = q whole octaves + r rotations (lowest note up an octave), so
  inversion ± note count is always exactly an octave, even for chords wider than an
  octave. Kept within MIDI 36–88. Every name `chordName` produces parses back (`parseChord`).
- **Inversion and bass note are separate.** `inversion` only shapes the chords part's
  voicing (which note is on the bottom of the hands); it never changes the name or the
  bass. `bass` (absent = root) is a deliberate slash chord: "C/E" only when a bass is
  set (`withBass`). The Bass part plays `bass ?? root`; when the Bass part is off, a
  slash chord's bass note is played by the chords part as one low note under the
  voicing (`chordPartVoicing`), so a slash chord is always heard. A slash bass outside
  the chord (the G of F/G) counts as part of the sound for fit and home detection
  (`soundingNotes`). `bassNote` = the bass; `lowestNote` = the voicing's bottom note.
- Times are integer **ticks**, `TICKS_PER_BEAT = 480` per **quarter note** (MIDI PPQ),
  to avoid float drift and map straight to MIDI. BPM is always quarter notes per minute.

## Behavior

### Adding chords

- **The palette (7 in-key chords), the Spice row and the Triads/7ths/9ths toggle were
  removed**: the inspector's Alternatives and Ideas cover chord ideas now. The 1–7
  shortcuts went with them. Chords get on the track via Progressions, double-click
  empty clips + Ideas / typing a chord in the inspector, and copy-drag of clips.
  `Palette.tsx` (+ `SpiceRow`), `spiceChords`, `diatonicChords` and the `.chord-picker`
  CSS are now unused by the UI (kept, tested; delete when sure they're not coming back).
- Ideas use triads (the size toggle is gone; `flavor` is a constant in `App.tsx`).
- Previews of a **new** chord (an idea, a typed chord, a picked root) are played in the octave
  it would be placed in (`fitOctave`: nearest the chords on the track, around C4 on an empty
  track), so you hear it in the register you're working in. Chords already on the track
  (clicking them, ▶, flavor/bass/inversion edits) play their real voicing.
- Previews (clicking a chord anywhere) play it as the track would: the chord on the
  chord instrument plus its bass note on the bass instrument when the Bass part is on.
- `useChordDrag` can still drag a *new* chord in (palette-style) but nothing in the UI starts one.

### Chord inspector, notes lane, progressions

- The **details panel** under the track (like Ableton's detail view) is dismissable, not
  collapsible: an X at its top right closes it. It shows the **inspected clip**: the last
  clip selected on its own. Selecting a clip, adding one (palette drop, double-click, copy)
  or stepping with ←/→ switches it and shows the panel; clicking elsewhere or Esc only
  deselects (so nothing jumps). Selecting several clips (or none) hides it entirely; the
  group voicing buttons are in More. The inspected clip gets a dashed outline on the track
  while it isn't selected.
- Inspector (`ChordInspector.tsx`): **one layout for chords and empty clips**; rows hide
  or show, nothing moves. The panel is **always the same height** (25rem on
  desktop): the parts that vary scroll inside it.
  - Left, fixed from the name down to the keyboard legend: ▶, name (or "Select a chord" for an empty one),
    roman, notes (+ "bass E"), and a red **Clear chord** (the clip becomes empty, in
    place) · Root picker (for an empty clip it sets a major chord) + "type any chord" ·
    the one-octave keyboard (lit = in the chord; note names outside the key in yellow,
    as a yellow pill on lit keys; each lit note's role (R, 3, b7…) small and gray
    above its name; click to add/remove, min 2 notes; on an empty clip, two clicked
    notes make the chord) and its three-line legend. Then, under a dotted line and
    scrolling if long: the fit badge and "**Context:** …" explanation, theory term,
    out-of-key notes, tension; for an empty clip, "Context: Between G and F."
  - Right: for chords, the **Inversion** row ("1st inversion (E on the bottom)", ↓/↑ arrows,
    "the bass note stays C") and the **Bass note** row (chord tones as buttons, root
    first, plus "Other note…"; explains slash chords); then tabs **Alternatives**
    (other flavors of the root: a three-row color legend on top, then **one flat list of
    chips** whose 2px left edge shows the fit: green In key, then blue Borrowed &
    leading, then orange Outside the key; within each color the most expected chords
    come first (`flavors.ts`, and the note under the chips says so)) | **Ideas**. An empty clip just has an "Ideas" heading. Selecting
    a different chord opens on Alternatives, an empty clip on Ideas; filling an empty
    clip (or Clear chord) keeps you on Ideas.
  - **Ideas are pages**, one per kind (Feel at home, Build tension, Flow smoothly, Add
    color), with ‹ › and the page names (Home · Tension · Flow · Color) underneath.
- **Type any chord** (`parse.ts`, `readChordInput`) is forgiving and shows how it reads
  the text while typing ("→ C#m7 (C# E G# B)", "Those notes make C", "bVII in C major
  is Bb"); Enter sets it. It reads chord names in any common spelling (CM7, CΔ, C^7,
  Cmin7, C-7, Cdom7, Cm7-5, C7(b9), C7+5, Cø, Co7, "c sharp minor 7", "E flat major",
  "C over E", alterations Tonal lacks like Cmaj7b5 or C7sus2), note lists ("C E G",
  "c-e-g", "ceg": every note tried as root, first note wins ties, typed order kept as
  the voicing), and roman numerals in the home ("IV", "ii7", "bVII", "V7/ii": plain
  numerals are degrees of the home scale, ♭/♯ ones are measured from the major scale).
  A slash always sets the bass, never an inversion. Typed chords and ideas are moved to
  the octave nearest the other chords (like dropped chords; `fitOctave`); the inversion
  you chose is kept.
- Notes lane (`NotesLane.tsx`, in the **Advanced** panel): a **display-only** piano roll on the
  track's time axis showing what the
  chords part plays for each clip (its voicing, plus a slash chord's low bass note when
  the Bass part is off; empty clips show nothing), out-of-key notes striped, lines from each note to the nearest note of
  the next chord. Individual notes are edited only in the inspector; the Advanced buttons
  adjust **whole chords**:
  - "Inversion ↓/↑" and "Octave ↓/↑" buttons (arrows with a shaft; keys ↓/↑ and Shift+↓/↑, `shiftOctave` = inversion ±
    note count) act on the selection, or every chord when nothing is selected; they
    move together (if any can't, none do). Clips have no buttons of their own.
  - "Smooth voicing" picks inversions so chords move least (`smoothVoicing`): the
    selection if 2+ clips are selected, else the whole track.
  - The lane fits the notes: 3 empty rows above the highest and below the lowest note.
    Rows keep a fixed height, so the lane grows and shrinks (one octave = compact,
    chords far apart = taller). Notes start after a small left gutter so they never
    cover the octave labels.
- **New chords land in the track's octave**: any chord added (dropped, typed, an idea, built
  on the keyboard) keeps its inversion and is shifted by whole octaves so its notes are
  centered nearest the average of all the other chords (`fitOctave`), in the drag preview
  too. With no other chords it centers around C4 (middle C), not C3.
  Existing chords are never re-voiced automatically (that's the Smooth voicing button).
- "Progressions" (`ProgressionMenu.tsx`, in the main toolbar): a dropdown with genre
  submenus (hover switches genre after a short delay; ←/→ between columns). ~180
  progressions (no two with the same chords in the same mood; a test enforces it),
  curated most common first within each genre (`progressions.ts`), genres and progressions ordered most common first.
  They arrive **an octave up** (around C4, root position; `progressionChords`); numerals relative to the major scale (♭VII etc.), shown in the current
  tonic, with the plain "feel" as a hover tooltip. Clicking one replaces the track and
  switches to its scale (one undo step); the playhead returns to the start and, if
  playing, playback continues from there (so progressions can be auditioned back to
  back; the seek happens when the new clips are scheduled); one chord per bar, repeated while it fits, or
  shared evenly on shorter tracks. ▶ previews without touching the track.
- **Rich dropdowns** (`useDropdown.ts`): custom popovers instead of native selects where
  options need descriptions (Scale, progressions). Click outside / Esc closes; ↑/↓
  move; the app's shortcuts ignore keys inside `.dropdown`.
- Clips show a fit tag ("borrowed", "→ Dm",
  "outside", "clash") when not plainly in key.

### Empty clips and ideas (`suggest.ts`)

- **Wording: users never see the word "clip".** In the UI (labels, tooltips, the how-to)
  it's always "chord"; an empty one is a "spot" ("Select a chord", "blank spot", "empty
  spot"). "Clip" is only our internal name in code and in this file.
- **+ New** (tinted button left of Undo, `addNextEmptyClip`) adds an empty spot in the
  first gap on the track, never longer than a bar even if the gap is bigger. With no gap
  it goes at the end, taking up to half of (and shortening) the last chord. It ignores
  the playhead on purpose (unexpected results). It's selected right away. **+ New
  session** shares the tint (`button.tinted`).
- **Double-click empty track space** to add an empty clip: the whole gap if it's a bar
  or less, else the part of the gap inside the clicked bar (`emptyClipSpan`). It's
  selected right away. Empty clips are dashed "?" clips: silent, resizable, movable,
  copyable, deletable; drop a chord on one to fill it.
- The panel for an empty clip shows **ideas for the spot** plus the "type any chord"
  box and the keyboard (click notes; two or more make the chord via `chordFromNotes`).
- `suggestForSpot` looks at the nearest chords before/after (empty clips skipped),
  whether it's the start or the end, and (at the end of a looping track) the chord the
  loop returns to. Four groups, up to 3 ideas each, never repeating a chord or the
  chords beside the spot, each with a plain reason and a numeral read in context:
  - **Feel at home**: the home chord (strongest after a V; "starting/ending at home"),
    and its relative major/minor as a softer landing (a deceptive cadence after the V).
  - **Build tension**: the V of the next chord (or of the loop's first chord, or home:
    a half cadence at the end), the diminished chord a half step below it, the tritone
    sub (7ths/9ths palette), the sus4 V. If the plain V is already beside the spot, its
    7th is offered (C _ F → C7).
  - **Flow smoothly**: key chords sharing the most notes with both neighbors
    (diminished chords ranked last, chords sharing nothing left out); IV/V/vi on an
    empty track.
  - **Add color**: Spice chords, the ones that pull into or share notes with the next
    chord first.
- Ideas use the palette size (Triads/7ths/9ths).

### Selection (`src/selection.ts`)

- Click: select one clip (opens the inspector and plays it). It does **not** move the
  playhead: opening a chord to work on it shouldn't jump the song.
- Shift+click: range from the anchor (last plain/⌘-clicked clip) to the clicked one.
- ⌘/Ctrl+click: toggle one clip. ⌘A/Ctrl+A: select all. Esc: deselect.
- Clicking anywhere non-interactive (anything but clips, palette chords, controls,
  the ruler) deselects. Ctrl+click's context menu is suppressed on clips.
- Delete/Backspace, or the × on any selected clip, removes all selected clips (× on
  an unselected clip removes just that one).

### Dragging (`useChordDrag` + `planDrop` / `planGroupDrop`)

One pointer-based drag system for palette chords and clips, with a **live preview**:
the track renders the planned result (other clips slide out of the way) before
release. The dragged chip shows a plain-words label ("Swap C ⇄ Am", "Move C after Am",
"Move 3 chords after F", "Add Em before G", "Replace F with Em", "No room here",
"Release to cancel"), and affected clips get tags: ⇄ swap, ← / → shift, ⇤ squeeze,
↻ replace (`dropChanges`, `describeDrop`).

Drop target is decided by the **pointer position** (zones are fractions of the clip's
width, independent of the grid):

- **Outer ~30% of a clip** (each side): before/after that clip.
  - Moving existing clip(s): a **reorder** (`reorderClips`): the spots they left close
    up, clips in between slide over, every clip keeps its length, nothing outside that
    range moves. E.g. 1 2 3 4, drag 1 to the end of 3 → 2 3 1 4; to the start of 2 →
    unchanged.
  - Palette chord: an insert that makes room (below).
- **Middle of a clip**: swap chords (moving one clip) or replace the chord (palette).
  Groups have no middle zone: left half = before, right half = after.
- **Empty space**: place at the pointer (minus where you grabbed it), snapped. This is
  how you deliberately leave a gap.
- **Groups** (dragging any clip of a multi-selection) move as one block in track order;
  scattered selections are gathered into one block. In empty space the block must fit
  at full length or the drop is invalid.
- **Making room** (`insertClip`, empty-space drops and palette edge drops): only clips
  to the right move, in this order: (1) pushed right using up gaps, keeping lengths;
  (2) the dropped clip shrinks to one grid step; (3) right-hand clips are squeezed,
  last first, to one grid step. Near the track end the dropped clip first slides left
  within its gap. If nothing works the drop is invalid (red track border) and does
  nothing.
- A new palette chord gets the length of the gap it lands in (max 1 bar), or 1 bar
  at a clip boundary with no gap.
- **Copy-drag** (Option on Mac, Ctrl on Windows, as in Ableton; `platform.ts`): the
  originals stay and copies drop like palette chords of the same length (edges insert
  and make room, the middle replaces the chord; a group is one block that must fit at
  full length). The modifier can be pressed or released mid-drag; the label says
  "Copy F after Am" and the ghost shows "+". The copies end up selected.
- **⌘ (Mac) / Alt (Windows)** while dragging, resizing or scrubbing ignores the grid
  (Ableton's keys; it used to be Alt everywhere). Esc cancels a drag.

### Resizing

Drag a clip's edge. Neighbors in the direction of travel are trimmed; once at minimum
length (1/32 note) they're pushed; nothing leaves the track. A whole resize drag is
one undo step.

### Grid, time signature, length

- Tempo (Options): typed freely; a value in range (30–300) applies as soon as it's
  complete (so typing 127 works), and on blur/Enter out-of-range values are clamped and
  unreadable ones restored.
- Grid: 1 bar, 1/2, 1/4, 1/8, 1/16, Off. "1 bar" = the current bar length. The grid
  **restarts at every bar line** (`snap(..., barTicks)`), so odd meters stay aligned;
  bar lines are always snap points. Grid Off draws beat lines dotted.
- Time signature: presets 4/4, 3/4, 2/4, 5/4, 6/8, 7/8, 9/8, 12/8, or Custom (beats
  1–16 / note value 2, 4, 8, 16, chosen from menus so half-typed values never apply).
  Changing it **rescales clips with the bars** (`rescaleClips`): one chord per bar stays
  one per bar. Part of undo.
- Length change trims/drops clips past the new end (`fitToLength`). Part of undo.

### Home (`home.ts`, `HomeMenu.tsx`, `HomeNotice.tsx`)

- One "Home" dropdown in the header: 12 key buttons over the moods (most common first:
  Major, Minor, Dorian, Mixolydian, Lydian, Phrygian, Locrian), each described in plain
  words (`MODE_INFO`). Picking a key keeps the menu open; picking a mood closes it.
- **Changing home only re-labels** (colors, numerals, fit); chords never change. Part of
  undo.
- Right after, a notice offers to move the chords, worded for what it does
  (`homeMove`): "Transpose chords to D major" (same mood), "Reshape chords for Dorian"
  (same key), "Move chords to D Dorian" (both). It uses `chordToKey`: chords all in the
  old key keep their scale degree (V stays V, Em in C major → E♭ in C minor; sizes,
  edits, inversion kept); others move by the tonic distance. One undo step. For
  relative homes (same notes, e.g. C major ↔ A minor) it says the chords still fit
  instead. The offer lasts while the chords are untouched; repeated home changes offer
  a move from the home the chords were written in. Not saved.
- **Home suggestion** (`suggestHome`): if the chords fit another home noticeably better
  (>5% more of the note-time in its scale), the trigger shows a dot and the menu offers
  "Your chords fit E major best · Use it" (a re-label). Equal fits (relative keys) never
  nag. `detectHome` scores fit, then the home chord's presence (first/last chord), then
  mood commonness.

### Transport, playhead, metronome

- Play/Pause (one button, Space) and Stop (Shift+Space, always enabled: returns the
  playhead to the start even when stopped). Play works on an empty track (metronome
  only), like a DAW.
- Loop toggle (L) loops the whole track. Play once ends at the end of the last clip,
  or the track end when empty (`playbackEnd`), then the playhead returns to the start.
- BPM changes and edits apply live while playing. Starting or seeking into the middle
  of a clip sounds that chord for its remaining length.
- Playhead: triangle in the ruler band plus a line through the track, always visible.
  Click/drag anywhere on the ruler to move it (only the triangle shows a pointer
  cursor). Clicking empty track space moves it there; clicking a clip doesn't move it. Snaps to the grid (free with grid Off or ⌘/Alt). ← / → move it one
  grid step when nothing is selected (`stepGrid`, never skips bar lines).
- Metronome (toggle + volume slider, M): clicks every beat of the time signature
  (quarters in x/4, eighths in x/8), accented on the 1; compound meters (6/8, 9/8,
  12/8, x/16 equivalents) also get a lighter accent every 3 beats; irregular meters
  (e.g. 7/8) accent only the downbeat (`metronomeClicks`).
- Metronome and the groove (below) are separate: the metronome is never in MIDI.

### Groove: chords, bass, drums (`GrooveMenu.tsx`, `grooves.ts`, `patterns.ts`, `sound.ts`)

- Three parts, like three DAW tracks: **Chords**, **Bass**, **Drums**. Each has on/off,
  volume and a pattern; chords and bass also pick a sound (synth presets, no samples:
  piano, electric piano, organ, soft synth, pad, pluck, bells, sine, square, saw,
  synth strings, supersaw, clav, mallets, harpsichord; round, sub, synth, pluck,
  electric, upright, reese, acid bass); chords also have brightness (low-pass cutoff).
  **Picking a chord sound resets brightness to that sound's best value**
  (`Instrument.brightness`). Plus **swing** (8th offbeats pushed late, up to triplet
  feel).
- **Groove presets** (64, most common first, from pop/rock/hip-hop/electronic through
  soul, jazz, blues, country, world, cinematic and classical) set every part's sound,
  pattern, on/off **and volume** (`mix`), plus swing and chord brightness: presets own
  the mix, like loading a DAW preset. Volume/brightness tweaks afterwards don't make it
  "Custom".
  Each also has a home genre and natural tempo range (metadata for future smart
  randomizing; `randomBpm` exists but is unused). The trigger
  shows the matching preset, or "Custom" once a part is changed (`matchingGroove`); no
  two presets may be identical. **Default: Pop** (all parts on); "Just chords" (held
  chords only) stays first in the list.
- **Random** (`pickRandom`): a die next to Progressions (random progression, never the
  same twice in a row) and next to Groove (random preset, not Just chords or the 3/4
  waltz). No "randomize everything" button: two dice are simple enough. Key, tempo
  and time signature are never randomized.
- The panel opens under the toolbar at full width: presets left, the three part rows
  right (native selects with the chosen option's description under them), swing and a
  Play button at the bottom. Space plays/pauses inside dropdowns and sliders.
- **Patterns are pure** (`renderTrack`): chord patterns (19: whole chord, once per
  bar, every beat, pulsing 8ths, driving 16ths, pop 3-3-2, ballad, strum, broken chord,
  arpeggios up/down/up-down/16ths, offbeat stabs, backbeat stabs, jazz comping, bossa,
  tresillo, funk) work on the clip's voicing; bass patterns (12, incl. walking bass that
  steps into the next chord, rolling offbeat, tresillo, gallop) play the chord's bass
  note (root or slash bass, never moved by inversions; `bassNoteFor`) in A1–G#2; drum patterns (20, incl. Motown, train beat, dembow,
  Afrobeats, 2-step garage, breakbeat, drum & bass, punk, jazz brushes) are 16-step
  strings per voice. Rhythms sit on the
  bar grid and restart at every bar line (cut short in 3/4, repeating in 5/4); chord
  and bass patterns always sound at a chord change (except offbeat stabs). Notes never
  leave their clip.
- **Levels are measured, not guessed.** Offline renders (Tone.Offline in headless
  Chrome, importing the app's own `makePoly`/`makeKit` and patterns from the dev
  server) of a test progression (Pop anthem in C, 120 BPM), metered with a K-weighted,
  gated loudness (LUFS-style); the matching measure is halfway between integrated
  loudness and the loudest 400 ms (fair to fading sounds like piano):
  - Instrument `trimDb`: every chord and bass sound playing held chords/notes matches
    the Soft synth (trims span about −7 to +12.5 dB; raw sounds differed by ~23 dB).
    `DRUM_TRIM_DB`: a pop beat matches too.
  - `KIT_LEVELS`: single-hit peaks relative to the kick: snare −1, rim −9, hats −10,
    ride −12, open hat −12.
  - Preset `mix`: each part at volume 1 is measured with the preset's sound/pattern/
    brightness/swing, then set so chords ≈ −18.5, drums ≈ −19.5, bass ≈ −20.5 (chords
    lead; ~−15 combined, limiter at −1 dBFS as a safety net). Parts that need more than
    1.0 are capped (all within 1 dB).
  - Slow-attack sounds (strings, pad) on short-note patterns barely sound (measured
    ~−30): don't pair them in presets.
  - **When adding a sound, drum voice or preset, measure it the same way** (rebuild the
    script if needed; it isn't in the repo) rather than eyeballing levels.
- **Every chord plays at the same loudness** regardless of note count: per-note
  velocity = accent × 1/√(notes struck together) (`chordVelocity`), with a limiter as
  a safety net. MIDI velocities use the accent only.
### Undo/redo (`src/history.ts`)

Buttons plus ⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Y). The undoable document is the **Track**:
clips, bars, key, scale, time signature (`src/track.ts`). Discrete edits use `commit`
(one step each); continuous drags use `beginGesture`/`updateGesture` (one step per
drag). No-op edits add no step. Max 500 steps (saved with the session). Grid, BPM, loop, 7ths, metronome,
selection and playhead are not part of history.

### Keyboard (`src/shortcuts.ts`)

Ignored while typing in inputs/selects; modifier combos not listed are left to the
browser.

| Keys | Action |
|---|---|
| Space · Shift+Space | Play/pause · stop |
| L · M | Loop · metronome on/off |
| ← / → | Previous/next clip (with a selection), else move playhead one grid step |
| ↑ / ↓ | Selected chords (or all) one inversion higher/lower |
| Shift+↑ / Shift+↓ | Selected chords (or all) an octave up/down |
| Delete/Backspace · Esc | Remove selected · deselect |
| ⌘A / Ctrl+A | Select all |
| ⌘Z · ⇧⌘Z / Ctrl+Y | Undo · redo |

The (i) tooltip next to the logo (`HelpTip.tsx`: how it works + every shortcut, shown on hover/focus) lists these; keep it in sync.

### Sessions (`src/session.ts`, `SessionMenu.tsx`)

- A session is the whole workspace: the Track with its undo history, BPM, groove,
  grid, loop, metronome, palette size, notes lane, the selection, the inspected clip,
  the details panel (open/collapsed, tab) (`SESSION_KEYS`), so it reopens exactly as it was left.
- You're always in one session and **every change is saved to it as you go**. The
  "Your sessions:" menu in the header shows its name ("Unsaved session" for the scratch
  session). **+ New session** (next to it, no confirm: everything is already saved)
  makes an empty "Untitled session" and opens it. On the unsaved session only, a name
  box at the top of the list names it as a new session (the unsaved one starts over
  empty). The list opens any session (newest created first, so rows never reorder, with "4 chords · C
  major · 3 min ago"), and duplicates (⧉: adds "<name> copy", stays on the current
  session, menu stays open), renames (✎) or deletes (×, with a confirm) them.
- Each session's values live under its own key prefix (`session:<id>:`); the unsaved
  session has no prefix, so work saved before sessions existed simply is the unsaved
  session. `App` keys the `Workspace` by session, so switching remounts it and
  everything loads from storage (the history flushes on unmount, playback stops). The
  list and current session are global (`sessions`, `currentSession`).

### Persistence (`src/persist.ts`)

Everything is saved to localStorage under `chords:v1:*` (per session, see above): the
Track **with its full undo/redo history** (debounced, and flushed on page hide, on
unmount and on demand), BPM, grid, loop, palette size, notes-lane toggle, metronome
on/off and volume, the selection, panels, and the groove settings
(`groove2`: renamed after the level pass, so old, now-unbalanced volumes are dropped). Loaded data is validated (`isTrack`, type checks; note
names via `isNoteName`, since Tonal returns NaN, not undefined, for nonsense);
invalid or corrupt data falls back to defaults, and storage errors are ignored. On
shape changes, **migrate old data on load** so saved work survives (`migrateTrack`
turns old `symbol: "Dm7"` clips into chords, across the whole undo history); bump
`VERSION` in `persist.ts` only for changes that can't be migrated. Palette size
(`flavor`, seeded from the old `sevenths` setting) is saved too. Old chords have no
`bass`, so they read as their root (inverted chords once named "F/C" are now plain F,
as intended). Playhead and play state are not saved.

### Export

Download MIDI (`midi.ts`, `MidiMenu.tsx`) renders with `renderTrack`, so the MIDI is
exactly what you hear (patterns, swing, voicings), with tempo and time signature. It's
a menu: all parts that are on (one file, a track each, which Ableton splits into
tracks; drums on channel 10 with General MIDI notes) or one part alone.

## Visual design

- Dark UI. Layout top to bottom: header (the piano icon + "create a chord progression" in the
  normal font, an (i) help tooltip headed "chords are fun"; right: "Your sessions:" menu, + New
  session, a subtle Download MIDI) → **main toolbar** (dashed line above, solid below: Progressions
  + die and Groove + die on the left, spaced apart; metronome + volume on the right; fixed-width
  dropdowns, long text truncates) → home notice (after a home change) → **the timeline** (no panel around it, full width) →
  two panels (`Panel.tsx`):
  - The toolbar's right side: metronome + volume, then **Config:**, a dropdown (`ConfigMenu.tsx`)
    showing "C major · 120 BPM · 4/4" and listing one setting per row, labels left, controls
    lined up right: Song (Home; its picker opens over the list) and Timing (Tempo, Time,
    Length, Grid).
  - Timeline: icon-only side buttons (tooltips say what they do; no text) stretched to exactly the
    timeline's height: Play/Pause, Stop, Loop on the left; + New (new chord), Undo, Redo on the right.
  - **More** (collapsible, closed by default, saved per session as `moreOpen`): a row with the
    notes-lane legend on the left and Inversion ↓/↑, Octave ↓/↑ and Smooth voicing on the right
    (unusable until expanded; the ↑/↓ shortcuts still work), then the notes lane, lined up with the
    timeline above (`--side` columns).
  - **Chord details** (`DismissPanel`): not collapsible; it appears when one chord is selected or
    stepped to, and goes away with the X at its top right (or when several chords are selected,
    or none). Selecting a chord again brings it back.
  The playhead CSS variable lives on the `.panels` wrapper (`data-playhead-scope`), so the
  timeline and the notes lane share one playhead.
- There is no Clear button: start over with + New session.
- **Chord color = scale degree of the root** (hue = degree × 360/7), identical in
  palette, clips, lane and progression menu, so Dm, Dm7 and D (V/V) in C share the "2" color; how
  far a chord strays is shown by its fit tag, not its color. Roots outside the key are
  gray.
- Fit colors: green in key, blue common move (borrowed/leading), orange outside;
  tension yellow (some bite) / red (clashing).
- Clips are drawn 2px inside their real start/end (`CLIP_GAP_PX` in `Timeline.tsx`), so neighbors and the
  track edge never touch; this is visual only, the times are unchanged.
- Clips show chord name, roman numeral, and notes; narrow clips hide details via
  container queries.
- On/off settings (Loop, 7ths, Metronome) are toggle buttons that light up, not
  checkboxes. Avoid explanatory text that isn't needed; prefer showing state.

## Design decisions (and why)

These were discussed and chosen deliberately; don't "fix" them without asking.

- **Moving a clip onto another clip's edge reorders** (closes the gap it left) rather
  than pushing and leaving a hole: one predictable rule, lengths never change. Leaving
  a gap is done by dropping into empty space.
- **Resizing trims neighbors** (then pushes) instead of overwriting them like Ableton:
  nothing is destroyed by a resize.
- **Groups have no swap zone**, and scattered selections are gathered into a block:
  swapping is one-to-one, and keeping scattered spacing would fight the no-overlap rule.
- **Time signature changes rescale clips** rather than cutting the track.
- **BPM is quarter-note based** in every meter (DAW standard), so 6/8 at 120 clicks
  eighths at 240/min.
- **Grid Off is kept**: drop zones don't depend on the grid, so it adds no edge cases.
- **Inverting never makes a slash chord.** Inversion = the chord's shape (voicing), the
  bass note = a separate, deliberate choice in the inspector. The owner asked for this:
  smooth voicing used to rename chords "F/C", "G/B" and move the bass line. With the
  Bass part off, the chords part plays a slash chord's bass itself (one low note), so
  slash chords are audible in "Just chords" too, while plain chords sound unchanged.
- **Ableton's drag modifiers** (copy: Option/Ctrl; ignore grid: ⌘/Alt) rather than
  our own; on Mac this moved "ignore grid" from Alt to ⌘.
- **The details panel never closes by itself** (only its X, or a multi-selection, hides it), chords and empty clips share one layout, the keyboard is anchored above
  the (variable) description, and the panel has a fixed height with paged ideas, so
  adding or switching clips never makes it jump.
- **Ideas are clicked in, not dragged**: an empty clip's target is obvious, and the
  inspector keeps showing ideas so trying several is one click each (undo restores).
- **Sessions autosave; naming is optional**, like a DAW project that never loses
  work. New session never asks "are you sure", and there's no Clear button: a new
  session is the way to start over.
- **Home is context, not content.** Changing home re-labels; moving chords is an
  explicit, offered action. (Earlier, key changes rewrote the chords, which made
  C major → A minor turn C into Am despite identical notes.) Home and time signature
  are part of undo.
- **Borrowing happens chord by chord** (Spice row, inspector), never by changing home.
- **Chords are descriptions, not note lists**: keeps names readable, lets key changes
  keep roles, makes every edit one clear change. Note edits are pitch-class based; a
  name can't capture every voicing (Cadd9 with the D moved down still reads "Cadd9").
- **Config menu** (`ConfigMenu.tsx`; `OptionsMenu.tsx` has the tempo/time/length/grid fields,
  `HomeMenu.tsx` Home): defaults suit most sketching, so these live in one dropdown, out of the
  way; the things used constantly (Progressions, Groove, metronome) stay in the toolbar.
- **Timeline buttons are icons only** (tooltips explain them), so the side columns stay narrow.
- **Custom dropdowns only where native selects can't show enough** (descriptions,
  submenus); simple value pickers (Key, Length, Grid) stay native.
- **The palette stays 7 chords**; extensions, sus, altered etc. are variations in the
  inspector so the palette stays readable.
- **Loading a progression switches the scale** to the progression's, so its chords
  read as in key rather than all borrowed.

## Planned / possible next

- Nudging selected clips with the keyboard; ⌘D duplicate.
- Hearing an idea in context (previous → idea → next) before using it.
- Octave-specific note edits in the notes lane (e.g. doubling the bass), open/spread
  voicings. Sampled instruments (real piano) if the synth presets aren't enough.
- Per-clip pattern overrides, drum fills, more drum kits, humanize (timing/velocity).
- Browser (Playwright) tests for drag/playhead flows once the UI settles.

## Tech stack

- Vite + React 19 + TypeScript, Vitest (tests), oxlint (lint).
- `tonal`: theory (keys, modes, chords, notes).
- `tone`: audio via `Tone.getTransport()` (PolySynth for chords, a separate synth for
  the metronome).
- `@tonejs/midi`: MIDI export.

## Architecture

Logic lives in **pure, tested modules**; React components and `audio.ts` only wire
them up.

- `src/music/` (framework-free)
  - `timeline.ts`: track model and **all editing rules** as pure functions
    `(clips, ...) => clips`: resize, insert, reorder, drop planning (single and group),
    add/replace/remove, fit/rescale; time signatures (`sigBarTicks`, `sigBeatTicks`),
    grids (`gridStep`, `snap`, `stepGrid`), `playbackEnd`, `metronomeClicks`.
    Clips treat their chord as opaque; `planGroupDrop` is an internal helper of `planDrop`.
  - `chord.ts`: the chord model: types, names, notes, voicing/inversions, slash bass
    (`withBass`, `bassNote`, `soundingNotes`), note toggling (`fromIntervals` canonicalizes).
  - `parse.ts`: reading typed chords: names (`parseChord`), note lists
    (`chordFromNotes`), roman numerals (`parseNumeral`), all via `readChordInput`.
  - `suggest.ts`: ideas for a spot in the progression (`suggestForSpot`).
  - `theory.ts`: scales/modes (`MODE_INFO`), diatonic chords per palette size,
    `romanNumeral`, `rootDegree`, `chordToKey`, `stackChord` (chords from any scale).
  - `home.ts`: Home: what a home change means (`homeMove`, `sameNotes`), detection
    (`detectHome`, `suggestHome`), and the Spice row (`spiceChords`).
  - `analysis.ts`: fit to the key (diatonic / borrowed / secondary dominant / passing
    diminished / tritone sub / outside) and tension, in plain words.
  - `voicing.ts`: `smoothVoicing` (voice leading via inversions), `fitOctave`.
  - `flavors.ts`: Alternatives, grouped by fit and ordered most expected first.
  - `progressions.ts`: the progression library (genres) and its layout on a track.
  - `audio.ts`: Tone.js playback of the three parts (synths, drum kit, per-part
    volume, limiter), seeking, metronome. The only module touching Web Audio.
  - `patterns.ts`: chord/bass/drum patterns and `renderTrack` (all notes played), pure.
  - `grooves.ts`: groove settings, presets, matching, validation.
  - `sound.ts`: instrument presets (Tone options as data), brightness → cutoff, levels.
  - `midi.ts`: MIDI export of any parts, from `renderTrack`.
- `src/track.ts`: the `Track` document type, defaults, validation and migration of stored data.
- `src/history.ts`: undo/redo (pure transitions + `useHistory`, optionally persisted).
- `src/persist.ts`: localStorage helpers + `usePersistentState`, `copyKeys`/`removeKeys`.
- `src/session.ts`: sessions (keys, list, save as, summaries; `useSessions`).
- `src/platform.ts`: Mac vs Windows drag modifiers (`copyKey`, `freeKey`).
- `src/selection.ts`: selection rules (`clickSelect`, `selectAll`, `pruneSelection`).
- `src/shortcuts.ts`: key → action (`shortcutFor`); App executes actions.
- `src/dropLabel.ts`: drag preview label (`describeDrop`, `heldName`).
- `src/components/`
  - `Timeline.tsx`: ruler + playhead, track, clips, resize handles, drag preview tags.
    Converts pointer positions to ticks; holds no editing rules.
  - `Palette.tsx`: palette chords (pointer down starts a click-or-drag).
  - `useChordDrag.ts`: shared pointer drag (click vs drag threshold, Esc cancel,
    click modifiers).
  - `TimeSignatureControl.tsx`: preset menu + Custom pickers.
  - `ChordInspector.tsx`, `NotesLane.tsx`, `ProgressionMenu.tsx`, `HomeMenu.tsx`,
    `HomeNotice.tsx`, `Palette.tsx` (+ `SpiceRow`), `SessionMenu.tsx`,
    `GrooveMenu.tsx`, `MidiMenu.tsx` (+ `useDropdown.ts`): see Behavior.
    The lane renders inside `Timeline` and follows the playhead via the `--playhead`
    CSS variable set on `.timeline`.
- `src/App.tsx`: `App` (the sessions shell) and `Workspace` (state: track history,
  settings, selection, play state, playhead; wiring and layout), keyed by session. Drag previews are `planDrop(...)` rendered in place of the clips.

## Conventions

- Run `npm test`, `npm run build` (includes typecheck), and `npm run lint` before
  calling work done.
- Any rule change gets a test next to its module (`*.test.ts`). `timeline.test.ts`
  checks invariants for **every** custom time signature; keep it passing when touching
  meters, snapping, or rescaling.
- Asset paths are relative (`base: './'` in `vite.config.ts`) so the build works on
  any static host; don't add absolute `/` asset URLs.
- Audio must be started from a user gesture (`Tone.start()` / `ensureAudio()`).
- Match existing code style: small pure functions with doc comments explaining *why*,
  no editing logic in components.

## Verifying

- Unit tests cover the rules; they can't see layout or hear audio.
- For UI: run the dev server and drive the installed Chrome headlessly, e.g.
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new
  --screenshot=out.png --window-size=1280,800 http://localhost:5173/`, or a
  `playwright-core` script (no browser download; `executablePath` = that Chrome) for
  clicks, drags, and keys. Use a scratch directory for these, not the repo. Wait for
  `.palette .chord` before interacting. To screenshot a populated track, seed it
  temporarily (e.g. edit `DEFAULT_TRACK`) and revert.
- Audio (timing, sound, metronome feel) can't be verified by an agent; say so and ask
  the owner to listen.
