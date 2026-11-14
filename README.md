# Chords

A browser-based chord progression helper. Static site, no backend.

## Stack

- **Vite + React + TypeScript**
- **[Tonal](https://github.com/tonaljs/tonal)** for music theory (keys, modes, chords)
- **[Tone.js](https://tonejs.github.io/)** for playback (wraps the Web Audio API)
- **[@tonejs/midi](https://github.com/Tonejs/Midi)** for MIDI file export
- **Vitest** for tests

## Scripts

```sh
npm run dev      # dev server
npm test         # unit tests
npm run build    # typecheck + production build to dist/
npm run preview  # serve the production build locally
npm run lint
```

## Layout

See [AGENTS.md](AGENTS.md) for product behavior, design decisions, and architecture.

- `src/music/` – timeline/editing rules, theory, audio (Tone.js), MIDI export
- `src/components/` – Timeline, Palette, drag hook, time signature control
- `src/*.ts` – undo history, persistence, selection, shortcuts, drag labels (all tested)
- `src/App.tsx` – app state, wiring, and layout

## Deploy

Pushing to `main` deploys to Cloudflare: Workers Builds runs `npm run build`, then
`npx wrangler deploy` (`wrangler.jsonc` serves `dist`). GitHub Actions
(`.github/workflows/ci.yml`) runs `npm run check` (lint, tests, typecheck, build) on
every push to `main` and on pull requests; it doesn't deploy.
