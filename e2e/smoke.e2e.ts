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
  it('is two rows that never re-wrap: logo + session, then the song button + MIDI', async () => {
    const p = await start(full())
    for (const width of [320, 360, 375, 430, 600]) {
      await p.setViewportSize({ width, height: 800 })
      const top = async (selector: string) => Math.round((await p.locator(selector).boundingBox())!.y)
      const [logo, session] = [await top('.logo-icon'), await top('.session-trigger')]
      const [song, midi] = [await top('.song-menu .dropdown-trigger'), await top('.midi-menu .dropdown-trigger')]
      expect(Math.abs(logo - session), `${width}px: logo and session share a row`).toBeLessThan(12)
      expect(Math.abs(song - midi), `${width}px: song button and MIDI share a row`).toBeLessThan(4)
      expect(song, `${width}px: the song row is under the session row`).toBeGreaterThan(session + 20)
      // The popover opens as a sheet that stays on screen.
      await p.locator('.song-menu .dropdown-trigger').click()
      const panel = await p.locator('.song-panel').boundingBox()
      if (!panel) throw new Error('No song popover')
      expect(panel.x, `${width}px: popover on screen (left)`).toBeGreaterThanOrEqual(0)
      expect(panel.x + panel.width, `${width}px: popover on screen (right)`).toBeLessThanOrEqual(width)
      await p.keyboard.press('Escape')
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

describe('key-change notice', () => {
  it('floats: showing and dismissing it never moves the track, and clicking it keeps the selection', async () => {
    const p = await start(full())
    await p.mouse.click(...(await pointIn(p, 1, 0.5)))
    const top = () => p.evaluate<number>("document.querySelector('.track').getBoundingClientRect().top")
    const before = await top()
    await p.locator('.song-menu .dropdown-trigger').click()
    await p.locator('.home-keys button', { hasText: /^D$/ }).click()
    await p.keyboard.press('Escape')
    const notice = p.locator('.home-notice')
    await notice.waitFor()
    expect(await top()).toBe(before)
    // Clicking the bar's own background must not deselect the chord.
    const box = await notice.boundingBox()
    if (!box) throw new Error('No notice')
    await p.mouse.click(box.x + 6, box.y + box.height / 2)
    expect((await clips(p)).filter((c) => c.selected).length).toBe(1)
    await notice.locator('button', { hasText: 'Keep them' }).click()
    expect(await notice.count()).toBe(0)
    expect(await top()).toBe(before)
  })
})

describe('detect key', () => {
  it('lists keys from the chords and uses one without offering to move them', async () => {
    const p = await start(full())
    await p.locator('.song-menu .dropdown-trigger').click()
    const items = p.locator('.home-detect-item .menu-title')
    expect(await items.allTextContents()).toEqual(['C MajorBest matchCurrent', 'A Minor'])
    await items.nth(1).click()
    expect(await p.locator('.song-menu .trigger-value').textContent()).toContain('A minor')
    expect(await p.locator('.home-notice').count()).toBe(0)
  })
})

describe('song popover', () => {
  it('changes the tempo and toggles the metronome, with the trigger showing the values', async () => {
    const p = await start(full())
    await p.locator('.song-menu .dropdown-trigger').click()
    await p.locator('.song-panel input[aria-label="Tempo (BPM)"]').fill('93')
    const metronome = p.locator('.song-panel button[aria-label="Metronome"]')
    expect(await metronome.getAttribute('aria-pressed')).toBe('false')
    await metronome.click()
    expect(await metronome.getAttribute('aria-pressed')).toBe('true')
    await p.keyboard.press('Escape')
    expect(await p.locator('.song-menu .trigger-bpm').textContent()).toBe('93 BPM')
    // M still toggles it from the keyboard.
    // Shortcuts ignore keys while a dropdown has focus, so let go of the trigger first.
    await p.evaluate('document.activeElement.blur()')
    await p.keyboard.press('m')
    await p.locator('.song-menu .dropdown-trigger').click()
    expect(await metronome.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('sessions window', () => {
  const sessionNames = (p: Page) => p.locator('.session-row .session-title').allTextContents()
  const openWindow = async (p: Page) => {
    await p.locator('.session-trigger').click()
    await p.locator('.session-browser').waitFor()
  }
  const rowMenu = async (p: Page, name: string, item: string | RegExp) => {
    await p.getByRole('button', { name: `More options for ${name}`, exact: true }).click()
    await p.locator('.session-popup button', { hasText: item }).click()
  }

  it('makes, renames, stars, files, sorts, copies and deletes sessions', async () => {
    const p = await start(full())
    // The old unsaved work arrives as a listed session.
    expect(await p.locator('.session-trigger').textContent()).toContain('Untitled session')
    await openWindow(p)
    await p.locator('button.session-new').click()
    expect(await p.locator('.session-browser').count()).toBe(0)
    expect(await names(p)).toEqual([])
    expect(await p.locator('.session-trigger').textContent()).toContain('Untitled session 2')

    // Leaving a blank, untouched session throws it away.
    await openWindow(p)
    await p.locator('.session-open', { hasText: /^Untitled session(?! 2)/ }).click()
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
    await openWindow(p)
    expect(await sessionNames(p)).toEqual(['Untitled session'])

    // Rename inline.
    await rowMenu(p, 'Untitled session', 'Rename')
    await p.keyboard.type('My song')
    await p.keyboard.press('Enter')
    expect(await sessionNames(p)).toEqual(['My song'])
    expect(await p.locator('.session-trigger').textContent()).toContain('My song')

    // Star it.
    await p.getByRole('button', { name: 'Add My song to favorites' }).click()
    await p.locator('.session-view', { hasText: 'Favorites' }).click()
    expect(await sessionNames(p)).toEqual(['My song'])

    // A folder, then move the session into it from its menu.
    await p.getByRole('button', { name: 'New folder', exact: true }).click()
    await p.keyboard.type('Album')
    await p.keyboard.press('Enter')
    await p.locator('.session-view', { hasText: 'All sessions' }).click()
    await rowMenu(p, 'My song', 'Album')
    await p.locator('.session-view', { hasText: 'Album' }).click()
    expect(await sessionNames(p)).toEqual(['My song'])

    // Duplicate stays in the folder; sort by name.
    await rowMenu(p, 'My song', 'Duplicate')
    expect((await sessionNames(p)).sort()).toEqual(['My song', 'My song copy'])
    await p.locator('.session-sort select').selectOption('name')
    expect(await sessionNames(p)).toEqual(['My song', 'My song copy'])

    // Delete asks first, in place.
    await rowMenu(p, 'My song copy', 'Delete')
    await p.locator('.session-row.confirming button', { hasText: 'Delete' }).click()
    expect(await sessionNames(p)).toEqual(['My song'])

    // Esc closes and keeps the session open.
    await p.keyboard.press('Escape')
    expect(await p.locator('.session-browser').count()).toBe(0)
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
  })

  it("lists a session's chords; ▶ plays them and ■ stops it", async () => {
    const p = await start(full())
    await openWindow(p)
    expect(await p.locator('.session-chords > span').allTextContents()).toEqual(['C', 'F', 'G', 'Am'])
    expect(await p.locator('.session-info').textContent()).toMatch(/^C major · edited /)
    await p.getByRole('button', { name: 'Hear Untitled session', exact: true }).click()
    await p.getByRole('button', { name: 'Stop hearing Untitled session' }).click()
    expect(await p.locator('.session-chords > span').allTextContents()).toEqual(['C', 'F', 'G', 'Am'])
    await p.getByRole('button', { name: 'Hear Untitled session', exact: true }).waitFor()
  })

  it('backs up everything to one file and imports it without overwriting', async () => {
    const p = await start(full())
    await openWindow(p)
    const [download] = await Promise.all([
      p.waitForEvent('download'),
      p.locator('button', { hasText: 'Back up all sessions' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^chords-backup-\d{4}-\d\d-\d\d\.json$/)
    const file = await download.path()
    await p.locator('.session-backup input[type="file"]').setInputFiles(file)
    await p.locator('.session-browser-foot [role="status"]', { hasText: 'Imported 1 session' }).waitFor()
    expect((await sessionNames(p)).sort()).toEqual(['Untitled session', 'Untitled session (imported)'])
    // The copy has the chords.
    await p.locator('.session-open', { hasText: '(imported)' }).click()
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
  })
})
