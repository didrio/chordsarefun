# Tickets — chords

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T22 — chord details rework (Sonnet · medium · plan off). It reuses T21's `ChordMenu` for the ⋯ and Clear. If the `e2e` CI job is red, fix that first.

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
T16–T21 are done.

### T22 — Chord details rework

- **Status:** ready (T21's `ChordMenu` is in; open it from the header's ⋯ with `chordMenuGroups` in `App.tsx`)
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
- Progression browser on phones: picking a genre chip that's scrolled off to the right doesn't scroll it into view
  (the sessions window's folder chips behave the same). Small `scrollIntoView` on the active chip.
- The production bundle is ~680 kB (Tone.js); Vite warns about chunks over 500 kB. Lazy-loading Tone on the
  first user gesture would halve the first load, if load time ever matters.

## Done

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
