# Tickets — chords

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T19 — progression browser (Opus · high · plan on); T18 gave it each progression's instruments and tempo.
T20–T22 are independent (Sonnet · medium · plan off). If the `e2e` CI job is red, fix that first.

## In progress

_None._

## Up next

### The redesign (T15–T22): where it's heading

Agreed with the owner on 2026-11-16 after a UX review. Fewer controls at the same level; progressions and
instruments become one idea (each progression comes with its own instruments and tempo, and you take the chords,
the instruments, or both); chord details always in the same place. Target layout (desktop):

```
🎹 create a chord progression (i)  [My song ▾]              [C minor · 120 BPM · 4/4 ▾] [⤓ MIDI]
[▶][■][⟲]  [↶][↷]  [+ Add chord]          [🎲 Random: Chords│Instruments│Both] [Browse progressions]
1            2            3            4                                       (track, full width)
[ Cm       ][ Eb       ][ Bb       ][ Fm       ]
── chord details: always here, fixed height, directly under the track ──────────────────────────
▶ Cm  i  C Eb G   In key · Every note is in C minor…   ↺ Back to Fm     [Type a chord…] [⋯]
Ideas for this spot │ Variations of C │ Notes                           Before Eb, at the start.
── ▸ Voicing   All 4 chords   Inversion [↓ Lower][Higher ↑]  Octave [↓][↑]  [Smooth voicing] ──
── ▸ Instruments   [Pop ▾]    (open: Chords │ Bass │ Drums strips, swing) ───────────────────
```

Nothing above the chord details changes height, so opening Voicing or Instruments never moves the panel used
most. On screen it's "Instruments"; the code can keep calling it `groove`. Owner's decisions: the song button
shows its values (not an icon); MIDI keeps its own button; chord details never close (no X); all randomizing sits
in one group of three. Agent's calls the owner accepted: the right-click menu holds *actions* on chords, not the
ideas (menus close after one pick, and trying ideas one after another is the core loop); clicking an idea uses it
and plays it in place, so the card ▶ goes (reverses T2's decision). Every ticket keeps phones working (the `e2e`
widths), updates `AGENTS.md` (including the design decisions it reverses) and adds tests next to changed rules.
T20–T22 don't depend on each other or on T16–T19.

### T19 — Progression browser

- **Status:** ready (after T16 and T18)
- **Session:** Opus · high effort · plan mode on
- **Goal:** A window to browse progressions like the sessions window, hear each with its own instruments (or
  yours), and take its chords, its instruments, or both.
- **Done when:**
  - [ ] `ProgressionBrowser.tsx`, a modal built like `SessionBrowser.tsx` (portal to `body`, backdrop, focus kept
        inside, Esc, full screen on phones, the app's shortcuts off while open): genres on the left (All + the 9),
        search (name, feel, chord names, numerals), and a "Hear with: Its instruments | Your instruments" switch
        (saved globally).
  - [ ] Rows: ▶/■ (loops until stopped, the sounding chord chip lights up, as in the sessions window), name,
        chords in the current key, feel, "Pop · 112 BPM", numerals and scale muted. Clicking a row selects it and
        plays it; ↑/↓ moves the selection and keeps auditioning.
  - [ ] Footer for the selected row: **Use chords** (today's `loadProgression`: chords + its scale on your track
        and meter, playhead to the start, keeps playing) · **Use instruments** (its preset + its tempo) · **Use
        both** (the primary button; Enter). Each is one undo step (T16) and closes the window.
  - [ ] Previews stop on close, on use, on Play and on opening a session (`stopPreview`, `silenceAll`).
  - [ ] Trigger "Browse progressions" in the transport row (accent while the track is empty); the empty track's
        "Start from a progression" opens it (`ProgressionMenuHandle` today). `ProgressionMenu.tsx` is gone.
  - [ ] The random group gains **Both**: a random progression applied with its instruments and tempo (never the
        same twice in a row), exactly like "Use both".
  - [ ] e2e: a preview leaves the track alone; Use chords keeps the instruments; Use both changes instruments and
        tempo; one ⌘Z restores both.
  - [ ] `AGENTS.md`: the progression library bullet, Random, design decisions ("Loading a progression switches the
        scale" stays; add why instruments come with progressions).
- **Context:** Hearing a session (`previewSession`, `chordTimes`, the row ▶ in `SessionBrowser.tsx`) is the model
  for previews. "Your instruments" = the open session's groove and BPM.
- **From T18:** every `Progression` has `groove` (a preset id) and `bpm`; `progressionMusic(prog, tonic, groove?,
  bpm?)` returns the `SessionMusic` to pass to `previewSession` (pass the open session's `groove` and `bpm` for
  "Your instruments"). `previewSession` takes `passes` (default: loop forever); today's menu ▶ (`hearProgression`
  in `App.tsx`) uses `passes: 1` and pauses the song first; the browser's ▶ should loop (no `passes`) with ■.
  "Use instruments" = `applyGroove(groove, preset)` + the progression's `bpm`, through `commit` (one undo step).
  Row label "Pop · 112 BPM" = the preset's `name` + `bpm`. The owner hasn't listened to the picks yet: if some
  feel wrong, they're one line each in `progressions.ts`.

### T20 — Voicing you can understand at a glance

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Make it obvious that inversion and octave act on the selected chords (or all of them), and let people
  select chords right where the result shows.
- **Done when:**
  - [ ] The controls live in the Voicing header and work while it's collapsed (today they're dead until opened).
  - [ ] A scope label in words before them: "All 4 chords" / "2 selected chords" / "Cm".
  - [ ] Labeled steppers: Inversion [↓ Lower] [Higher ↑], Octave [↓] [↑], then Smooth voicing; tooltips keep the
        shortcuts.
  - [ ] Clicking a chord's notes in `NotesLane.tsx` selects that chord (same modifiers as the track: Shift range,
        ⌘/Ctrl toggle; `clickSelect`). Still no editing of single notes there.
  - [ ] `KEEPS_SELECTION` in `App.tsx` still covers the lane; e2e case: click a chord in the lane, ↑ changes only it.
  - [ ] `AGENTS.md`: the Notes lane bullets, Visual design (Voicing).
- **Context:** `invertChords`, `shiftOctaves`, `smoothen` and `octaveTargets` in `App.tsx` already hold the rules
  (selection, else every chord; all move or none).

### T21 — Chord menu: right-click and ⋯

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** The actions on chords, with their shortcuts, one right-click away (and one tap on touch screens).
- **Done when:**
  - [ ] `ChordMenu.tsx`: right-click a chord on the track, or the ⋯ that shows on the selected chord, opens a menu
        acting on the selection (or on that chord if it isn't selected): Ideas for this spot, Variations (open the
        details tab) · Higher / Lower inversion (↑/↓) · Octave up / down (⇧↑/⇧↓) · Duplicate (⌘D) · Clear chord
        (keeps the spot) · Delete (⌫). Shortcuts shown right-aligned, like a DAW menu; the header names the chord
        or "3 chords"; Esc and click outside close it.
  - [ ] Ctrl+click on a Mac keeps toggling the selection (today `onContextMenu` is suppressed on clips in
        `Timeline.tsx`): only a real right-click opens the menu.
  - [ ] The menu is reusable from the chord details header (T22 puts Clear there).
  - [ ] e2e: right-click → Duplicate adds a copy.
  - [ ] `AGENTS.md`: Selection, the shortcuts table if anything changed, the help popover.
- **Context:** `duplicateSelected`, `removeSelected`, `invertChords`, `shiftOctaves` in `App.tsx`; Clear is today's
  `onClear` in the inspector (sets `chord: null`).

### T22 — Chord details rework

- **Status:** ready (best after T21)
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** The panel songwriters use most: always in the same place, one click per idea, tabs that say what
  they're for.
- **Done when:**
  - [ ] Always present, fixed height, directly under the track (above Voicing and Instruments). No X:
        `panelOpen` retires (keep its key in `SESSION_KEYS` for cleanup). With no chord inspected, or several
        selected, it shows an empty state in the same frame (today's `details-hint` text).
  - [ ] Header: ▶ · name · numeral · notes · fit line · "↺ Back to Cm" (shown once the chord changed since it was
        selected; one undo step; the inspector remounts per clip, so it can remember the chord it opened with) ·
        Type a chord · ⋯ (T21's menu; Clear lives there now, not next to anything that closes).
  - [ ] Tabs: Ideas for this spot · Variations of C (was "Flavors of C") · Notes (was "Notes and bass").
  - [ ] Clicking an idea or variation uses it and plays it in place (chord before → it → after, `inContext`);
        while the track plays you hear it in the loop instead. The card ▶ (`HearInPlace`) is gone. Why-text is
        clamped to two lines (full text on hover).
  - [ ] Notes tab: keyboard, Bass note, "Shape" (this chord's inversion and octave), Why it sounds like this.
  - [ ] e2e: replace "an idea's ▶ doesn't change the track" with "clicking an idea changes the chord and Back
        restores it".
  - [ ] `AGENTS.md`: Chord inspector section, the design decisions on the details panel and on hearing ideas in
        place (reversed: the owner agreed), "Wording".
- **Context:** `ChordInspector.tsx` (`SpotIdeas`, `Flavors`, `InversionRow`, `BassRow`, `WhyItSounds`), the
  details section and `details-hint` in `App.tsx`, `hearInContext` and `setInspectedChord` in `App.tsx`.

## Backlog

- Sessions window: drag rows onto folders (today: the row's ⋯ → Move to). Maybe an undo toast instead of the
  delete confirm.
- Try T3's ⌘D on a full track: the copy shrinks to one grid step and the last chord is squeezed (the copy-drag
  rule). If that feels wrong in practice, alternatives: refuse, or split the duplicated chord in half. Owner's
  call.
- Phones: touch drags, resize handles and double-click-to-add are untested on a real device (T6 and T9 only
  fixed the layout, checked in desktop Chrome's phone emulation). Probably needs long-press or a visible "add"
  affordance instead of double-click.
- Octave-specific note edits in the notes lane (e.g. doubling the bass), open/spread voicings. (Touches the
  chord model: Opus, plan mode.)
- Sampled instruments (a real piano) if the synth presets aren't enough.
- Per-clip pattern overrides, drum fills, more drum kits, humanize (timing/velocity).
- Should a new empty spot open on Ideas even when the sticky tab is Notes? (Owner's call; today the tab is
  sticky everywhere. Agent's view: keep one rule; an empty spot's Notes tab still works, by clicking keys.)
- The production bundle is ~680 kB (Tone.js); Vite warns about chunks over 500 kB. Lazy-loading Tone on the
  first user gesture would halve the first load, if load time ever matters.

## Done

- T18 — Every progression has its own instruments and tempo — 2026-11-16 — each of the 183 progressions has a hand-picked preset and BPM (in its preset's range, never Just chords or the waltz, ≥2 presets per genre; tests); `progressionMusic` → `SessionMusic`; `previewSession` gained `passes`; the Progressions menu's ▶ now plays one pass with its own instruments and tempo. Deviation: per-progression values instead of genre defaults + overrides (every one was picked anyway). Owner to listen via the menu ▶: Heartfelt pop, Future pop, Emo build, Phonk, Dubstep, Backdoor cadence, Giant cycle, Andalusian cadence, Flamenco, Tango drama, Calypso.
- T17 — Instruments section replaces the Groove dropdown — 2026-11-16 — `InstrumentsPanel` (under Voicing, closed by default, `instrumentsOpen`): preset `<select>` by genre in its bar (works collapsed, "Custom" when changed, never touches tempo), three strips + swing; `Panel` gained an `actions` slot; `GrooveMenu` and both dice gone, replaced by one `🎲 Random: Chords | Instruments` group (T19 adds Both); help text says Instruments. Deviation: Space doesn't play/pause inside the new native selects (it never did in the old ones either: the key handler skips selects, and Space opens them natively); sliders still do. Owner to look at the strips and the phone layout (Random gets its own row).
- T16 — Instruments and tempo join undo — 2026-11-16 — `Track` now holds `groove` and `bpm` (all undoable; sliders
  one step per drag via `Slider` gestures, no-op changes no step via `withMusic`/`sameGroove`); old sessions'
  history gets their saved `groove2`/`bpm` on open (`legacyMusic` → `migrateTrack`), `sessionMusic` reads the
  track; `readHistory` no longer passes map's index to `migrate`. Owner to listen: undo while playing.
- T15 — Song popover, one transport row, full-width track — 2026-11-16 — `SongMenu`: one "C minor · 127 BPM · 4/4" button (with the key-suggestion dot) opens Key (`KeyPanel`), tempo, time, length, grid, metronome; transport row now Play/Stop/Loop · Undo/Redo · "+ Add chord"; side buttons gone, track and lane full width; MIDI compact; phone header is two rows. Deviation: on phones the logo's title text is visually hidden so logo + session share row 1 (the full title can't fit beside the session at 320px); the transport wraps at 320px (Add chord on its own line). Owner to look at it on a real phone.
- T14 — Session rows list their chords — 2026-11-16 — every row shows its chords (the sounding one lights up while heard) with key · folder · edited on the right (under the chords on phones); "4 chords" is gone.
- T13 — Session preview loops — 2026-11-16 — the sessions window's ▶ loops the session (seamless, audio-clock scheduled pass by pass) until ■, closing the window or opening a session.
- T12 — Hear a session from the sessions window — 2026-11-16 — ▶ on each row plays that session once exactly as its own Play would (its tempo, groove, sounds, drums, mix; own sound graph, ■ stops), shows the chord names with the sounding one lit, pauses the song first.
- T11 — Detect key, silent session switch, sessions window, backups — 2026-11-16 — Key menu "Detect from your chords" (best match + major/minor second opinions, re-label only); `silenceAll` on session switch (progression/"in place" previews used to keep playing into the next session); the sessions dropdown became a modal window (folders, favorites, sort, search, inline rename/delete, no more "Unsaved session", blank sessions clean up); "Back up all sessions" / "Import backup…" (never overwrites, taken names get "(imported)"). Owner to listen once that switching sessions is silent.
- T10 — Key-change notice without moving the track — 2026-11-15 — `HomeNotice` is a fixed bottom-center bar (z-index 15), so the track never moves; clicking it keeps the selection; `e2e` case checks `.track` top before/after.
- T9 — UI/UX pass — 2026-11-15 — Progressions menu stays on screen at every width, leads with each progression's
  feel and shows that it scrolls; toolbar wraps at ≤800px (it overflowed 600–800px); a one-line hint where the
  chord details go while none are open; phone header in five rows instead of six, no sideways scroll down to
  320px; `e2e` layout cases at nine widths. Unticketed: the owner asked for the pass directly.
- T8 — e2e in CI — 2026-11-14 — separate `e2e` job in `ci.yml` (ubuntu, `CHROME_PATH=/usr/bin/google-chrome`). Pushed straight to `main`, so its first run is unverified: check it on GitHub; if it flakes, fix the test, don't retry.
- T7 — Browser smoke tests — 2026-11-14 — `npm run e2e`: 9 real-Chrome tests (reorder, swap, copy-drag, resize
  trims neighbor, ruler click, ⌘D + ⌘Z, nudge, double-click adds a spot, idea ▶ leaves the track alone), ~6 s.
  Not in `npm run check` or CI: the ubuntu CI job wasn't added since it can't be verified from a Mac.
- T2 — Hear an idea in context — 2026-11-14 — ▶ on every idea and flavor card plays previous → it → next
  (`inContext`), without touching the track; any new preview replaces a running one; Play stops previews.
- T3 — Duplicate and nudge — 2026-11-14 — ⌘D/Ctrl+D (`planDuplicate`, the copy-drag rule) and ⌥←/→ (Mac) /
  Ctrl+←/→ (`nudgeClips`, into empty space only); `stepGrid` no longer skips bar lines with grids coarser than
  a bar.
- T4 — Remove the unused palette code — 2026-11-14 — `Palette.tsx`, `SpiceRow`, `diatonicChords`,
  `addChord`/`dropChord`, palette CSS and App's unreachable new-chord branches gone (`spiceChords` and the
  pure new-chord drop rules kept); theory tests now test `degreeChord` directly.
