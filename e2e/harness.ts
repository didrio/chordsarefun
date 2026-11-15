import { existsSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'

/** The installed Chrome (no browser download). `CHROME_PATH` overrides. */
export function chromePath(): string {
  const found =
    process.env.CHROME_PATH ??
    ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(existsSync)
  if (!found) throw new Error('No Chrome found: set CHROME_PATH to its executable.')
  return found
}

/** The app's Mac-vs-other modifier choice follows the platform the tests run on (platform.ts). */
export const MAC = process.platform === 'darwin'
export const COPY = MAC ? 'Alt' : 'Control'
export const NUDGE = MAC ? 'Alt' : 'Control'
export const CMD = MAC ? 'Meta' : 'Control'

export type App = { server: ViteDevServer; browser: Browser; url: string }

/** Starts the app's own dev server on a free port, plus a headless Chrome. */
export async function startApp(): Promise<App> {
  const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' })
  await server.listen()
  const url = server.resolvedUrls?.local[0]
  if (!url) throw new Error('Dev server did not report a URL')
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true })
  return { server, browser, url }
}

export async function stopApp(app: App | undefined) {
  await app?.browser.close()
  await app?.server.close()
}

const BAR = 1920 // 4/4 at 480 ticks per quarter

type Seed = { chord: string; bar: number; bars?: number }
const CHORDS: Record<string, { root: string; type: string }> = {
  C: { root: 'C', type: '' },
  F: { root: 'F', type: '' },
  G: { root: 'G', type: '' },
  Am: { root: 'A', type: 'm' },
}

/** A 4-bar track in C major; each chord starts on a bar and lasts `bars` bars (default 1). */
export function seedTrack(chords: Seed[]) {
  const clips = chords.map((s, i) => ({
    id: `seed${i}`,
    chord: { ...CHORDS[s.chord], add: [], omit: [], inversion: 0 },
    start: s.bar * BAR,
    length: (s.bars ?? 1) * BAR,
  }))
  return { past: [], present: { clips, bars: 4, tonic: 'C', mode: 'ionian', sig: { beats: 4, unit: 4 } }, future: [] }
}

/** Opens the app in a fresh browser context with this track already saved, and waits for it. */
export async function open(app: App, history: unknown): Promise<Page> {
  const context = await app.browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addInitScript((h) => localStorage.setItem('chords:v1:track', JSON.stringify(h)), history)
  const page = await context.newPage()
  await page.goto(app.url)
  await page.waitForSelector('.track')
  return page
}

export type ClipInfo = { name: string; left: number; right: number; selected: boolean }

/** Every clip on the track, left to right, from the DOM (positions in px). */
export function clips(page: Page): Promise<ClipInfo[]> {
  return page.$$eval('.track .clip', (els) =>
    els
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { name: el.querySelector('.symbol')?.textContent ?? '', left: r.left, right: r.right, selected: el.classList.contains('selected') }
      })
      .sort((a, b) => a.left - b.left),
  )
}

export const names = async (page: Page) => (await clips(page)).map((c) => c.name)

/** A real pointer drag (several moves, past the 4px threshold), optionally holding a modifier key. */
export async function drag(page: Page, from: [number, number], to: [number, number], hold?: string) {
  if (hold) await page.keyboard.down(hold)
  await page.mouse.move(...from)
  await page.mouse.down()
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps)
  }
  await page.mouse.up()
  if (hold) await page.keyboard.up(hold)
}

/** Point inside a clip: `fx` is the fraction of its width, at mid height. */
export async function pointIn(page: Page, index: number, fx: number): Promise<[number, number]> {
  const box = await page.locator('.track .clip').nth(index).boundingBox()
  if (!box) throw new Error(`No clip ${index}`)
  return [box.x + box.width * fx, box.y + box.height / 2]
}
