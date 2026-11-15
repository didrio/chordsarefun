# Tickets — chords

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T7 — Browser smoke tests · Sonnet · medium effort · plan mode off

## In progress

_None._

## Up next

### T7 — Browser smoke tests for drag, resize, playhead and keyboard editing

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** A small, fast set of real-browser tests for the flows unit tests can't see (pointer drags,
  resize handles, the ruler, keyboard shortcuts reaching the app), so regressions show up before the owner
  finds them.
- **Done when:**
  - [ ] `playwright-core` is a devDependency (no browser download); tests drive the installed Chrome
        (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on a Mac, `google-chrome` on Linux; an
        env var like `CHROME_PATH` overrides). They start their own `vite preview` (or dev server) on a free port.
  - [ ] `npm run e2e` runs them (a separate Vitest config, e.g. `vitest.e2e.config.ts` with `e2e/**/*.e2e.ts`,
        so `npm test` stays unit-only and fast). Not part of `npm run check` yet.
  - [ ] Covered, each starting from a seeded track (write `chords:v1:track` etc. to localStorage before load;
        see `persist.ts` / `track.ts` for the shape) and checked through the DOM (`.clip` `style.left/width`,
        `.selected`): drag a chord onto another's edge (reorder) and middle (swap); Option/Ctrl-drag copies;
        resize trims the neighbor; click the ruler moves the playhead; ⌘D duplicates; ⌥→ / Ctrl+→ nudges;
        ⌘Z undoes; double-click empty space adds a spot; the idea ▶ doesn't change the track.
  - [ ] `AGENTS.md` ("Verifying", "Conventions") says how to run them; optionally a CI job in
        `.github/workflows/ci.yml` (ubuntu has Chrome at `google-chrome`) if it's reliable.
- **Context:** "Verifying" in `AGENTS.md` describes the headless setup that was used by hand. Wait for `.track`
  before interacting. Pointer drags need real mouse moves (`page.mouse.down/move/up` with several steps; the
  drag threshold is 4px, `useChordDrag.ts`). Modifiers: the app picks Mac vs other keys from
  `navigator.platform` (`platform.ts`), so assert with the platform the test runs on. Audio needs a user
  gesture and can't be checked; ignore it. Keep the suite under ~20 s.

## Backlog

- Try T3's ⌘D on a full track: the copy shrinks to one grid step and the last chord is squeezed (the copy-drag
  rule). If that feels wrong in practice, alternatives: refuse, or split the duplicated chord in half. Owner's
  call.
- Phones: touch drags, resize handles and double-click-to-add are untested on a real device (T6 only fixed the
  layout). Probably needs long-press or a visible "add" affordance instead of double-click.
- Octave-specific note edits in the notes lane (e.g. doubling the bass), open/spread voicings. (Touches the
  chord model: Opus, plan mode.)
- Sampled instruments (a real piano) if the synth presets aren't enough.
- Per-clip pattern overrides, drum fills, more drum kits, humanize (timing/velocity).
- Should a new empty spot open on Ideas even when the sticky tab is Notes? (Owner's call; today the tab is
  sticky everywhere. Agent's view: keep one rule; an empty spot's Notes tab still works, by clicking keys.)
- The production bundle is ~680 kB (Tone.js); Vite warns about chunks over 500 kB. Lazy-loading Tone on the
  first user gesture would halve the first load, if load time ever matters.

## Done

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
