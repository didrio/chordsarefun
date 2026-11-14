---
name: wrap
description: End a work session — final quality pass, update TICKETS.md (outcomes, handoff notes, new or reordered tickets, next pick with recommended model/effort/plan mode), commit and push (pushing main deploys the site), and print the steps for the next session. Only when the user types /wrap.
disable-model-invocation: true
---

# Wrap a session

The next session starts with only `AGENTS.md`, `TICKETS.md` and git history. Make them enough.

The user typing `/wrap` is the go-ahead to commit and push, including to `main`, which deploys the live site
(the GitHub Pages workflow tests, builds and deploys on every push to `main`; Cloudflare builds from the repo
too). Don't ask again; do say in the hand-off that it deployed.

## 1. Final pass

- `npm run check` passes (lint, tests, typecheck + production build). Fix what it reports, or stop and tell the
  user why you can't. Never push a red check: the deploy would fail (or ship something broken).
- UI changed: look at the screens that changed in a real browser (the browser pane with `npm run dev`, or headless
  Chrome as in "Verifying" in `AGENTS.md`). Check that nothing jumps (fixed heights, anchored controls) and that a
  narrow window (~900px) still works. The user tries changes right after the session, so keep this quick.
- Audio changed (sounds, patterns, levels, timing, previews): you can't hear it. List in the hand-off exactly what
  the user should listen to. New sounds, drum voices or presets are level-matched by measurement, not by ear (see
  "Levels are measured" in `AGENTS.md`).
- Review `git diff`: no debug logging, stray files, commented-out code, secrets, or TODOs you meant to finish.
- `AGENTS.md` must describe how the app behaves now (it says so itself: same change). Update the matching
  sections, the architecture list and the design decisions if anything changed.

## 2. Update TICKETS.md (the most important step)

- **Finished tickets** → move to **Done** as one line: `T5 — Title — YYYY-MM-DD — what changed, in a phrase`.
- **Unfinished tickets** → stay in **Up next** with an updated status and a **Handoff** bullet: what's done,
  what's left, where (files), gotchas, how to verify.
- **New work discovered** → new tickets with the next unused number (never reuse numbers). Write them so a fresh
  agent can start without re-investigating: goal, done-when checklist, the files and decisions involved, pitfalls,
  how to test. Vague ideas go to **Backlog** instead.
- Re-read **Up next** top to bottom: reorder by what should happen next; merge, split or rewrite stale tickets.
- Set the **Next:** line at the top to the recommended ticket and its session settings (table below). Every ticket
  in **Up next** has a **Session** line.
- Keep the file lean: if **Done** grows past ~30 lines, move the oldest lines to `docs/tickets-archive.md`.

### Choosing session settings

Goal: the best ratio of quality to cost and time. Pick the **cheapest row that will still get it right**.

| Ticket shape                                                                     | Model  | Effort     | Plan mode |
| -------------------------------------------------------------------------------- | ------ | ---------- | --------- |
| Architecture, data model, big redesign, ambiguous product or UX questions        | Opus   | extra high | on        |
| New feature across several parts of the UI; audio engine or scheduling; hard bugs | Opus   | high       | on        |
| Well-specified feature or fix: the ticket already says what and where            | Sonnet | medium     | off       |
| Small UI/copy/styling tweaks, chores, docs                                       | Sonnet | low        | off       |

- A detailed ticket (files, decisions, how to verify) is what lets a cheaper session do the job well. Write it.
- Torn between two rows: go higher for things that are expensive to change later (the chord/track model, saved
  data and its migrations, editing rules, the audio engine), lower for everything else.

## 3. Commit and push

- Stage everything that belongs to the session's work (`git status` must end clean, apart from intentionally
  untracked local files such as `.claude/settings.local.json`).
- Message: `T5: <summary>` (several tickets: `T5, T6: …`; no ticket: a plain summary), then short bullets of what
  changed, then the attribution trailer your harness asks for.
- Commit on the current branch. If the branch has an upstream (`git rev-parse --abbrev-ref @{u}` succeeds), push.
  Otherwise skip pushing and say so in one line. If the push is rejected because the remote moved, `git pull
  --rebase`, re-run `npm run check`, then push; stop and tell the user if the rebase conflicts.

## 4. Hand off

End your reply with exactly this shape (fill in the values):

```
✓ Wrapped T5 — <title> (<short hash>, pushed: deploying to the live site)

Next session:
1. /clear
2. Model: <Opus|Sonnet> · Effort: <low|medium|high|extra high> · Plan mode: <on|off>
3. /start T6 — <title>
```

Adjust the first line when nothing was pushed (no upstream, or not on `main`: "pushed to <branch>, not deployed").
Add at most two lines for anything the user must do before then (e.g. "listen to the new Bossa preset",
"decide X — it's in T6's open questions"). Then stop: the session is over.
