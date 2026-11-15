# Tickets — chords

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** none queued. First check the `e2e` job is green on GitHub; if it flakes, fix the test. Then promote a Backlog item with `/ticket`.

## In progress

_None._

## Up next

_None. Pick from Backlog (or `/ticket` something new)._

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
