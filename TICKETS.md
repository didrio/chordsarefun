# Tickets — chords

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T24 — Song timeline and song playback (Opus · high · plan on). If the `e2e` CI job is red, fix that first. T27 (chord details back under the track) is a quick Sonnet fix that can go any time.

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
T16–T22 are done (the redesign is complete).

### Songs (T23–T25): where it's heading

Agreed with the owner on 2026-11-17. When writing a song you have a chorus and want to try verses and pre-choruses
against it, hear them in order and export it all. A session becomes a **song**: one or more **sections** (a
progression with a label: Intro, Verse, Pre-chorus, Chorus…), arranged on a **song timeline**. A session with one
unnamed section and nothing arranged is exactly today's app; existing users see one slim collapsed bar.

```
── ▸ Song   [Verse] [Pre-chorus] [Chorus●]  [+ Section ▾]                       [▶ Song] 2:08 ──
   (open)  1        5        9            17        21           29
           [ Intro ][ Verse        ][ Pre ][ Chorus     ][ Verse        ][ Chorus     ]   ← song timeline
1            2            3            4                                  (chord track: the Chorus)
[ Cm       ][ Eb       ][ Bb       ][ Fm       ]
── chord details ── / ── ▸ Voicing ── / ── ▸ Instruments (the Chorus's) ──
```

Owner's decisions:
- **Shared song-wide**: key, tempo, time signature (the "C minor · 120 BPM · 4/4" button is the song's).
  **Per section**: chords, length (bars), instruments.
- **Repeats are linked**: two Chorus blocks are the same Chorus (edit once, every Chorus changes). "Make a new
  section from this" forks an independent copy ("Chorus 2").
- **The song area is on top**, between the toolbar and the chord track, collapsed by default (song first, then
  chords, then one chord).
- **Three tickets**, not one shot. T23 (sections) is done; T24 and T25 remain.

Agent's calls the owner accepted (in the proposal):
- **Model** (`src/song.ts`, new, pure): `Section = { id, name: string | null, clips, bars, groove }`,
  `Block = { id, section }` (start/length derived, back to back), `Song = { tonic, mode, sig, bpm, sections,
  arrangement: Block[] }`, the undoable document. **`Track` stays** as "one section seen with the song's shared
  settings": lenses `sectionTrack(song, id): Track` and `withSectionTrack(song, id, track): Song` (shared fields
  → song, the rest → section; same object back when nothing changed, like `withMusic`) keep `App.tsx`,
  `progressionTrack`, `planDrop` etc. unchanged.
- **One undo history for the whole song.** Undoing an edit in another section switches the editor to it
  (`changedSection(a, b)`), so undo never changes something off screen.
- **Storage**: same `track` key, migrated on read (`readHistory` → `migrateSong`: a stored Track becomes a Song
  with one unnamed section, fixed id `main`, empty arrangement, across the whole history). The edited section
  is session UI state (new `section` key in `SESSION_KEYS`), not history.
- **The song timeline is not the chord `Timeline`**: chords live on a fixed length with gaps, resizing and a
  grid; the song is a variable-length list with none of those. Reuse `selection.ts` (generalized from `Clip` to
  `{ id, start }`), `ChordMenu`, `Panel`, the drag-label pattern, ruler/playhead CSS, the shortcut table.
- **One transport, never two things playing**: `playScope: 'section' | 'song'`. Transport Play plays the edited
  section (as today), **▶ Song** plays the arrangement; starting one stops the other. Space pauses whatever plays,
  and when stopped resumes the scope used last; Stop returns to that scope's start; Loop applies to either.
  The editor never jumps while the song plays: the chord track shows its playhead only while the edited section
  is the one sounding.

### T24 — Song timeline and song playback

- **Status:** ready
- **Session:** Opus · high effort · plan mode on (audio scheduling)
- **Goal:** Arrange sections into a whole song and hear it, each section with its own instruments.
- **Done when:**
  - [ ] The Song bar becomes a collapsible `Panel` (`songOpen` per session, closed by default) whose body is the
        song timeline: blocks back to back, widths proportional to bars, a bar ruler with its own playhead and
        seek, each block showing the section's name, bars and chord names; blocks of the edited section outlined
        (linked repeats visible). Empty: "Drag sections here, or [Add every section in order]".
  - [ ] Pure, tested arrangement edits in `song.ts`: `insertBlocks`, `moveBlocks`, `duplicateBlocks` (linked,
        right after), `removeBlocks`, block start/length and song length.
  - [ ] Drag a chip into the timeline (insertion line, "Add Chorus after Verse"); drag blocks to reorder ("Move
        Chorus before Verse"); multi-select (Shift range, ⌘/Ctrl toggle), ⌘D, Delete (removes from the song, not
        the section), ←/→, Esc; right-click / ⋯ (`ChordMenu`): Edit this section, Duplicate, Make a new section
        from this, Remove from song. Clicking a block selects it and makes its section the edited one.
  - [ ] `scheduleSong` in `audio.ts`: each block rendered with `renderTrack(section.clips, …,
        arrangementOf(section.groove))` and offset by its start; a transport callback at each block start switches
        the groove (synths swap only when the sound differs; volumes and brightness ramp); metronome over the whole
        song; `soundAt` applies the groove of the block under the playhead first; edits re-schedule live.
  - [ ] `playScope` and the transport rules (see "One transport" above); ▶ Song + song length in the Song bar.
  - [ ] e2e: drag a chip in, reorder, ⌘D, Delete; Song play/pause doesn't move the editor.
  - [ ] `AGENTS.md`: Song timeline, Transport, Keyboard table and the help tooltip (`HelpTip.tsx`).
- **Context:** `audio.ts` (`schedule`, `applyGroove`/`setGroove`, `soundAt`, `rendered`), `patterns.ts`
  (`renderTrack`), `selection.ts`, `ChordMenu.tsx`, `Panel.tsx`, `useChordDrag.ts` (pattern only: its drop rules
  are tick-based; a small block-drag hook is simpler), `dropLabel.ts`, `shortcuts.ts`. Owner listens: section
  changes switch sounds cleanly, no stuck notes, seeking into the middle of a song.
- **Handoff from T23:** the model is in place in `src/song.ts`: `Block = { id, section }` and `Song.arrangement`
  exist (validated by `isSong`, always `[]` so far; `removeSection` already drops a section's blocks); nothing
  writes blocks yet. `SectionBar.tsx` is a plain `div.sections-bar` with a muted "Song" label: make it a `Panel`
  (title "Song", the chips + "+ Section" in `actions`, `songOpen` in `SESSION_KEYS`) and put the timeline in its
  body. `App.tsx` `Workspace`: `song` is the history, `sectionId` / `switchSection` the edited section, `track` a
  small adapter over the lenses; undo/redo go through `showStep` + `changedSection` (an arrangement-only change
  changes no section's music, so it never switches: probably right for block edits). `songClips` lays sections in
  *section* order for key detection; consider arrangement order once there are blocks. Switching section while
  playing already keeps playing (the schedule/groove effects re-run). `sessionMusic` still plays one section
  (T25). The packed history (`packSongHistory`) stores sections by reference; blocks are small and stay inline.

### T27 — Chord details directly under the track

- **Status:** ready
- **Session:** Sonnet · low effort · plan mode off
- **Goal:** The layout the redesign agreed on (2026-11-16): chord details sit directly under the track, above
  Voicing and Instruments, so opening those panels never moves the panel used most. In the app they've been under
  Instruments since at least T19 (`App.tsx` renders Timeline, Voicing, Instruments, then `section.details-panel`);
  `AGENTS.md` (Behavior → "Chord inspector" and Visual design) already describes the target.
- **Done when:**
  - [ ] `section.details-panel` renders right after `.timeline-row` inside `.panels` (desktop and phones; check the
        phone `order` rules at the end of `index.css` don't fight it).
  - [ ] Opening/closing Voicing and Instruments doesn't move the details panel (e2e: its top before/after, like
        the key-change notice case).
  - [ ] `AGENTS.md` Visual design list order matches (Voicing and Instruments after the chord details).
- **Context:** `App.tsx` (the `.panels` JSX), `index.css` (`.details-panel`, the phone block), `e2e/smoke.e2e.ts`.
  Ask the owner first if they've grown used to it below Instruments.

### T25 — Song MIDI, sessions window, phones, polish

- **Status:** blocked — needs T24
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** The song leaves the app (MIDI) and reads well everywhere (sessions window, phones).
- **Done when:**
  - [ ] Song MIDI: blocks' renders concatenated, section names as MIDI markers; the MIDI menu offers Whole song /
        This section once the song has blocks.
  - [ ] Sessions window: ▶ plays the song when it has blocks (else the edited section); the row lists section
        names ("Intro · Verse · Chorus") for songs, chords otherwise, the sounding one lit.
  - [ ] Phones: chips scroll sideways, the timeline scrolls; no sideways page scroll at the e2e widths.
  - [ ] `AGENTS.md`: Export, Sessions, Phones; design decisions (linked repeats, shared key/tempo/meter, why the
        song timeline isn't the chord timeline) checked against what shipped.
- **Context:** `midi.ts` (`trackMidi`), `MidiMenu.tsx`, `session.ts` (`sessionMusic`), `SessionBrowser.tsx`,
  `audio.ts` (`previewSession`: per-block grooves need one rig per distinct sound, or reuse `scheduleSong`'s
  approach), the phone block at the end of `index.css`, `e2e/smoke.e2e.ts`. Owner checks: the song MIDI imports
  into Ableton as one arrangement.

### T26 — Export audio (WAV)

- **Status:** blocked — needs T25 (works for a single progression too, so it could ship earlier for sections only
  if wanted; after T25 it exports whole songs)
- **Session:** Opus · high effort · plan mode on (audio engine)
- **Goal:** Download what you hear as a WAV file, so a song sketch can go straight into a DAW or be shared, with
  no server: rendered in the browser.
- **Done when:**
  - [ ] `renderAudio(music)` in `audio.ts`: `Tone.Offline` builds its own graph (`makeGraph`, `makePoly`,
        `makeKit`, `setLevels`, as `previewSession` does) and schedules every note from `renderTrack` at absolute
        times, plus a ~2 s tail so the last chord rings out. Songs: one rig per distinct sound, switched at block
        starts (the same rule as `scheduleSong`). No metronome. The limiter at −1 dBFS stays as the safety net.
  - [ ] Pure WAV encoder (`wav.ts` + test: header fields, 24-bit PCM, stereo, 44.1 kHz) from an `AudioBuffer`'s
        channels; no dependency. MP3 isn't worth a library for now.
  - [ ] An "⤓ Export" menu: the MIDI menu becomes Export, with Audio (WAV) next to MIDI, the same choices (whole
        song / this section; all parts or one part alone as stems). Rendering shows progress ("Rendering… 40%")
        and can be cancelled; the file is `<session name>.wav`.
  - [ ] Unit test the scheduling part (events and times) without Web Audio; `AGENTS.md` Export section updated.
- **Context:** `audio.ts` (`makeGraph`, `previewSession` is the model to follow), `patterns.ts` (`renderTrack`),
  `midi.ts`/`MidiMenu.tsx` (menu and part choices). Size: a 3-minute stereo 24-bit WAV is ~48 MB in memory,
  which is fine; very long songs may take a few seconds to render. Owner listens: the WAV matches playback
  (levels, swing, sound switches between sections) and imports cleanly into Ableton.

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
- Progression browser on phones: picking a genre chip that's scrolled off to the right doesn't scroll it into view
  (the sessions window's folder chips behave the same). Small `scrollIntoView` on the active chip.
- The production bundle is ~680 kB (Tone.js); Vite warns about chunks over 500 kB. Lazy-loading Tone on the
  first user gesture would halve the first load, if load time ever matters.

## Done

- T23 — Sections — 2026-11-17 — a session is a song (`src/song.ts`): sections with their own chords, length and instruments, sharing key/tempo/meter; old sessions open as one "Progression" section (`migrateSong`, fixed id `main`); one undo history that opens the section a step changes (`changedSection`); history saved packed, each section version once (owner's call; `history.ts` `encode`/`decode`); `SectionBar.tsx` chips (+ Section with labels and colors, rename, "Make a new section from this", delete); key detection/move and meter changes cover every section; progressions take the song's mood only when no other section has chords. Also: the toolbar now wraps up to 1000px (it overflowed at 900; e2e checks 900). Owner to listen: switching sections while playing.
- T22 — Chord details rework — 2026-11-16 — panel is always present (fixed height, no X, `panelOpen` retired; same frame shows an empty state); header gained "↺ Back to Cm" and ⋯ (opens `ChordMenu`; Clear lives there); tabs are Ideas · Variations of C · Notes; clicking an idea/variation uses it and plays it in place (card ▶ removed, why-text clamped to 2 lines); Notes tab has Bass note, Shape (inversion + octave), Why. Also fixed: the chord menu stayed open when you clicked a chord (clips stop pointerdown; the menu's outside-click listener is now capture-phase; e2e added). Owner to look at the panel on a phone and listen to click-to-hear.
- T21 — Chord menu — 2026-11-16 — `ChordMenu.tsx`: right-click (or long-press) a chord, or the ⋯ on a selected one, opens actions on the selection (Ideas, Variations, inversion, octave, Duplicate, Clear, Delete) with shortcuts; right-click selects an unselected chord first; Mac Ctrl+click still toggles selection. Rows built in `chordMenuGroups` (App.tsx), so T22 can reuse it. Owner to try a real right-click and the ⋯ on a phone.
- T20 — Voicing you can understand at a glance — 2026-11-16 — Inversion [↓ Lower][Higher ↑], Octave and Smooth voicing moved into the Voicing header (work while collapsed) after a scope label ("All 4 chords" / "F" / "2 selected chords"); clicking a chord in `NotesLane` selects it (`onSelect` → `selectClip`, so it also previews it); the header wraps below the title on narrow windows. Deviation: the panel hint moved into the expanded legend (no room in the bar); Smooth voicing keeps its old rule (selection only if 2+), so with one chord selected the label names that chord but Smooth acts on all (its tooltip says so). e2e: scope label, lane click + ↑. Owner to look at the header on a phone.
- T19 — Progression browser — 2026-11-16 — `ProgressionBrowser.tsx` (a modal like the sessions window; both now share `Modal.tsx`, `.modal-backdrop`): genres + search (`searchProgressions`), rows loop on click with the sounding chip lit, "Hear with: Its instruments | Your instruments" (global `progressionHearWith`), Use chords / Use instruments / Use both (`progressionTrack`, one undo step each; Enter and double-click = both); "Browse progressions" trigger replaces `ProgressionMenu.tsx`; Random gained Both. Calls the owner may revisit: search stays within the chosen genre ("Search all genres" when empty), ↑/↓ only keep playing if something was playing, under 400px the Random group shows the dice without the word. Owner to listen: a loop with Its vs Your instruments, flipping the switch mid-loop, Use both while the song plays.
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
