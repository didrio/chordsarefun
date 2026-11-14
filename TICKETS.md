# Tickets — chords

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T2 — Hear an idea in context · Opus · high effort · plan mode on

## In progress

_None._

## Up next

### T2 — Hear an idea in context

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Before using an idea (or a flavor), hear it where it would sit: previous chord → the idea → next
  chord, without changing the track. Today clicking an idea uses it right away (undo restores), so comparing
  three ideas means use, listen, undo, repeat.
- **Done when:**
  - [ ] Idea cards (Ideas tab) and flavor cards (Flavors tab) have a way to hear them in context that doesn't
        touch the track; clicking a card still uses it, as now (`AGENTS.md`: "Ideas are clicked in").
  - [ ] It plays the previous chord, the idea, then the next chord: empty spots skipped; at the start there's no
        "previous"; at the end of a looping track "next" is the chord the loop returns to (`spot.loopTo`).
  - [ ] It sounds like the track (chord sound + bass note when the Bass part is on), the idea in the track's
        octave (`fitOctave`), and does nothing while the transport plays (like other previews).
  - [ ] Any new sequencing logic is a pure function with a test; `AGENTS.md` (inspector section) and the help
        popover mention it.
- **Context:**
  - Cards: `SpotIdeas` and `Flavors` in `src/components/ChordInspector.tsx`; the spot (`prev`, `next`,
    `loopTo`) comes from `spotOf` in `src/App.tsx`, and `onPreview(chord, fresh)` already octave-fits fresh
    chords.
  - Reuse `previewProgression(chords, seconds)` in `src/music/audio.ts`: the Progressions menu's ▶ already
    plays a chord list without touching the track (`hearProgression` in `App.tsx`, capped at
    `MAX_PREVIEW_SECONDS` per chord). Check how it voices chords and whether it plays the bass part.
  - Open questions for the plan: a small ▶ on each card (always visible, or on hover/focus; keyboard reachable)
    vs. another gesture; how long each chord plays (a beat? half a bar? capped like progressions); whether the
    idea's own card ▶ should also exist on the Flavors tab (probably yes, same rule).
  - Layout must not jump: the ▶ can't resize cards.
  - Audio can't be verified by the agent: tell the owner what to listen to.

### T3 — Duplicate (⌘D) and nudge chords with the keyboard

- **Status:** ready — confirm the two proposed rules with the owner at the start
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** DAW-style keyboard editing: ⌘D / Ctrl+D duplicates the selected chords, and a modifier + ←/→ nudges
  them by one grid step.
- **Done when:**
  - [ ] **⌘D / Ctrl+D** (proposed): duplicates the selection as one block (lengths kept) right after the last
        selected chord, making room exactly like a copy-drag dropped on that chord's right edge (edge drops insert
        and make room; invalid = nothing happens). The copies end up selected and inspected. One undo step. The
        browser's ⌘D (bookmark) is prevented.
  - [ ] **⌥←/→ / Alt+←/→** (proposed; plain ←/→ already step between chords): moves the selected block one grid
        step (one beat with the grid off) into empty space only: never overlaps, never pushes, never leaves the
        track; if there's no room, nothing happens. One undo step per press.
  - [ ] Rules are pure functions in `src/music/timeline.ts` with tests, including the every-custom-time-signature
        invariants in `timeline.test.ts`; keys in `src/shortcuts.ts` (+ test).
  - [ ] Shortcut table in `AGENTS.md` and `KEYS` in `src/components/HelpTip.tsx` updated.
- **Context:** Copy-drag already plans group copies (`planDrop` / `planGroupDrop` with `copy` in
  `src/music/timeline.ts`; `copyIds` set up in `onClipPointerDown` in `App.tsx`), so ⌘D should reuse it rather
  than add a new insert rule. `stepGrid` gives grid steps that never skip bar lines. Selection helpers are in
  `src/selection.ts`; shortcut → action in `src/shortcuts.ts`, executed in `App.tsx`'s key handler (which ignores
  keys while typing and inside `.dropdown`). Check `platform.ts` so the nudge modifier doesn't clash with the drag
  modifiers (copy: Option/Ctrl; ignore grid: ⌘/Alt). Pitfall: on Windows Alt+← / Alt+→ is the browser's Back /
  Forward; either `preventDefault` it reliably or use Ctrl+←/→ there (decide with the owner).

### T4 — Remove the unused palette code

- **Status:** blocked — owner confirms the palette and Spice row aren't coming back
- **Session:** Sonnet · low effort · plan mode off
- **Goal:** Delete the UI code the palette removal left behind, so the codebase matches the app.
- **Done when:**
  - [ ] Unused components, helpers, tests and CSS are gone; `npm run check` passes; `AGENTS.md` no longer lists
        them (see "Adding chords" and the Architecture list).
- **Context:** `AGENTS.md` ("Adding chords") lists `Palette.tsx` (+ `SpiceRow`), `diatonicChords` and the
  `.chord-picker` CSS as unused; also check `.palette*` / `.spice-*` / `.key-hint` CSS and `useChordDrag`'s
  new-chord path. **Keep `spiceChords`**: `suggest.ts` uses it for the "Add color" ideas. Grep every name before
  deleting; delete tests only with the code they test.

## Backlog

- Browser (Playwright) tests for drag, resize and playhead flows, now that the layout settled (T1); see "Verifying"
  in `AGENTS.md` for the `playwright-core` + installed Chrome setup.
- Octave-specific note edits in the notes lane (e.g. doubling the bass), open/spread voicings.
- Sampled instruments (a real piano) if the synth presets aren't enough.
- Per-clip pattern overrides, drum fills, more drum kits, humanize (timing/velocity).
- Phone/tablet layout: the app is desktop-first; below ~800px is untested.
- Should a new empty spot open on Ideas even when the sticky tab is Notes? (Owner's call; today the tab is
  sticky everywhere.)

## Done

- T1 — UI redesign — 2026-11-14 — chord details as a header + Ideas / Flavors / Notes tabs, song bar + Ableton-style
  transport bar (Config menu gone, "Key" on screen), empty-track start buttons, one type scale and button weights
  (8aabdc1…187a571).
- T5 — Ticket workflow — 2026-11-14 — `/start`, `/wrap`, `/ticket` skills and this file (adapted from
  mobile/base, minus its base backport), `npm run check`, shared `.claude/settings.json`; old roadmap moved here.
