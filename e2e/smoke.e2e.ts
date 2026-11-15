import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { clips, CMD, COPY, drag, names, NUDGE, open, pointIn, seedTrack, startApp, stopApp, type App } from './harness.ts'

/** Four chords, one per bar: C F G Am. */
const full = () => seedTrack([{ chord: 'C', bar: 0 }, { chord: 'F', bar: 1 }, { chord: 'G', bar: 2 }, { chord: 'Am', bar: 3 }])
/** One C in the first bar, the rest of the track empty. */
const sparse = () => seedTrack([{ chord: 'C', bar: 0 }])

let app: App
let page: Page | undefined
beforeAll(async () => {
  app = await startApp()
})
afterAll(() => stopApp(app))

/** Each test gets a fresh browser context with its own saved track. */
async function start(history: unknown) {
  await page?.context().close()
  const fresh = await open(app, history)
  page = fresh
  return fresh
}
afterAll(() => page?.context().close())

describe('dragging', () => {
  it("dropping on a chord's edge reorders", async () => {
    const p = await start(full())
    // C onto the right edge of G: F G C Am.
    await drag(p, await pointIn(p, 0, 0.5), await pointIn(p, 2, 0.92))
    expect(await names(p)).toEqual(['F', 'G', 'C', 'Am'])
  })

  it("dropping on a chord's middle swaps", async () => {
    const p = await start(full())
    await drag(p, await pointIn(p, 0, 0.5), await pointIn(p, 2, 0.5))
    expect(await names(p)).toEqual(['G', 'F', 'C', 'Am'])
  })

  it('copy-drag copies instead of moving', async () => {
    const p = await start(full())
    // A copy dropped on F's middle replaces F; the original C stays.
    await drag(p, await pointIn(p, 0, 0.5), await pointIn(p, 1, 0.5), COPY)
    expect(await names(p)).toEqual(['C', 'C', 'G', 'Am'])
  })
})

describe('resizing', () => {
  it("a longer chord trims its neighbor and doesn't move the far end", async () => {
    const p = await start(full())
    const before = await clips(p)
    const handle = await p.locator('.track .clip').nth(0).locator('.handle.end').boundingBox()
    if (!handle) throw new Error('No handle')
    const y = handle.y + handle.height / 2
    const x = handle.x + handle.width / 2
    const half = (before[0].right - before[0].left) / 2
    await drag(p, [x, y], [x + half, y])
    const after = await clips(p)
    expect(after[0].right).toBeGreaterThan(before[0].right + half * 0.6)
    expect(after[1].left).toBeGreaterThan(before[1].left + half * 0.6)
    expect(after[1].right).toBeCloseTo(before[1].right, 0)
    expect(after[2].left).toBeCloseTo(before[2].left, 0)
  })
})

describe('playhead', () => {
  it('clicking the ruler moves it there', async () => {
    const p = await start(full())
    const ruler = await p.locator('.ruler').boundingBox()
    if (!ruler) throw new Error('No ruler')
    const x = ruler.x + ruler.width / 2 // the start of bar 3 (a grid point)
    await p.mouse.click(x, ruler.y + ruler.height / 2)
    const line = await p.locator('.track .playhead').boundingBox()
    expect(Math.abs((line?.x ?? -999) - x)).toBeLessThan(4)
  })
})

describe('keyboard editing', () => {
  it('⌘D duplicates the selection and ⌘Z undoes it', async () => {
    const p = await start(full())
    await p.mouse.click(...(await pointIn(p, 0, 0.5)))
    expect((await clips(p))[0].selected).toBe(true)
    await p.keyboard.press(`${CMD}+d`)
    const dup = await names(p)
    expect(dup).toHaveLength(5)
    expect(dup.slice(0, 2)).toEqual(['C', 'C'])
    await p.keyboard.press(`${CMD}+z`)
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
  })

  it('⌥→ / Ctrl+→ nudges a chord into empty space', async () => {
    const p = await start(sparse())
    await p.mouse.click(...(await pointIn(p, 0, 0.5)))
    const before = (await clips(p))[0]
    await p.keyboard.press(`${NUDGE}+ArrowRight`)
    const after = (await clips(p))[0]
    expect(after.left).toBeGreaterThan(before.left + 1)
    expect(after.right - after.left).toBeCloseTo(before.right - before.left, 0)
  })
})

describe('adding and previewing', () => {
  it('double-clicking empty space adds a spot', async () => {
    const p = await start(sparse())
    const track = await p.locator('.track').boundingBox()
    if (!track) throw new Error('No track')
    await p.mouse.dblclick(track.x + track.width * 0.7, track.y + track.height / 2)
    expect(await names(p)).toEqual(['C', '?'])
  })

  it("an idea's ▶ doesn't change the track", async () => {
    const p = await start(full())
    await p.mouse.click(...(await pointIn(p, 1, 0.5)))
    const before = await clips(p)
    const hear = p.locator('.card-hear').first()
    await hear.waitFor()
    await hear.click()
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
    expect((await clips(p)).map((c) => [c.left, c.right])).toEqual(before.map((c) => [c.left, c.right]))
  })
})

describe('layout at every width', () => {
  // Phones (smallest first), the widths between phone and desktop (where the toolbar wraps), tablet, laptop.
  for (const width of [320, 360, 375, 430, 600, 640, 768, 1024, 1280]) {
    it(`${width}px: nothing runs off-screen, the Progressions menu included`, async () => {
      const p = await start(full())
      await p.setViewportSize({ width, height: 900 })
      // As a string: this file is type-checked for Node, which has no `document`.
      const overflow = () => p.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')
      expect(await overflow()).toBeLessThanOrEqual(0)
      await p.locator('.progression-menu .dropdown-trigger').click()
      const panel = await p.locator('.progression-panel').boundingBox()
      if (!panel) throw new Error('No Progressions panel')
      expect(panel.x).toBeGreaterThanOrEqual(0)
      expect(panel.x + panel.width).toBeLessThanOrEqual(width)
      expect(await overflow()).toBeLessThanOrEqual(0)
    })
  }
})

describe('phone header', () => {
  it('is three rows that never re-wrap: logo, session + MIDI, key + tempo + timing', async () => {
    const p = await start(full())
    for (const width of [320, 360, 375, 430, 600]) {
      await p.setViewportSize({ width, height: 800 })
      const top = async (selector: string) => Math.round((await p.locator(selector).boundingBox())!.y)
      const [session, midi] = [await top('.session-trigger'), await top('.midi-menu .dropdown-trigger')]
      const [key, tempo, timing] = [await top('.home-menu .dropdown-trigger'), await top('.tempo-field'), await top('.timing-menu .dropdown-trigger')]
      expect(Math.abs(session - midi), `${width}px: session and MIDI share a row`).toBeLessThan(4)
      expect(Math.abs(key - tempo), `${width}px: key and tempo share a row`).toBeLessThan(4)
      expect(Math.abs(key - timing), `${width}px: key and timing share a row`).toBeLessThan(4)
      expect(key, `${width}px: the key row is under the session row`).toBeGreaterThan(session + 20)
    }
  })
})

describe('finding the next step', () => {
  it('with no chord open, the details area says to click one; clicking one opens its ideas', async () => {
    const p = await start(full())
    await p.locator('.details-hint').waitFor()
    await p.mouse.click(...(await pointIn(p, 1, 0.5)))
    await p.locator('.details-panel .ideas-grid').waitFor()
    expect(await p.locator('.details-hint').count()).toBe(0)
  })
})
