# chords are fun

**https://chordsarefun.com** — make chord progressions by ear, no theory needed: ideas for every chord, ~180
progressions by feel, song sections, and MIDI or WAV export. Static site, no backend, no accounts: sessions are
saved in the browser.

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

- `src/music/` – timeline/editing rules, theory, ideas, audio (Tone.js), MIDI and WAV export
- `src/components/` – the UI (track, chord details, progression and session windows, instruments, export…)
- `src/*.ts` – undo history, persistence, selection, shortcuts, drag labels (all tested)
- `src/App.tsx` – app state, wiring, and layout

## Deploy

Pushing to `main` deploys to Cloudflare: Workers Builds runs `npm run build`, then
`npx wrangler deploy` (`wrangler.jsonc` serves `dist`). GitHub Actions
(`.github/workflows/ci.yml`) runs `npm run check` (lint, tests, typecheck, build) on
every push to `main` and on pull requests; it doesn't deploy.

`public/` holds the share image, icons, manifest, `robots.txt`, `sitemap.xml` and `_headers` (cache and security
headers for Cloudflare). See AGENTS.md → Site basics.

## License

All rights reserved (see [LICENSE](LICENSE)). The code is public to read, not to reuse. Third-party libraries keep
their own licenses; the site ships their notices at `/licenses.txt`.
