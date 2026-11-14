@AGENTS.md

## Claude Code specifics

- Session workflow: `/start [Tn]` → work → `/wrap` (both only run when the user types them), `/ticket` to capture
  work for later. When wrapping, recommend the next session's model (Opus / Sonnet), effort (low / medium /
  high / extra high) and plan mode using the table in `.claude/skills/wrap/SKILL.md`.
- `/wrap` commits and pushes; pushing `main` deploys the live site (GitHub Pages, Cloudflare). That's expected.
- Look at UI changes in the browser pane (run `npm run dev` in the background, then open `http://localhost:5173`).
- Don't spawn subagents for work you can do directly; they start cold and cost more.
- Permissions: routine checks and read-only git commands are pre-allowed in `.claude/settings.json`.
