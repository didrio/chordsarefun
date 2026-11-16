# Tickets — chords

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T16 — Instruments and tempo join undo (Opus · high · plan mode on; saved data and migration). T17–T19 build
on it; T20–T22 are independent (Sonnet · medium · plan off). T11–T15's e2e cases have only run on a Mac: if the `e2e`
job is red, fix that first.

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

### T16 — Instruments and tempo join undo

- **Status:** ready
- **Session:** Opus · high effort · plan mode on (saved data and migration)
- **Goal:** Groove settings and BPM become part of the undoable document, so replacing your instruments (T17's
  presets, T19's "Use instruments") is one ⌘Z away, like every other edit.
- **Done when:**
  - [ ] `Track` (`src/track.ts`) gains `groove: GrooveSettings` and `bpm: number`; `DEFAULT_TRACK`, `isTrack`
        (use `isGrooveSettings`) and `migrateTrack` updated. Workspace (`App.tsx`) reads them from `track.value`
        instead of `usePersistentState(k('bpm'))` / `k('groove2')`.
  - [ ] Old sessions: every history entry without them gets the session's saved `groove2` / `bpm` (or the
        defaults), so undo never changes the sound of existing work. `migrateTrack` is called per entry by
        `useHistory` without the session prefix: pass the values in (e.g. a migrate built per session) rather
        than reading storage inside the pure function.
  - [ ] Sliders (part volumes, brightness, swing) use `track.beginGesture` / `updateGesture` (one drag = one undo
        step, like a resize); toggles, pickers, presets and the tempo field use `commit`. No-op edits add no step.
  - [ ] `sessionMusic` (`src/session.ts`) reads groove and BPM from the stored track, falling back to the old
        keys. `bpm` and `groove2` stay in `SESSION_KEYS` so copying and deleting still clean them up. Backups keep
        working (`backup.ts` copies keys as they are).
  - [ ] Tests: migration (old history gets the old values; new history round-trips), gestures, no-op edits.
  - [ ] `AGENTS.md`: Undo/redo ("The undoable document is the Track…", and the line listing what isn't in
        history), Persistence, Sessions.
- **Context:** `history.ts` (`commit`, `beginGesture`, `updateGesture`, max 500 steps, saved with the session).
  The metronome, grid, loop and selection stay outside history. Audio wiring: `setAudioGroove(groove)` and
  `setTransportBpm(bpm)` effects in `App.tsx`.

### T17 — Instruments section replaces the Groove dropdown

- **Status:** ready (after T15; best after T16)
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Editing your instruments gets its own place, a collapsible "Instruments" section like Voicing, with the
  presets as a simple dropdown; randomizing moves into one group in the transport row.
- **Done when:**
  - [ ] New `InstrumentsPanel.tsx` using `Panel.tsx`, below Voicing; open state saved per session (new key in
        `SESSION_KEYS`, closed by default). Its header works while collapsed: a native preset `<select>` grouped
        by genre (`<optgroup>`, from `GroovePreset.genre`), reading "Custom" when a part was changed
        (`matchingGroove`). Picking a preset never changes the tempo.
  - [ ] Body: three strips side by side (Chords, Bass, Drums: on/off, volume, Sound and Pattern with their
        descriptions, Chords' brightness; reuse `Part` / `Picker` from `GrooveMenu.tsx`), then Swing. Stacks on
        phones.
  - [ ] The Groove trigger, its panel and Play button, and `GrooveMenu.tsx` are gone.
  - [ ] Transport row, right: `🎲 Random: Chords · Instruments`, one connected group (the two dice move there;
        `randomProgression` and `randomGroove` in `App.tsx`). T19 adds "Both".
  - [ ] Wording: "Instruments" everywhere on screen ("Groove" gone from labels, tooltips, the help popover).
  - [ ] `AGENTS.md`: the Groove section, Random, Visual design, the layout order.
- **Context:** The chord-details panel is still the old one until T22 (it sits below Voicing today); keep the order
  Track → (details) → Voicing → Instruments in mind. Space plays/pauses inside dropdowns and sliders
  (`App.tsx`'s key handler); keep that for the new selects.

### T18 — Every progression has its own instruments and tempo

- **Status:** ready
- **Session:** Opus · high effort · plan mode off (musical judgment; data and one pure function)
- **Goal:** Each progression in the library knows how it's meant to sound (a groove preset and a tempo), and can be
  heard that way.
- **Done when:**
  - [ ] `Progression` (`progressions.ts`) gains `groove` (a `GROOVES` id) and `bpm`. Genre defaults plus
        per-progression overrides so each genre cycles 2–3 fitting presets (ballads → Piano ballad, power chords →
        Rock / Punk / Metal, jazz ballads → Jazz ballad, lo-fi → Lo-fi hip-hop, flamenco → … ). Never "Just
        chords"; the waltz only for a 3/4 progression (there are none today).
  - [ ] `progressionMusic(prog, tonic, groove?, bpm?)` returns a `SessionMusic` (`audio.ts`): clips from
        `progressionClips` (one bar per chord), 4/4, the progression's preset (`applyGroove` on `DEFAULT_GROOVE`)
        and BPM, or the ones passed in ("your instruments"). Previews then reuse `previewSession` (loops
        seamlessly on its own sound graph; `onChord` lights the sounding chord).
  - [ ] Tests: every preset id exists, every BPM is inside its preset's `bpm` range, every genre uses at least two
        presets.
  - [ ] Hand-off lists a few progressions for the owner to listen to.
- **Context:** Presets carry `genre` and `bpm: [min, max]` already (`grooves.ts`; `randomBpm` is unused). Levels
  are measured, not guessed (`AGENTS.md`), but this ticket adds no sounds or presets, so no new measuring.

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
- T6 — Phone layout — 2026-11-14 — ≤600px: bars wrap, menus open as full-width sheets, Groove panel stacks,
  chord details header and tabs fit; no sideways scroll at 375px (layout only; touch not tested).
- T1 — UI redesign — 2026-11-14 — chord details as a header + Ideas / Flavors / Notes tabs, song bar + Ableton-style
  transport bar (Config menu gone, "Key" on screen), empty-track start buttons, one type scale and button weights
  (8aabdc1…187a571).
- T5 — Ticket workflow — 2026-11-14 — `/start`, `/wrap`, `/ticket` skills and this file (adapted from
  mobile/base, minus its base backport), `npm run check`, shared `.claude/settings.json`; old roadmap moved here.
