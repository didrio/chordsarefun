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

- `src/music/theory.ts` – diatonic chords, roman numerals, voicings (pure, tested)
- `src/music/audio.ts` – Tone.js playback
- `src/music/midi.ts` – MIDI export
- `src/App.tsx` – UI

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds, and
deploys to GitHub Pages. One-time setup: in the repo's **Settings → Pages**, set
**Source** to **GitHub Actions**.
