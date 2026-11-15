# Tickets — chords

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T10 — Key-change notice without moving the track · Sonnet · medium · plan mode off. (T8's `e2e` job was green on GitHub. T9 added layout tests that have only run on a Mac: if the `e2e` job is red after T9's push, fix that first.)

## In progress

_None._

## Up next

### T10 — Key-change notice without moving the track

**Session:** Sonnet · medium · plan mode off

**Why:** changing the key shows the "The key is now C minor… Reshape chords / Keep them" notice between the
toolbar and the timeline, which pushes the track and everything under it down ~44px, and back up when it's
dismissed. That breaks the app's own rule (AGENTS.md, "Layouts must not jump"). Found in T9's UI/UX pass.

**Goal:** the notice appears and leaves without anything else on the page moving, and it's still obviously about
the key change you just made.

**Recommended approach (owner may prefer another):** a floating bar pinned to the bottom-center of the window
(`position: fixed`), same text and the same two buttons. Nothing reflows, and it's visible wherever the page is
scrolled (on phones the track may be off-screen when the Key sheet closes). Alternatives considered: reserving
an always-empty row above the track (wastes 44px for a notice that's rarely there); showing it in the dashed
`details-hint` slot (usually hidden, since a chord's details are open most of the time).

**Where:** `src/components/HomeNotice.tsx`; where it's rendered in `src/App.tsx` (`activeOffer && <HomeNotice …>`,
between `.main-toolbar` and `.panels`); `.home-notice` in `src/index.css`. The offer logic (`homeOffer`,
`activeOffer`, `moveChordsHome`) doesn't change.

**Done when:**
- [ ] Changing the key doesn't move the track, the Voicing panel or the chord details by a pixel (compare
      `.track`'s `getBoundingClientRect().top` before and after; add that as an `e2e` case).
- [ ] The notice never covers the chord details' header or the track on a 1280x800 window; on a 375px phone it
      spans the width with both buttons reachable.
- [ ] It still goes away when the chords are edited, the offer is taken, or "Keep them" is clicked (unchanged
      rules), and clicking it doesn't deselect the chord (`KEEPS_SELECTION` in `App.tsx` covers `button` only:
      check the bar's own background).
- [ ] `AGENTS.md` (Home, Visual design) says where the notice lives now.

**Pitfall:** don't let it sit on top of the drag ghost or dropdown panels (`z-index`: dropdowns are 20, the help
tip 30, the drag ghost 10).

## Backlog

- Try T3's ⌘D on a full track: the copy shrinks to one grid step and the last chord is squeezed (the copy-drag
  rule). If that feels wrong in practice, alternatives: refuse, or split the duplicated chord in half. Owner's
  call.
- Phones: touch drags, resize handles and double-click-to-add are untested on a real device (T6 and T9 only
  fixed the layout, checked in desktop Chrome's phone emulation). Probably needs long-press or a visible "add"
  affordance instead of double-click.
- Phones narrower than ~400px hide the word "Key" on the key button (T9), so the longest name ("F# Mixolydian")
  fits beside tempo and timing. Owner's call: if "Key" should always show, remove the `@container` rule in the
  phone block of `index.css` and accept "Key F# Mi…" for long names.
- Octave-specific note edits in the notes lane (e.g. doubling the bass), open/spread voicings. (Touches the
  chord model: Opus, plan mode.)
- Sampled instruments (a real piano) if the synth presets aren't enough.
- Per-clip pattern overrides, drum fills, more drum kits, humanize (timing/velocity).
- Should a new empty spot open on Ideas even when the sticky tab is Notes? (Owner's call; today the tab is
  sticky everywhere. Agent's view: keep one rule; an empty spot's Notes tab still works, by clicking keys.)
- The production bundle is ~680 kB (Tone.js); Vite warns about chunks over 500 kB. Lazy-loading Tone on the
  first user gesture would halve the first load, if load time ever matters.

## Done

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
