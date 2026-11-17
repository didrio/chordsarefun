import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { build, preview, type Plugin, type PreviewServer } from 'vite'
import { chromePath } from './harness.ts'

/**
 * The installable, offline app (T33), on a real production build: the service worker only exists there (dev
 * serves no sw.js). Builds into a scratch folder, serves it with `vite preview`, and rebuilds into the same
 * folder to play a deploy.
 */

const outDir = mkdtempSync(join(tmpdir(), 'chords-offline-'))

/** Marks a build in its page (`<meta name="build">`), so a "deploy" changes index.html and the worker's version. */
const mark = (id: string): Plugin => ({
  name: 'build-mark',
  transformIndexHtml: (html) => html.replace('</head>', `<meta name="build" content="${id}"></head>`),
})
/** A production build, as `npm run build` makes it: Vitest sets NODE_ENV to test, which Vite would keep. */
async function deploy(id: string) {
  const env = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    await build({ logLevel: 'error', plugins: [mark(id)], build: { outDir, emptyOutDir: true } })
  } finally {
    process.env.NODE_ENV = env
  }
}

let server: PreviewServer
let browser: Browser
let url: string
beforeAll(async () => {
  await deploy('one')
  server = await preview({ logLevel: 'error', preview: { port: 0, strictPort: false }, build: { outDir } })
  url = server.resolvedUrls!.local[0]
  browser = await chromium.launch({ executablePath: chromePath(), headless: true })
}, 60_000)
afterAll(async () => {
  await browser?.close()
  await server?.close()
  rmSync(outDir, { recursive: true, force: true })
})

const buildOf = (page: Page) => page.locator('meta[name="build"]').getAttribute('content')
// Browser code goes in as strings: this file is type-checked for Node, which has no DOM.
const controlled = (page: Page) =>
  page.waitForFunction('navigator.serviceWorker.controller !== null', undefined, { polling: 100 })

describe('offline and updates', () => {
  let context: BrowserContext
  afterAll(() => context?.close())

  it('opens with no connection after one visit', async () => {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    await page.goto(url)
    await page.waitForSelector('.track')
    await controlled(page)
    await context.setOffline(true)
    await page.reload()
    await page.waitForSelector('.track')
    expect(await buildOf(page)).toBe('one')
    // Not installed: no welcome, and the help popover says how to install.
    expect(await page.locator('.welcome-window').count()).toBe(0)
    expect(await page.locator('.help-foot').textContent()).toContain('Works offline')
  })

  it('a deploy reaches the next load, and an open tab offers to reload', async () => {
    const page = context.pages()[0]
    await context.setOffline(false)
    await deploy('two')
    // A tab left open: the worker is checked (as when the tab is shown again), the new one takes over.
    await page.evaluate('navigator.serviceWorker.getRegistration().then((r) => r.update())')
    await page.waitForSelector('.update-notice')
    expect(await buildOf(page)).toBe('one') // nothing reloaded by itself
    await page.getByRole('button', { name: 'Reload' }).click()
    await page.waitForSelector('.track')
    expect(await buildOf(page)).toBe('two')
    // One copy of the app is kept, the newest.
    expect(await page.evaluate<string[]>('caches.keys()')).toHaveLength(1)

    // The next deploy is there on a plain reload, before any worker update: the page always asks the server.
    await deploy('three')
    await page.reload()
    await page.waitForSelector('.track')
    expect(await buildOf(page)).toBe('three')
  })

  it('the installed app on empty storage explains where the sessions are, and imports a backup', async () => {
    const installed = await browser.newContext({ viewport: { width: 390, height: 844 } })
    // Act installed: display-mode standalone (can't be emulated otherwise).
    await installed.addInitScript(`{
      const real = window.matchMedia.bind(window)
      window.matchMedia = (q) => (q === '(display-mode: standalone)' ? { ...real(q), matches: true, media: q } : real(q))
    }`)
    const page = await installed.newPage()
    await page.goto(url)
    await page.waitForSelector('.welcome-window')
    expect(await page.locator('.help-foot').textContent()).toContain('this is the installed app')

    const track = { past: [], present: { clips: [], bars: 4, tonic: 'C', mode: 'ionian', sig: { beats: 4, unit: 4 } }, future: [] }
    const backup = {
      'chords:v1:sessions': JSON.stringify([{ id: 's1', name: 'Plane song', created: 1, updated: 2 }]),
      'chords:v1:session:s1:track': JSON.stringify(track),
    }
    await page.locator('.welcome-window input[type="file"]').setInputFiles({
      name: 'chords-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    })
    await page.waitForSelector('.welcome-window', { state: 'detached' })
    expect(await page.locator('.session-trigger').textContent()).toContain('Plane song')

    // Only the first launch: storage isn't fresh any more.
    await page.reload()
    await page.waitForSelector('.track')
    expect(await page.locator('.welcome-window').count()).toBe(0)
    await installed.close()
  })
})
