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

The feel is **a single DAW track** (Ableton-like): clips, a grid, a playhead, a
transport, keyboard shortcuts, multi-select. Where there's a DAW convention, follow it
unless it conflicts with the fixed-length model below.

Static site only: no backend, no accounts. State is saved in the browser's
localStorage. Hosted on GitHub Pages via `.github/workflows/deploy.yml` (tests, builds,
deploys on push to `main`).

## Working with the owner

- The owner is a fullstack (React) developer and long-time Ableton/keyboard producer
  with little formal theory. Explain things with DAW analogies, not theory jargon.
- They describe what they want and explicitly invite pushback: give an honest opinion,
  propose a simpler/more consistent model when there is one, then build it and say
  clearly where you deviated from their ask.
- Intuitive and predictable beats clever. Prefer one consistent rule over several
  position-dependent behaviors, and make every drag/edit explain its result before it
  happens.
- Verify UI changes in a real browser before calling them done (see Verifying).

## Core model: the workspace

- **One workspace**: a single horizontal track = one chord progression.
- **Fixed length** in bars of a chosen time signature (1, 2, 4 or 8 bars). Playback
  time depends only on bars, time signature and BPM, **never on how many chords there
  are**. Adding chords subdivides the same span; it never makes the track longer.
- Each chord is a **clip** (`{ id, symbol, start, length }`). Clips never overlap and
  never extend past the track. Gaps (silence) are allowed.
- Times are integer **ticks**, `TICKS_PER_BEAT = 480` per **quarter note** (MIDI PPQ),
  to avoid float drift and map straight to MIDI. BPM is always quarter notes per minute.

## Behavior

### Adding chords (palette)

- The palette shows the 7 diatonic chords of the current key/scale (triads, or 7ths
  when the 7ths toggle is on), each with its number (1–7), chord name, roman numeral,
  and notes.
- Click (or press 1–7) with nothing selected: fill the first gap of at least a quarter
  note (or one bar, in meters whose bar is shorter) with up to 1 bar; if the track is
  full, split the longest clip in half.
- With clips selected, click / 1–7 **replaces all selected chords** (the hint above
  the palette turns blue: "Click a chord to replace …").
- Drag a palette chord onto the track (see Dragging).

### Selection (`src/selection.ts`)

- Click: select one clip (also moves the playhead to its start and plays it).
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
- Alt while dragging ignores the grid. Esc cancels a drag.

### Resizing

Drag a clip's edge. Neighbors in the direction of travel are trimmed; once at minimum
length (1/32 note) they're pushed; nothing leaves the track. A whole resize drag is
one undo step.

### Grid, time signature, length

- Grid: 1 bar, 1/2, 1/4, 1/8, 1/16, Off. "1 bar" = the current bar length. The grid
  **restarts at every bar line** (`snap(..., barTicks)`), so odd meters stay aligned;
  bar lines are always snap points. Grid Off draws beat lines dotted.
- Time signature: presets 4/4, 3/4, 2/4, 5/4, 6/8, 7/8, 9/8, 12/8, or Custom (beats
  1–16 / note value 2, 4, 8, 16, chosen from menus so half-typed values never apply).
  Changing it **rescales clips with the bars** (`rescaleClips`): one chord per bar stays
  one per bar. Part of undo.
- Length change trims/drops clips past the new end (`fitToLength`). Part of undo.

### Key and scale

- Key + scale (modes, shown as "Major (Ionian)", "Minor (Aeolian)", …) define the
  palette.
- Changing them **moves the clips** (`chordToKey`): diatonic chords keep their scale
  degree (V stays V, same color, triad/7th preserved); non-diatonic chords are
  transposed by the tonic distance. Part of undo.

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
  cursor). Clicking empty track space moves it there; a plain click on a clip moves it
  to the clip's start. Snaps to the grid (free with grid Off or Alt). ← / → move it one
  grid step when nothing is selected (`stepGrid`, never skips bar lines).
- Metronome (toggle + volume slider, M): clicks every beat of the time signature
  (quarters in x/4, eighths in x/8), accented on the 1; compound meters (6/8, 9/8,
  12/8, x/16 equivalents) also get a lighter accent every 3 beats; irregular meters
  (e.g. 7/8) accent only the downbeat (`metronomeClicks`).

### Undo/redo (`src/history.ts`)

Buttons plus ⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Y). The undoable document is the **Track**:
clips, bars, key, scale, time signature (`src/track.ts`). Discrete edits use `commit`
(one step each); continuous drags use `beginGesture`/`updateGesture` (one step per
drag). No-op edits add no step. Max 100 steps. Grid, BPM, loop, 7ths, metronome,
selection and playhead are not part of history.

### Keyboard (`src/shortcuts.ts`)

Ignored while typing in inputs/selects; modifier combos not listed are left to the
browser.

| Keys | Action |
|---|---|
| Space · Shift+Space | Play/pause · stop |
| L · M | Loop · metronome on/off |
| 1–7 | Add that palette chord (replaces selected clips) |
| ← / → | Previous/next clip (with a selection), else move playhead one grid step |
| Delete/Backspace · Esc | Remove selected · deselect |
| ⌘A / Ctrl+A | Select all |
| ⌘Z · ⇧⌘Z / Ctrl+Y | Undo · redo |

The in-app "Shortcuts & tips" panel (footer, collapsed) lists these; keep it in sync.

### Persistence (`src/persist.ts`)

Everything is saved to localStorage under `chords:v1:*`: the Track **with its full
undo/redo history** (debounced, and flushed on page hide), BPM, grid, loop, 7ths,
metronome on/off and volume. Loaded data is validated (`isTrack`, type checks);
invalid or corrupt data falls back to defaults, and storage errors are ignored. Bump
`VERSION` in `persist.ts` on incompatible shape changes. Selection, playhead and play
state are not saved.

### Export

Download MIDI (`midi.ts`): one track, chords in the same voicings as playback, with
tempo and time signature.

## Visual design

- Dark UI. Layout top to bottom: header (title; Key, Scale, 7ths) → palette hint +
  palette (7 equal columns, same width as the track) → toolbar (Play, Stop, Loop,
  Metronome + volume, BPM | Time, Length, Grid | Undo, Redo) → ruler + track → footer
  ("Shortcuts & tips" disclosure | Clear, Download MIDI as the one primary button).
- **Chord color = scale degree** (hue = degree × 360/7), identical in palette and
  clips, so repeated chords are easy to spot and colors survive key changes.
  Non-diatonic chords are gray.
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
- Key and time signature are part of undo because changing them rewrites the clips.

## Planned / possible next

- Click a clip and quickly try alternative chords that still fit the key
  (substitutions, borrowed chords, "what usually comes next" hints).
- **Key auto-detection** from the chords in the track, with manual override.
- Duplicating clips; nudging selected clips with the keyboard.
- Better voicings (voice leading via Tonal's `Voicing`), inversions, sampled piano.
- Visual aids for non-theory users (e.g. mini keyboard showing a chord's notes).
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
  - `theory.ts`: diatonic chords, roman numerals, `chordInKey`, `chordToKey`, voicings.
  - `audio.ts`: Tone.js playback, seeking, metronome. The only module touching Web Audio.
  - `midi.ts`: MIDI export.
- `src/track.ts`: the `Track` document type, defaults, validation of stored data.
- `src/history.ts`: undo/redo (pure transitions + `useHistory`, optionally persisted).
- `src/persist.ts`: localStorage helpers + `usePersistentState`.
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
- `src/App.tsx`: state (track history, settings, selection, play state, playhead),
  wiring, and layout. Drag previews are `planDrop(...)` rendered in place of the clips.

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
