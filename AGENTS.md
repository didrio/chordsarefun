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

It's also a **brainstorming tool**: guided by default (ideas for each spot, progression library,
variations that fit the key), free when you want (any chord, any note, inversions).
Going outside the key is information, never an error: the app says what a chord is
and how it's used, in plain words.

The feel is **a single DAW track** (Ableton-like): clips, a grid, a playhead, a
transport, keyboard shortcuts, multi-select. Where there's a DAW convention, follow it
unless it conflicts with the fixed-length model below.

Static site only: no backend, no accounts. State is saved in the browser's
localStorage, as sessions (see Sessions). Hosted on Cloudflare (Workers static assets:
`wrangler.jsonc` serves `dist`; Workers Builds runs `npm run build` then `npx wrangler deploy`
on every push to `main`). GitHub Actions only checks: `.github/workflows/ci.yml` runs
`npm run check` on pushes to `main` and on pull requests. (GitHub Pages was never enabled;
its deploy job was removed.)

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

## How work flows: tickets and sessions

Work is planned in **`TICKETS.md`**, an ordered, living backlog (T1, T2, …), and done **one ticket per session**:

1. **`/start T5`** (or `/start` to get a recommendation): read `TICKETS.md`, then only the files the ticket
   points to, and work toward its **Done when** checklist.
2. **`/ticket …`** at any point captures new ideas or scope creep as tickets instead of growing the current one.
3. **`/wrap`**: `npm run check`, a quick look at changed UI, `AGENTS.md` kept current, `TICKETS.md` updated
   (outcomes, handoff notes, new tickets, the **Next:** pick with recommended model, effort and plan mode), then
   commit and push. **Pushing `main` deploys the live site**; the owner typing `/wrap` is the go-ahead for that.
   The owner then runs `/clear` and starts the next session.

Whoever wraps a session has the most context, so they write the handoff. That keeps every new session small,
focused and cheap. The playbooks are plain Markdown in `.claude/skills/<name>/SKILL.md` (`start`, `wrap`,
`ticket`): without slash commands, follow them when asked to start or wrap. Keep the owner oriented throughout:
say what's done, and suggest the next step or command.

## The paradigm: Home, palette, chord

Everything is organized around one **Home** (key + mood), in three layers:

- **Song**: Home and Groove, the context everything is measured against.
- **Palette**: chord options around home (the inspector's Ideas and Flavors, the
  progression library).
- **Chord**: one chord up close (the inspector).

**Home is context, not content: nothing on the track changes unless you ask.** Every
chord anywhere (track, ideas, flavors, inspector, progression menu) uses the same
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
  removed**: the inspector's Ideas and Flavors tabs cover chord ideas now. The 1–7
  shortcuts went with them. Chords get on the track via Progressions, double-click
  empty clips + Ideas / typing a chord in the inspector, copy-drag of clips and ⌘D.
  The palette's code (`Palette.tsx`, `SpiceRow`, `diatonicChords`, `addChord`/`dropChord`,
  its CSS) was deleted in T4; it's in git history before that commit if it's ever wanted.
  `spiceChords` stays: it feeds the "Add color" ideas.
- Ideas use triads (the size toggle is gone; `flavor` is a constant in `App.tsx`).
- Previews of a **new** chord (an idea, a typed chord, a picked root) are played in the octave
  it would be placed in (`fitOctave`: nearest the chords on the track, around C4 on an empty
  track), so you hear it in the register you're working in. Chords already on the track
  (clicking them, ▶, flavor/bass/inversion edits) play their real voicing.
- Previews (clicking a chord anywhere) play it as the track would: the chord on the
  chord instrument plus its bass note on the bass instrument when the Bass part is on.
- **Every preview replaces the one still running** (a chord preview cuts off the rest of a
  progression or in-place preview: `previewChord` calls `stopPreview`), and pressing Play
  stops a running preview so it never plays over the track.
- The drop rules (`planDrop`) still accept a *new* chord dragged in (`held.existing`
  false: insert or replace), but nothing in the UI starts one since the palette went.

### Chord inspector, notes lane, progressions

- The **details panel** under the track (like Ableton's detail view) is dismissable, not
  collapsible: an X at its top right closes it. It shows the **inspected clip**: the last
  clip selected on its own. Selecting a clip, adding one (double-click, + New, copy)
  or stepping with ←/→ switches it and shows the panel; clicking elsewhere or Esc only
  deselects (so nothing jumps). Selecting several clips (or none) hides it entirely; the
  group voicing buttons are in Voicing. The inspected clip gets a dashed outline on the track
  while it isn't selected.
- **While no chord's details are open** (and the track has chords), a dashed one-line hint
  sits where the panel would be (`p.details-hint` in `App.tsx`): "Click a chord to hear it and
  see ideas for that spot" ("Tap" on touch screens, `TAP` in `platform.ts`), or, with several
  chords selected, what a selection can do (drag, copy-drag, duplicate, inversion, delete). An
  empty track shows nothing there: the track itself says where to start.
- Inspector (`ChordInspector.tsx`): **one layout for chords and empty clips**: a header
  strip, then three tabs. The panel is **always the same height** (25rem on desktop):
  the tab content scrolls inside it.
  - **Header** (always visible): ▶, name ("Pick a chord" for an empty one), roman, notes
    (+ "bass E"), and **one line** under the name: the fit badge, a tension badge only
    when it bites, and the plain explanation (`analysis.fit.detail`, truncated, full text
    on hover and in Notes); for an empty clip, where it sits ("After F, at the end…").
    On the right: **Type a chord** (its reading shows in a popover under the box, so the
    header never changes height), a quiet red **Clear** (the clip becomes empty, in
    place) and the X.
  - Tabs, in this order: **Ideas for this spot** (the songwriter's question, so first) |
    **Flavors of {root}** (disabled on an empty clip: no root yet) | **Notes and bass**.
    The spot's context ("Between C and Am.") sits at the right end of the tab bar.
  - **The tab is sticky**: it stays on whatever you used last (saved per session, default
    Ideas), like a DAW's device view. An empty clip on Flavors shows Ideas; Clear chord
    on Flavors switches the saved tab to Ideas.
  - **Ideas**: all four kinds side by side (Feel at home, Build tension, Flow smoothly,
    Add color; two columns under 900px), each with its short hint and up to 3 cards (name,
    numeral, plain why). A kind with nothing to offer keeps its column ("Nothing obvious
    here."), so the layout never shifts.
  - **Flavors**: other chords on the same root, under three fit headings (In key ·
    Common moves · Outside the key, with the fit dot). Each card shows the name and its
    **feel** in plain words (`ChordType.feel`: "Soft and dreamy"). Within each group the
    most expected come first (`flavors.ts`); the first 6 per group show (plus the current
    flavor wherever it ranks), "Show all N" reveals the rest.
  - **Hear it in place** (T2): every idea and flavor card has a small ▶ in its top-right
    corner (inside the card's padding, so cards keep their size; muted until the card is
    hovered, its own tab stop). It plays the chord before the spot, the card's chord, then
    the chord after (`inContext` in `suggest.ts`: empty spots skipped, nothing before at the
    start, the loop's first chord after the end of a looping track), without touching the
    track. Each chord sounds as long as in a progression preview (a bar, at most 1.5 s);
    ideas play in the track's octave (`fitOctave`), flavors in the clip's own voicing. Like
    other previews it does nothing while the track plays. The tooltip spells the sequence
    out ("Hear it in place: C → G → Am"). Clicking the card itself still uses the chord.
  - **Notes and bass**: left, the Root picker (for an empty clip it sets a major chord)
    and the one-octave keyboard (lit = in the chord; note names outside the key in
    yellow, as a yellow pill on lit keys; each lit note's role (R, 3, b7…) small and
    gray above its name; click to add/remove, min 2 notes; on an empty clip, two clicked
    notes make the chord) with a one-line legend. Right, for chords: the **Inversion** row
    ("1st inversion (E on the bottom)", Lower/Higher; "the bass note stays C" is in the
    tooltips), the **Bass note** row (chord tones as buttons, root first, plus "Other
    note…"; the slash-chord explanation shows only when a slash bass is set), and **Why
    it sounds like this**: fit badge, explanation, theory term, out-of-key notes, tension.
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
- Notes lane (`NotesLane.tsx`, in the **Voicing** panel): a **display-only** piano roll on the
  track's time axis showing what the
  chords part plays for each clip (its voicing, plus a slash chord's low bass note when
  the Bass part is off; empty clips show nothing), out-of-key notes striped, lines from each note to the nearest note of
  the next chord. Individual notes are edited only in the inspector; the Voicing buttons
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
- "Progressions" (`ProgressionMenu.tsx`, on the right of the main toolbar; its panel hangs from the toolbar's right edge, like Groove's, so it stays on screen at every width): a dropdown with genre
  submenus (hover switches genre after a short delay; ←/→ between columns). ~180
  progressions (no two with the same chords in the same mood; a test enforces it),
  curated most common first within each genre (`progressions.ts`), genres and progressions ordered most common first.
  They arrive **an octave up** (around C4, root position; `progressionChords`); numerals relative to the major scale (♭VII etc.), shown in the current
  tonic. Each row reads plain words first: name, chords, then its "feel" ("Sweet '50s nostalgia");
  the numerals and scale sit quietly at the right of the name. The list scrolls (a genre has up
  to ~30): it's cut mid-row and fades out at the bottom so that's visible without a scrollbar.
  Clicking one replaces the track and
  switches to its scale (one undo step); the playhead returns to the start and, if
  playing, playback continues from there (so progressions can be auditioned back to
  back; the seek happens when the new clips are scheduled); one chord per bar, repeated while it fits, or
  shared evenly on shorter tracks. ▶ previews without touching the track.
- **Rich dropdowns** (`useDropdown.ts`): custom popovers instead of native selects where
  options need descriptions (Key, progressions, sessions, time/length/grid). Click outside / Esc closes; ↑/↓
  move; the app's shortcuts ignore keys inside `.dropdown`.
- Clips show a fit tag ("borrowed", "→ Dm",
  "outside", "clash") when not plainly in key.

### Empty clips and ideas (`suggest.ts`)

- **Wording: users never see the word "clip".** In the UI (labels, tooltips, the how-to)
  it's always "chord"; an empty one is a "spot" ("Pick a chord", "blank spot", "empty
  spot"). "Clip" is only our internal name in code and in this file.
- **+ New** (tinted + button above Undo, right of the track; also "Add a chord" on an
  empty track; `addNextEmptyClip`) adds an empty spot in the
  first gap on the track, never longer than a bar even if the gap is bigger. With no gap
  it goes at the end, taking up to half of (and shortening) the last chord. It ignores
  the playhead on purpose (unexpected results). It's selected right away. **+ New
  session** (in the sessions window) shares the tint (`button.tinted`).
- **An empty track says where to start**: "Start your progression" with **Start from a
  progression** (the one accent button; opens the Progressions menu through its
  `ProgressionMenuHandle`) and **Add a chord** (+ New), plus "or double-click anywhere on
  the track". The buttons are passed into `Timeline` as `emptyState` and don't seek or
  add a spot when clicked. While the track is empty the Progressions trigger is
  highlighted too.
- **Double-click empty track space** to add an empty clip: the whole gap if it's a bar
  or less, else the part of the gap inside the clicked bar (`emptyClipSpan`). It's
  selected right away. Empty clips are dashed "?" clips: silent, resizable, movable,
  copyable, deletable; drop a chord on one to fill it.
- The panel for an empty clip shows **ideas for the spot** (Ideas tab) plus the "type a
  chord" box, and the keyboard in Notes (click notes; two or more make the chord via
  `chordFromNotes`).
- `suggestForSpot` looks at the nearest chords before/after (empty clips skipped),
  whether it's the start or the end, and (at the end of a looping track) the chord the
  loop returns to. Four groups, up to 3 ideas each, never repeating a chord or the
  chords beside the spot, each with a plain reason and a numeral read in context:
  - **Feel at home**: the home chord (strongest after a V; "starting/ending at home"),
    and its relative major/minor as a softer landing (a deceptive cadence after the V).
  - **Build tension**: the V of the next chord (or of the loop's first chord, or home:
    a half cadence at the end), the diminished chord a half step below it, the tritone
    sub (7ths/9ths ideas only), the sus4 V. If the plain V is already beside the spot, its
    7th is offered (C _ F → C7).
  - **Flow smoothly**: key chords sharing the most notes with both neighbors
    (diminished chords ranked last, chords sharing nothing left out); IV/V/vi on an
    empty track.
  - **Add color**: Spice chords (`spiceChords`), the ones that pull into or share notes
    with the next chord first.

### Selection (`src/selection.ts`)

- Click: select one clip (opens the inspector and plays it). It does **not** move the
  playhead: opening a chord to work on it shouldn't jump the song.
- Shift+click: range from the anchor (last plain/⌘-clicked clip) to the clicked one.
- ⌘/Ctrl+click: toggle one clip. ⌘A/Ctrl+A: select all. Esc: deselect.
- Clicking anywhere non-interactive (anything but clips, controls, panels, the ruler)
  deselects. Ctrl+click's context menu is suppressed on clips.
- Delete/Backspace, or the × on any selected clip, removes all selected clips (× on
  an unselected clip removes just that one).

### Dragging (`useChordDrag` + `planDrop` / `planGroupDrop`)

One pointer-based drag system for clips (the rules also handle a new chord dragged in,
called "palette chord" below, though nothing in the UI starts one now), with a **live preview**:
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

### Duplicate and nudge from the keyboard (T3)

- **⌘D / Ctrl+D** duplicates the selection (`planDuplicate`): exactly a copy-drag dropped
  on the right edge of the last selected chord. One chord inserts right after itself and
  makes room (`insertClip`: push into gaps, then shrink the copy to a grid step, then
  squeeze the right-hand chords), so on a full track the copy is short; several chords are
  copied as one block after the last of them and must fit at full length. No room: nothing
  happens. The copies end up selected (one copy: inspected). One undo step. The browser's
  bookmark shortcut is prevented.
- **⌥←/→ (Mac) / Ctrl+←/→ (Windows/Linux)** nudges the selection (`nudgeClips`): all
  selected chords move together, keeping their spacing, by one grid step measured from the
  first of them (to the previous/next grid point, bar lines included, like `stepGrid`; one
  beat with the grid off). Into empty space only: if any would overlap a chord that isn't
  moving or leave the track, nothing happens; nothing is pushed. One undo step per press.
  Not Alt on Windows (Alt+← is the browser's Back) nor ⌘ on a Mac (⌘← is Back too):
  `nudgeKey` in `platform.ts`.
- `stepGrid` (playhead nudge, chord nudge) steps by bars when the grid is coarser than a bar
  (a 1/4 grid in 1/8), so it never jumps over a bar line.

### Grid, time signature, length

- Tempo (`TempoInput`, in the song bar next to the key): typed freely; a value in range (30–300) applies as soon as it's
  complete (so typing 127 works), and on blur/Enter out-of-range values are clamped and
  unreadable ones restored.
- Time signature, length and grid live in one small popover in the song bar
  (`TimingMenu`), whose trigger reads "4/4 · 4 bars".
- Grid: 1 bar, 1/2, 1/4, 1/8, 1/16, Off. "1 bar" = the current bar length. The grid
  **restarts at every bar line** (`snap(..., barTicks)`), so odd meters stay aligned;
  bar lines are always snap points. Grid Off draws beat lines dotted.
- Time signature: presets 4/4, 3/4, 2/4, 5/4, 6/8, 7/8, 9/8, 12/8, or Custom (beats
  1–16 / note value 2, 4, 8, 16, chosen from menus so half-typed values never apply).
  Changing it **rescales clips with the bars** (`rescaleClips`): one chord per bar stays
  one per bar. Part of undo.
- Length change trims/drops clips past the new end (`fitToLength`). Part of undo.

### Home (`home.ts`, `HomeMenu.tsx`, `HomeNotice.tsx`)

- **On screen it's called "Key"** (the word people walk in knowing); "home" is how the
  app explains it ("C is home", "Home note") and what the code and this file call it.
  One "Key C Major" dropdown in the song bar (`HomeMenu.tsx`): 12 "Home note" buttons
  over the moods (most common first: Major, Minor, Dorian, Mixolydian, Lydian, Phrygian,
  Locrian), each described in plain words (`MODE_INFO`). Picking a note keeps the menu
  open; picking a mood closes it.
- **Changing home only re-labels** (colors, numerals, fit); chords never change. Part of
  undo.
- Right after, a notice (`HomeNotice`, a floating bar pinned bottom-center of the window, `position: fixed`, so showing or dismissing it never moves the page; z-index 15; clicking it keeps the selection) offers to move the chords, worded for what it does
  (`homeMove`): "Transpose chords to D major" (same mood), "Reshape chords for Dorian"
  (same key), "Move chords to D Dorian" (both). It uses `chordToKey`: chords all in the
  old key keep their scale degree (V stays V, Em in C major → E♭ in C minor; sizes,
  edits, inversion kept); others move by the tonic distance. One undo step. For
  relative homes (same notes, e.g. C major ↔ A minor) it says the chords still fit
  instead. The offer lasts while the chords are untouched; repeated home changes offer
  a move from the home the chords were written in. Not saved.
- **Detect from your chords** (top of the Key menu; `keyCandidates`, `homeReason`): the best match
  ("Best match") plus up to two major/minor second opinions that fit nearly as well (within 5%; usually the
  relative key), each with a plain reason ("Every note fits · starts and ends on Am"); the current key is
  marked "Current". Rare moods (Lydian…) only show when they're the best match. Picking one **only
  re-labels, with no offer to move the chords** (`applyDetectedKey`: they're already in that key). With no
  chords: "Add chords and the key can be detected from them." `rankHomes` scores every key × mood: fit, then
  the home chord's presence (first/last chord), then mood commonness; `detectHome` is its first.
- **Home suggestion** (`suggestHome`): if the chords fit another home noticeably better
  (>5% more of the note-time in its scale), the Key trigger shows a dot. Equal fits (relative keys) never
  nag.

### Transport, playhead, metronome

- **Opening a session is silent and never plays by itself**: the leaving workspace calls `silenceAll`
  (`audio.ts`): stops the transport and previews (their pending chords too), fades the output out over 30 ms
  and disposes the whole sound graph, which also kills the notes Tone already queued ahead (PolySynth keeps
  them on timers that `releaseAll` doesn't cancel). A `generation` counter makes sounds still waiting for
  `Tone.start()` bail. Stop/Pause keep normal release tails.
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
| ⌘D / Ctrl+D | Duplicate the selected chords right after them |
| ⌥← / ⌥→ (Mac) · Ctrl+← / Ctrl+→ | Nudge the selected chords one grid step (into empty space only) |
| ⌘A / Ctrl+A | Select all |
| ⌘Z · ⇧⌘Z / Ctrl+Y | Undo · redo |

The (i) tooltip next to the logo (`HelpTip.tsx`: how it works + every shortcut, shown on hover/focus) lists these; keep it in sync.

### Sessions (`src/session.ts`, `SessionBrowser.tsx`, `src/backup.ts`)

- A session is the whole workspace: the Track with its undo history, BPM, groove,
  grid, loop, metronome, notes lane, the selection, the inspected clip,
  the details panel (open/collapsed, tab) (`SESSION_KEYS`), so it reopens exactly as it was left.
- You're always in one session and **every change is saved to it as you go**, like a DAW project that
  never loses work. **Every session is a real, listed one**: there's no "Unsaved session" any more. On load,
  `prepareSessions` upgrades old data: work in the old scratch (unprefixed keys) becomes a listed "Untitled
  session" (copied, checked, then the scratch keys are removed), old list entries get their new fields
  (`migrateMeta`), and with nothing to open a new empty session is made. Idempotent (StrictMode runs it twice).
- The song bar's trigger reads like the document's name and opens the **sessions window**
  (`SessionBrowser.tsx`, a modal, portalled to `body`; full screen on phones, the views as chips): views on
  the left (**All sessions**, **★ Favorites**, **Folders**, one level, + to add), search, **+ New session**
  (made in the folder being viewed) and a sort select (Last edited · Name · Date created, saved globally as
  `sessionSort`). Rows: ☆/★ · name with an "Open" badge · "4 chords · C minor · folder · edited 3 min ago" ·
  ⋯ menu (also right-click): Rename (inline; Enter/blur saves, Esc cancels), Duplicate ("<name> copy" in the
  same folder, highlighted), Move to (No folder, folders, New folder…), Delete… (an inline confirm in the row).
  Clicking a row opens it and closes the window. Keys: ↑/↓ between rows (from the search box too), Enter
  opens, F2 renames, Esc closes (or closes a menu/confirm first); Tab stays inside; the app's shortcuts are
  off while it's open (focus that falls out of it is taken back). Folder ⋯: Rename, Delete (its sessions are
  kept, back to no folder).
- **Blank sessions don't pile up**: leaving a session that still has its automatic name ("Untitled session N"),
  isn't starred and has no chords and nothing to undo removes it. Deleting the open session opens the most
  recently edited other one (or a new blank one). Stored values of a session that's being left are removed
  only after its workspace unmounted (it saves its history on unmount): `pendingRemoval` in `useSessions`.
- **Backups** (`backup.ts`): "Back up all sessions" downloads `chords-backup-YYYY-MM-DD.json`, a plain copy of
  every `chords:v1:*` value (so a hand-made localStorage copy imports the same way). "Import backup…" adds the
  file's sessions (`planImport`): new ids, so nothing is ever overwritten; a taken name becomes "Name
  (imported)"; folders are matched by name (made if missing); favorites and dates are kept; the old scratch
  inside a backup comes in as "Untitled session". If storage is full, nothing is added.
- Each session's values live under its own key prefix (`session:<id>:`). `App` keys the `Workspace` by
  session, so switching remounts it and everything loads from storage (the history flushes on unmount;
  `silenceAll` stops every sound). The list, folders, sort and current session are global (`sessions`,
  `folders`, `sessionSort`, `currentSession`).

### Persistence (`src/persist.ts`)

Everything is saved to localStorage under `chords:v1:*` (per session, see above; a backup file is a copy of all of it): the
Track **with its full undo/redo history** (debounced, and flushed on page hide, on
unmount and on demand), BPM, grid, loop, notes-lane toggle, metronome
on/off and volume, the selection, panels, and the groove settings
(`groove2`: renamed after the level pass, so old, now-unbalanced volumes are dropped). Loaded data is validated (`isTrack`, type checks; note
names via `isNoteName`, since Tonal returns NaN, not undefined, for nonsense);
invalid or corrupt data falls back to defaults, and storage errors are ignored. On
shape changes, **migrate old data on load** so saved work survives (`migrateTrack`
turns old `symbol: "Dm7"` clips into chords, across the whole undo history); bump
`VERSION` in `persist.ts` only for changes that can't be migrated. The old palette size
key (`flavor`) is no longer read; it stays in `SESSION_KEYS` so copying and deleting
sessions still cleans it up. Old chords have no
`bass`, so they read as their root (inverted chords once named "F/C" are now plain F,
as intended). Playhead and play state are not saved.

### Export

Download MIDI (`midi.ts`, `MidiMenu.tsx`) renders with `renderTrack`, so the MIDI is
exactly what you hear (patterns, swing, voicings), with tempo and time signature. It's
a menu: all parts that are on (one file, a track each, which Ableton splits into
tracks; drums on channel 10 with General MIDI notes) or one part alone.

## Visual design

- Dark UI. The rule is **the song on top, then the chords, then one chord**. Top to bottom:
  - **Song bar** (`header.song-bar`): the piano icon + "create a chord progression", the (i)
    help tooltip headed "chords are fun", the sessions trigger (opens the sessions window; reads like the document's
    name); right: **Key C Major ▾**, the tempo field (BPM), **4/4 · 4 bars ▾** (time,
    length, grid) and Download MIDI. On narrow windows the right group wraps under.
  - **Main toolbar** (dashed line above, solid below), like Ableton's transport bar: Play
    (accent tint), Stop, Loop, metronome + volume on the left; Progressions + die and
    Groove + die on the right (fixed-width triggers, long text truncates).
  - **The timeline** (no panel around it, full width) with icon-only buttons stretched to
    its height on the right: + New (new chord, tinted), Undo, Redo.
  - Two panels (`Panel.tsx`):
    - **Voicing** (collapsible, closed by default, saved per session as `moreOpen`; hint "every
      note and how chords connect"): a row with the notes-lane legend on the left and
      Inversion ↓/↑, Octave ↓/↑ and Smooth voicing on the right (unusable until expanded; the
      ↑/↓ shortcuts still work), then the notes lane, lined up with the track above (the
      lane runs to the panel's left edge, like the track; `--side` is the right column).
    - **Chord details** (`section.details-panel`, no title bar): not collapsible; it appears
      when one chord is selected or stepped to, and goes away with the X in its header (or
      when several chords are selected, or none). Selecting a chord again brings it back.
  The playhead CSS variable lives on the `.panels` wrapper (`data-playhead-scope`), so the
  timeline and the notes lane share one playhead.
- **Type scale**: every font size is one of six CSS variables in `:root` (`--fs-micro` 0.6rem
  only for labels drawn inside graphics: keys, lane, tags on chords; then `--fs-xs` 0.75,
  `--fs-sm` 0.85, `--fs-md` 1, `--fs-lg` 1.25 (chord names on the track), `--fs-xl` 1.6). Don't
  add raw sizes.
- **Three button weights**: accent (Play, + New, the empty track's "Start from a
  progression"; at most one filled `button.primary` in view), bordered (the default: menus,
  settings), ghost (dice, undo, redo: no border until hovered).
- Helper text belongs in tooltips and the help popover, not always on screen: panels show
  state, and a sentence appears only when it says something about *this* chord (e.g. the
  slash-chord note).
- There is no Clear button: start over with + New session.
- **Chord color = scale degree of the root** (hue = degree × 360/7), identical in
  ideas, flavors, clips, lane and progression menu, so Dm, Dm7 and D (V/V) in C share the "2" color; how
  far a chord strays is shown by its fit tag, not its color. Roots outside the key are
  gray.
- Fit colors: green in key, blue common move (borrowed/leading), orange outside;
  tension yellow (some bite) / red (clashing).
- Clips are drawn 2px inside their real start/end (`CLIP_GAP_PX` in `Timeline.tsx`), so neighbors and the
  track edge never touch; this is visual only, the times are unchanged.
- Clips show chord name, roman numeral, and notes; narrow clips hide details via
  container queries.
- On/off settings (Loop, Metronome, the Groove parts) are toggle buttons that light up,
  not checkboxes. Avoid explanatory text that isn't needed; prefer showing state.
- **Phones (≤ 600px)**, one media block at the end of `index.css`: the song bar is three
  rows that never re-wrap, whatever the key or session is called: the logo; the session (takes
  the room left) and Download MIDI; then key (takes the room left), tempo and timing. To get
  there `.song-settings` becomes `display: contents` and its items are placed with `order`; the
  session's flex-basis is "the row minus MIDI", which forces the break after MIDI; "BPM" sits
  inside the tempo field (`.tempo-unit`); and the "Key" label hides while the key button is
  narrower than 11rem (a container query: about every phone under 400px), so the longest name
  ("F# Mixolydian") fits. Long names shorten with an ellipsis rather than move anything. The
  toolbar wraps (Progressions and Groove share a full-width row), the Voicing bar stays one
  line, every dropdown (and the help
  popover) opens as a sheet spanning its bar instead of hanging off its trigger, the
  Groove panel stacks (presets above, one column per part), the chord details header puts
  "Type a chord" on its own row, and the tabs scroll sideways instead of wrapping (the
  spot's context is hidden). No horizontal page scroll down to 320px. Touch drags are untested
  on a real device.
- **Narrow windows and small tablets (≤ 800px)**: the main toolbar wraps, Progressions and
  Groove sharing a full-width row under the transport (its two halves need ~750px side by
  side). Otherwise tablets use the desktop layout. `e2e` checks nine widths from 320 to 1280px
  for sideways overflow and an off-screen Progressions menu, and the phone header's rows.

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
- **The details panel never closes by itself** (only its X, or a multi-selection, hides it), chords and empty clips share one layout (header + tabs), and the panel has a fixed
  height with the tab content scrolling inside, so adding or switching clips never makes
  it jump.
- **The inspector shows the songwriter's answer first.** Ideas ("what could go here?") is
  the first tab and the default; Flavors (same root, other kinds) second; hands-on notes,
  inversion and bass third. The owner asked for the UI to make sense to musicians with no
  theory; the expert controls are all still one click away. The tab is sticky (one rule)
  rather than chosen per clip type.
- **"Key" on screen, "home" in explanations and code.** Nobody walks in knowing the word
  "home"; everyone knows "key". The Home paradigm itself is unchanged.
- **Transport in a top bar, not beside the track** (Ableton puts play, loop, metronome and
  tempo together); only + New, Undo and Redo stay beside the track. Changed in the
  redesign that also split the old Config menu into Key, tempo and "4/4 · 4 bars".
- **Ideas are clicked in, not dragged**: an empty clip's target is obvious, and the
  inspector keeps showing ideas so trying several is one click each (undo restores).
- **Sessions autosave; naming is optional**, like a DAW project that never loses
  work. New session never asks "are you sure", and there's no Clear button: a new
  session is the way to start over. **Every session is listed** (the old "Unsaved session" next to
  "Untitled session" confused people), blank ones clean themselves up, and the sessions live in a **modal
  window**, not a dropdown: folders, favorites, sort and search need the room, and it's what people know
  from "Open project" screens. Delete confirms inline (no browser dialogs); import never overwrites.
- **A detected key only re-labels**: the chords are already in it, so offering to transpose them (as a
  hand-picked key does) would be the opposite of what was asked.
- **Home is context, not content.** Changing home re-labels; moving chords is an
  explicit, offered action. (Earlier, key changes rewrote the chords, which made
  C major → A minor turn C into Am despite identical notes.) Home and time signature
  are part of undo.
- **Borrowing happens chord by chord** (Ideas' Add color, Flavors), never by changing home.
- **Chords are descriptions, not note lists**: keeps names readable, lets key changes
  keep roles, makes every edit one clear change. Note edits are pitch-class based; a
  name can't capture every voicing (Cadd9 with the D moved down still reads "Cadd9").
- **Song settings in the song bar** (`HomeMenu.tsx` for the key; `OptionsMenu.tsx` has
  `TempoInput` and `TimingMenu` for time/length/grid): the key and tempo are read and
  changed often, so they're always visible; time signature, length and grid are rarer, so
  they share one small popover whose trigger shows the two you read most.
- **Timeline and transport buttons are icons only** (tooltips explain them), so the
  right-hand column stays narrow.
- **Custom dropdowns only where native selects can't show enough** (descriptions,
  submenus); simple value pickers (Key, Length, Grid) stay native.
- **⌘D reuses the copy-drag rule** (a copy dropped on the last chord's right edge)
  instead of a new insert rule, and **nudge only moves into empty space** (never pushes):
  one rule each, the same as with the mouse. On a full track ⌘D makes a short copy and
  squeezes the end, as a copy-drag would.
- **Hearing an idea in place is a separate ▶, not a different click**: the card click
  still uses it (one click, undo restores), the ▶ only listens.
- **Loading a progression switches the scale** to the progression's, so its chords
  read as in key rather than all borrowed.
- **The hint under the track is an empty state, not always-on help**: it exists only while
  no chord's details are open, which is exactly when a newcomer has no next step on screen
  (right after loading a progression). It's one line and dashed, like an empty spot, and it
  leaves as soon as a chord is clicked.
- **The progression menu leads with the feel, not the numerals**: people who can't read
  "I – V – vi – IV" choose by "Uplifting and familiar"; the numerals stay visible for those
  who can.

## Planned / possible next

Lives in `TICKETS.md` (Up next, then Backlog), not here.

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
    duplicate (`planDuplicate`), nudge (`nudgeClips`), add/replace/remove, fit/rescale; time signatures (`sigBarTicks`, `sigBeatTicks`),
    grids (`gridStep`, `snap`, `stepGrid`), `playbackEnd`, `metronomeClicks`.
    Clips treat their chord as opaque; `planGroupDrop` is an internal helper of `planDrop`.
  - `chord.ts`: the chord model: types, names, notes, voicing/inversions, slash bass
    (`withBass`, `bassNote`, `soundingNotes`), note toggling (`fromIntervals` canonicalizes).
  - `parse.ts`: reading typed chords: names (`parseChord`), note lists
    (`chordFromNotes`), roman numerals (`parseNumeral`), all via `readChordInput`.
  - `suggest.ts`: ideas for a spot in the progression (`suggestForSpot`), and the chords
    heard around it (`inContext`).
  - `theory.ts`: scales/modes (`MODE_INFO`), the key's chords (`degreeChord`, sizes in
    `FLAVORS`), `romanNumeral`, `rootDegree`, `chordToKey`, `stackChord` (chords from any scale).
  - `home.ts`: Home: what a home change means (`homeMove`, `sameNotes`), detection
    (`rankHomes`, `detectHome`, `keyCandidates`, `homeReason`, `suggestHome`), and Spice chords
    (`spiceChords`, for "Add color").
  - `analysis.ts`: fit to the key (diatonic / borrowed / secondary dominant / passing
    diminished / tritone sub / outside) and tension, in plain words.
  - `voicing.ts`: `smoothVoicing` (voice leading via inversions), `fitOctave`.
  - `flavors.ts`: the Flavors tab, grouped by fit and ordered most expected first.
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
- `src/session.ts`: sessions (keys, list, folders, favorites, sort/filter, migration `prepareSessions`,
  summaries; `useSessions`).
- `src/backup.ts`: backup files (`downloadBackup`, `readBackup`, `planImport`).
- `src/platform.ts`: Mac vs Windows modifiers (`copyKey`, `freeKey`, `nudgeKey`).
- `src/selection.ts`: selection rules (`clickSelect`, `selectAll`, `pruneSelection`).
- `src/shortcuts.ts`: key → action (`shortcutFor`); App executes actions.
- `src/dropLabel.ts`: drag preview label (`describeDrop`, `heldName`).
- `src/components/`
  - `Timeline.tsx`: ruler + playhead, track, clips, resize handles, drag preview tags,
    and the empty track's start buttons (passed in as `emptyState`).
    Converts pointer positions to ticks; holds no editing rules.
  - `useChordDrag.ts`: pointer drag for clips (click vs drag threshold, Esc cancel,
    click modifiers, live copy/free modifiers).
  - `TimeSignatureControl.tsx`: preset menu + Custom pickers.
  - `OptionsMenu.tsx`: `TempoInput` (the song bar's tempo field) and `TimingMenu`
    ("4/4 · 4 bars": time signature, length, grid).
  - `Panel.tsx`: the collapsible panel (Voicing). The chord details are a plain
    `section.details-panel`; their X lives in the inspector's header.
  - `ChordInspector.tsx`, `NotesLane.tsx`, `ProgressionMenu.tsx`, `HomeMenu.tsx`,
    `HomeNotice.tsx`, `SessionBrowser.tsx` (the sessions trigger + window),
    `GrooveMenu.tsx`, `MidiMenu.tsx` (+ `useDropdown.ts`): see Behavior.
    The lane renders inside `Timeline` and follows the playhead via the `--playhead`
    CSS variable set on `.timeline`.
- `e2e/`: browser smoke tests (`harness.ts` starts Vite + Chrome and seeds tracks; `smoke.e2e.ts`).
- `src/App.tsx`: `App` (the sessions shell) and `Workspace` (state: track history,
  settings, selection, play state, playhead; wiring and layout), keyed by session. Drag previews are `planDrop(...)` rendered in place of the clips.

## Conventions

- Run `npm run check` (lint, tests, then typecheck + production build) before calling
  work done. While working, `npm test` and `npx tsc -b` are the fast checks.
- `npm run e2e` runs the browser smoke tests (`e2e/*.e2e.ts`, `vitest.e2e.config.ts`): a real
  headless Chrome drives drags, resize, the ruler and keyboard edits. Not in `npm run check`,
  but CI runs it as its own `e2e` job (ubuntu, `CHROME_PATH=/usr/bin/google-chrome`); run it
  locally after touching drag, resize, playhead or shortcut code.
- Any rule change gets a test next to its module (`*.test.ts`). `timeline.test.ts`
  checks invariants for **every** custom time signature; keep it passing when touching
  meters, snapping, or rescaling.
- Asset paths are relative (`base: './'` in `vite.config.ts`) so the build works on
  any static host; don't add absolute `/` asset URLs.
- Audio must be started from a user gesture (`Tone.start()` / `ensureAudio()`).
- Match existing code style: small pure functions with doc comments explaining *why*,
  no editing logic in components.

## Verifying

- Unit tests cover the rules; they can't see layout or hear audio. `npm run e2e` (about 6 s)
  covers the real-pointer flows: it starts its own Vite server on a free port, uses
  `playwright-core` with the installed Chrome (`CHROME_PATH` overrides; Mac and Linux paths are
  tried), seeds `chords:v1:track` in localStorage (`seedTrack` in `e2e/harness.ts`) and reads
  clips from the DOM. Add a case there when a new pointer or keyboard flow lands. It also
  checks the layout at nine widths (no sideways scroll, the Progressions menu on screen) and
  that the phone header keeps its three rows.
- For UI: run the dev server and drive the installed Chrome headlessly, e.g.
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new
  --screenshot=out.png --window-size=1280,800 http://localhost:5173/`, or a
  `playwright-core` script (no browser download; `executablePath` = that Chrome) for
  clicks, drags, and keys. Use a scratch directory for these, not the repo. Wait for
  `.track` before interacting. To screenshot a populated track, seed it
  temporarily (e.g. edit `DEFAULT_TRACK`) and revert.
- Audio (timing, sound, metronome feel) can't be verified by an agent; say so and ask
  the owner to listen.
