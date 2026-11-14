---
name: start
description: Begin a work session from TICKETS.md — orient cheaply, then work on the given ticket (/start T5) or recommend the next one (/start). Only when the user types /start.
argument-hint: '[ticket, e.g. T5]'
disable-model-invocation: true
---

# Start a session

Requested ticket: `$ARGUMENTS` (empty = none given).

The previous session's agent already did the expensive thinking and wrote it into `TICKETS.md`. Trust it, and
spend this session's context on the work, not on re-investigating the project.

## 1. Orient (keep it cheap)

- Read `TICKETS.md`. (`AGENTS.md` is already loaded.)
- `git status --short` and `git log --oneline -5`. Uncommitted changes mean a previous session didn't wrap: ask
  whether they belong to this ticket before touching anything.
- Don't explore the codebase broadly. Read only what the ticket's **Context** points to, plus what the work
  turns out to need.

## 2. Pick the ticket

- **Ticket given:** use it. If it doesn't exist or is `blocked`, say so and suggest the **Next** ticket.
- **No ticket given:** show the **Next** ticket in three lines (goal, done-when, recommended session settings),
  plus one or two alternatives from "Up next", and wait for the user to choose.
- If the ticket's **Session** line recommends different settings from what this session is clearly running
  (e.g. plan mode is off but the ticket says on), mention it once and continue unless the user switches.

## 3. Begin

1. Move the ticket to **In progress** in `TICKETS.md` (status `in progress`).
2. Restate the goal and the **Done when** checklist in your own words, plus open questions, if any.
3. In plan mode: research what's needed, then present the plan for approval. Otherwise: outline the approach in
   three to five bullets and start.
4. UI work: get the dev server running early (`npm run dev`, in the background, or the browser pane's preview)
   so you can look at your changes as you go (see "Verifying" in `AGENTS.md`).

## 4. During the session

- Keep the user oriented. After each milestone, say what's done and what's left, and suggest the next step:
  continue, `/ticket` to capture an idea for later, or `/wrap` when the ticket is done.
- Scope creep: propose splitting new work into a ticket (`/ticket`) instead of silently growing this one.
- Follow the conventions in `AGENTS.md` (pure, tested modules; keep `AGENTS.md` current in the same change).
  `/wrap` re-checks them, but don't leave it all to the end.
