---
name: ticket
description: Capture or change future work in TICKETS.md without doing it now — add a ticket, edit, split, merge, reorder, block, or move ideas between Backlog and Up next. Use for "/ticket …", "make a ticket for that", "add this to the backlog", "move T7 before T5".
argument-hint: '[add <idea> | edit Tn … | move Tn … | backlog <idea>]'
---

# Manage tickets

Request: `$ARGUMENTS`

Edit `TICKETS.md` (format at the top of that file), then go straight back to the current work. This is
bookkeeping, not a new task.

- **Add**: next unused number (never reuse). If there's enough to act on, put it in **Up next** with Status,
  Session (see the table in the `wrap` skill), Goal, Done when, and Context: everything you know right now that
  a fresh session would otherwise have to rediscover (files, decisions, constraints, how to test). If it's just
  an idea, a single line in **Backlog** is fine.
- **Edit / split / merge**: keep each ticket a session-sized piece of work, roughly one coherent change a
  reviewer could take in at once.
- **Reorder**: **Up next** is in the order to do them. If the top changes, update the **Next:** line too.
- **Block**: `Status: blocked — <what it's waiting on>`.

Confirm in one line what changed (e.g. "Added T9 — Drum fills, after T7").
