import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { buildVersion, precacheList, serviceWorkerSource } from './src/serviceWorker.ts'

/** Every file under `dir`, as paths relative to it with `/`. */
function filesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
}

/**
 * Writes `sw.js` (the offline copy of the app, src/serviceWorker.ts) next to the finished build: it lists every
 * built file and is versioned by their contents, so each deploy that changes anything is a new worker (T33).
 */
function serviceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'chords-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir.startsWith('/') ? config.build.outDir : join(config.root, config.build.outDir)
    },
    closeBundle() {
      const files = filesIn(outDir).filter((f) => f !== 'sw.js')
      const precache = precacheList(files)
      const version = buildVersion(files.map((path) => ({ path, bytes: readFileSync(join(outDir, path)) })))
      writeFileSync(join(outDir, 'sw.js'), serviceWorkerSource(precache, version))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  // Relative asset paths so the build works on any static host
  // (GitHub Pages project sites, Cloudflare Pages, etc.).
  base: './',
  // Always the same port: the browser stores saved sessions per origin (including the
  // port), so a different port would look like all your sessions were gone. strictPort
  // fails loudly if it's taken instead of silently moving to the next port.
  server: { port: 5173, strictPort: true },
  // The bundled libraries' licenses (MIT: Tone.js, Tonal, @tonejs/midi, React) must ship with the code.
  // Served at /licenses.txt (.txt so browsers show it) and linked from the help popover.
  build: { license: { fileName: 'licenses.txt' } },
})
