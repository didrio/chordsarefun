# Tickets — chords

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T28 — The mix clips on drum hits (Opus · high · plan on). If the `e2e` CI job is red, fix that first.

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
── ▸ Voicing   All 4 chords   Inversion [↓ Lower][Higher ↑]  Octave [↓][↑]  [Smooth voicing] ──
── ▸ Instruments   [Pop ▾]    (open: Chords │ Bass │ Drums strips, swing) ───────────────────
── chord details: always here, fixed height, under Instruments ──────────────────────────────
▶ Cm  i  C Eb G   In key · Every note is in C minor…   ↺ Back to Fm     [Type a chord…] [⋯]
Ideas for this spot │ Variations of C │ Notes                           Before Eb, at the start.
```

The chord details stay under Instruments (owner, 2026-11-17: the "directly under the track" idea was dropped).
On screen it's "Instruments"; the code can keep calling it `groove`. Owner's decisions: the song button
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
── ▸ Voicing ── / ── ▸ Instruments (the Chorus's) ── / ── chord details ──
```

Owner's decisions:
- **Shared song-wide**: key, tempo, time signature (the "C minor · 120 BPM · 4/4" button is the song's).
  **Per section**: chords, length (bars), instruments.
- **Repeats are linked**: two Chorus blocks are the same Chorus (edit once, every Chorus changes). "Make a new
  section from this" forks an independent copy ("Chorus 2").
- **The song area is on top**, between the toolbar and the chord track, collapsed by default (song first, then
  chords, then one chord).
- **Three tickets**, not one shot. T23, T24 and T25 are all done.

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

### T28 — The mix clips on drum hits (a real limiter)

- **Status:** ready (owner's call on the approach; it changes how playback sounds)
- **Session:** Opus · high effort · plan mode on (audio engine, measured levels)
- **Goal:** Playback and the WAV export never go over full scale, without changing the measured balance between
  parts or the overall loudness noticeably.
- **Done when:**
  - [ ] An offline render of dense presets (Pop and a few others) peaks at or under −1 dBFS: no clipped samples.
  - [ ] Loudness (the LUFS-style measure in `AGENTS.md`, Instruments → Levels) moves by under ~0.5 dB, or the
        presets' `mix` is re-measured to keep the targets.
  - [ ] `AGENTS.md` updated (the Export section's "Known" note, Levels).
- **Context:** found in T26. `makeGraph` in `audio.ts` uses `new Tone.Limiter(-1)`, which is a `Tone.Compressor`
  (ratio 20, attack 3 ms) that keeps Tone's default **30 dB soft knee**, so above −1 dBFS it barely limits. Measured
  with Pop (default groove) over 3 minutes: peak 1.64 (~+4.3 dBFS), ~9,000 samples over 1.0, all on drum hits
  (stems alone: chords 0.73, bass 0.30, drums 0.92). Browsers clip their output at ±1, so playback distorts there
  too; `encodeWav` clips the same way. Tried a hard knee (`Tone.Compressor({ threshold: -1, ratio: 20, knee: 0,
  attack: 0.003, release: 0.01 })`): peak 1.28, about +0.3 dB louder overall (the Web Audio compressor's automatic
  makeup gain); reverted. Options: a real brickwall (a `WaveShaper` soft clip after the compressor, or lower
  threshold + output trim to cancel the makeup gain), or lowering every preset's `mix` a few dB, or both. Measure
  with `renderAudio` (it renders the real graph offline in headless Chrome; the T26 spike drove it with
  playwright-core against the dev server, importing Tone from the same versioned URL as `audio.ts`). Owner
  listens: no crunch on kicks, nothing quieter or duller.

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

- T26 — Export audio (WAV) — 2026-11-17 — ⤓ Export menu (Audio (WAV) | MIDI, whole song / this section, mix or stems; parts that are off disabled; files named after the session, `exportFileName`); `renderAudio` renders offline in 1 s slices driving Tone's clock (`bouncePlan` pure, 3 min in ~7–11 s; Tone.Offline was quadratic, ~75 s), with a floating progress bar and Cancel; `wav.ts` 24-bit encoder, tail trimmed never before the last bar; e2e downloads a WAV and cancels one. Deviations: not Tone.Offline (speed, progress, cancel); MIDI files renamed after the session too. Also fixed the details hint's missing space. Found: the mix clips on drum hits (T28). Owner to listen: WAV matches playback (levels, swing, section sound switches), stems sum to the mix, Ableton import.
- T25 — Song MIDI, sessions window, phones — 2026-11-17 — `songMidi` (renderSegments, a marker per block) with a Whole song | This section menu; sessions-window ▶ plays the whole song (`previewSession` takes segments: synth per sound, level ramps) and the row lists its parts; e2e checks an arranged song at ten widths. Owner to check: song MIDI in Ableton (one arrangement, locators); hearing a song session (sound switches between sections). Not looked at in the browser pane (e2e only).
- T24 — Song timeline and song playback — 2026-11-17 — Song panel (`SongPanel.tsx`, `songOpen`): chips + ▶ Song + length in its bar, the song timeline in its body (blocks back to back, linked repeats outlined, drag chips in / blocks around with labels, ⌘D, Delete, ←/→, ⌥←/→, right-click menu; `useBlockDrag`, arrangement edits in `song.ts`); one transport with `playScope` (section or song), the chord track hides its playhead while another section sounds; audio plays segments (`segments.ts`) with one synth per sound and level ramps at block starts. Deviations: one `schedule` instead of `scheduleSong`; a block's "Make a new section from this" makes that block unique; seeking the other scope's ruler while playing doesn't switch playback. Also: T27 dropped (owner: chord details stay under Instruments), help text's stale idea-▶ line fixed. Owner to listen: section sound switches, no stuck notes, seeking mid-song, editing while the song plays.
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
