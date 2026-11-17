import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { clips, CMD, COPY, drag, names, NUDGE, open, openLink, pointIn, seedTrack, startApp, stopApp, type App } from './harness.ts'

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

/** Like start, but a fresh browser with nothing saved opening a link (a shared song). */
async function startAt(url: string) {
  await page?.context().close()
  const fresh = await openLink(app, url)
  page = fresh
  return fresh
}

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

  it('right-click opens the chord menu on that chord; Duplicate adds a copy; Esc closes it', async () => {
    const p = await start(full())
    await p.mouse.click(...(await pointIn(p, 1, 0.5)), { button: 'right' })
    const menu = p.locator('.chord-menu')
    await menu.waitFor()
    // The right-clicked chord got selected, and the menu names it.
    expect((await clips(p))[1].selected).toBe(true)
    expect(await menu.locator('.chord-menu-title').textContent()).toBe('F')
    await p.keyboard.press('Escape')
    expect(await menu.count()).toBe(0)
    expect((await clips(p))[1].selected).toBe(true) // Esc closed the menu, it didn't deselect
    await p.mouse.click(...(await pointIn(p, 1, 0.5)), { button: 'right' })
    await menu.getByRole('menuitem', { name: /^Duplicate/ }).click()
    expect(await menu.count()).toBe(0)
    expect(await names(p)).toEqual(['C', 'F', 'F', 'G', 'Am'])
    await p.keyboard.press(`${CMD}+z`)
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
  })

  it('Ctrl+click toggles the selection instead of opening the menu (Mac)', async () => {
    const p = await start(full())
    await p.mouse.click(...(await pointIn(p, 0, 0.5)))
    await p.keyboard.down('Control')
    await p.mouse.click(...(await pointIn(p, 1, 0.5)))
    await p.keyboard.up('Control')
    expect(await p.locator('.chord-menu').count()).toBe(0)
    expect((await clips(p)).map((c) => c.selected)).toEqual([true, true, false, false])
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

describe('voicing', () => {
  /**
   * Each chord's shape in the notes lane: the gaps between its notes in px, one string per chord.
   * (Gaps, not positions: the lane grows or shrinks as chords move, shifting every row.)
   */
  const lane = (p: Page) =>
    p.$$eval('.lane-clip', (els) =>
      els.map((el) => {
        const tops = [...el.querySelectorAll('.lane-note')]
          .map((n) => parseFloat(/top:\s*([\d.]+)px/.exec(n.getAttribute('style') ?? '')?.[1] ?? '0'))
          .sort((a, b) => a - b)
        return tops.slice(1).map((t, i) => t - tops[i]).join(',')
      }),
    )

  it('the scope label names who the buttons change, even while the panel is collapsed', async () => {
    const p = await start(full())
    const scope = p.locator('.voicing-scope')
    expect(await scope.textContent()).toBe('All 4 chords')
    await p.mouse.click(...(await pointIn(p, 1, 0.5)))
    expect(await scope.textContent()).toBe('F')
    expect(await p.getByRole('button', { name: 'Inversion higher' }).isEnabled()).toBe(true)
  })

  it('clicking a chord in the notes lane selects it, and ↑ changes only that chord', async () => {
    const p = await start(full())
    await p.getByRole('button', { name: /Voicing/ }).first().click()
    await p.locator('.lane-clip').nth(2).waitFor()
    const before = await lane(p)
    const box = await p.locator('.lane-clip').nth(2).boundingBox()
    if (!box) throw new Error('No lane chord')
    await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    expect((await clips(p)).map((c) => c.selected)).toEqual([false, false, true, false])
    await p.keyboard.press('ArrowUp')
    const after = await lane(p)
    expect(after[2]).not.toBe(before[2])
    expect([after[0], after[1], after[3]]).toEqual([before[0], before[1], before[3]])
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

  it('clicking an idea changes the chord, and Back restores it', async () => {
    const p = await start(full())
    await p.mouse.click(...(await pointIn(p, 1, 0.5)))
    await p.locator('.ideas-grid').waitFor()
    expect(await p.locator('.card-hear').count()).toBe(0)
    await p.getByRole('button', { name: /^Back to/ }).waitFor({ state: 'detached' })
    await p.locator('.idea:not(.current)').first().click()
    expect(await names(p)).not.toEqual(['C', 'F', 'G', 'Am'])
    await p.getByRole('button', { name: 'Back to F' }).click()
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
  })
})

describe('sections', () => {
  const chips = (p: Page) => p.locator('.section-chip-name').allTextContents()
  const current = (p: Page) => p.locator('.section-chip.current .section-chip-name').textContent()
  const addSection = async (p: Page, label: string) => {
    await p.locator('.add-section .dropdown-trigger').click()
    await p.getByRole('menuitem', { name: new RegExp(`^${label} `) }).click()
  }
  const chip = (p: Page, name: string) => p.locator('.section-chip-name').filter({ hasText: new RegExp(`^${name}$`) })

  it('makes a Verse and a Chorus, edits each, and undo switches to the section it changes', async () => {
    const p = await start(full())
    // An old session: one unnamed section.
    expect(await chips(p)).toEqual(['Progression'])

    // Rename it from its ▾ menu.
    await p.locator('.section-chip-menu').first().click()
    await p.getByRole('menuitem', { name: 'Rename' }).click()
    await p.locator('.section-name-input').fill('Verse')
    await p.keyboard.press('Enter')
    expect(await chips(p)).toEqual(['Verse'])

    // + Section → Chorus: a new, empty section, opened right away.
    await addSection(p, 'Chorus')
    expect(await chips(p)).toEqual(['Verse', 'Chorus'])
    expect(await current(p)).toBe('Chorus')
    expect(await names(p)).toEqual([])
    await p.getByRole('button', { name: 'Add a chord' }).click()
    await p.getByLabel('Type any chord').fill('Dm')
    await p.keyboard.press('Enter')
    expect(await names(p)).toEqual(['Dm'])

    // The Verse kept its chords; delete one there.
    await chip(p, 'Verse').click()
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
    await p.mouse.click(...(await pointIn(p, 0, 0.5)))
    await p.keyboard.press('Delete')
    expect(await names(p)).toEqual(['F', 'G', 'Am'])

    // Back in the Chorus, ⌘Z changes the Verse: it opens the Verse to show it.
    await chip(p, 'Chorus').click()
    expect(await names(p)).toEqual(['Dm'])
    await p.keyboard.press(`${CMD}+z`)
    expect(await current(p)).toBe('Verse')
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
    // The next ⌘Z changes the Chorus (the typed chord): back to it.
    await p.keyboard.press(`${CMD}+z`)
    expect(await current(p)).toBe('Chorus')
    expect(await names(p)).toEqual(['?'])

    // Reopening keeps both sections and the one being edited.
    await p.reload()
    await p.waitForSelector('.track')
    expect(await chips(p)).toEqual(['Verse', 'Chorus'])
    expect(await current(p)).toBe('Chorus')
  })
})

describe('song timeline', () => {
  const blocks = (p: Page) => p.locator('.song-block .song-block-name').allTextContents()
  const current = (p: Page) => p.locator('.section-chip.current .section-chip-name').textContent()
  const chip = (p: Page, name: string) => p.locator('.section-chip-name').filter({ hasText: new RegExp(`^${name}$`) })
  const center = async (l: ReturnType<Page['locator']>, fx = 0.5): Promise<[number, number]> => {
    const b = await l.boundingBox()
    if (!b) throw new Error('Not on screen')
    return [b.x + b.width * fx, b.y + b.height / 2]
  }
  /** A song with two sections: the old one ("Progression", C F G Am) and an empty Chorus, editing the Chorus. */
  const twoSections = async () => {
    const p = await start(full())
    await p.locator('.add-section .dropdown-trigger').click()
    await p.getByRole('menuitem', { name: /^Chorus / }).click()
    await p.locator('.song-arranger .panel-bar').click()
    return p
  }

  it('drag chips in, reorder by dragging, ⌘D, Delete and ⌘Z', async () => {
    const p = await twoSections()
    expect(await blocks(p)).toEqual([])
    // A chip dragged onto the empty song.
    await drag(p, await center(chip(p, 'Progression')), await center(p.locator('.song-lane')))
    expect(await blocks(p)).toEqual(['Progression'])
    // Another after it: the right half of a block is "after".
    await drag(p, await center(chip(p, 'Chorus')), await center(p.locator('.song-block').first(), 0.9))
    expect(await blocks(p)).toEqual(['Progression', 'Chorus'])
    // Drag the Chorus block before the Progression.
    await drag(p, await center(p.locator('.song-block').nth(1)), await center(p.locator('.song-block').first(), 0.1))
    expect(await blocks(p)).toEqual(['Chorus', 'Progression'])

    // Clicking a block selects it and edits its section.
    await p.locator('.song-block').nth(1).click()
    expect(await current(p)).toBe('Progression')
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
    // ⌘D: a linked repeat right after it, selected.
    await p.keyboard.press(`${CMD}+d`)
    expect(await blocks(p)).toEqual(['Chorus', 'Progression', 'Progression'])
    expect(await p.locator('.song-block.selected').count()).toBe(1)
    // Both Progression blocks are outlined as the section being edited.
    expect(await p.locator('.song-block.editing').count()).toBe(2)
    // Delete takes it out of the song; the section stays.
    await p.keyboard.press('Delete')
    expect(await blocks(p)).toEqual(['Chorus', 'Progression'])
    expect(await p.locator('.section-chip-name').allTextContents()).toEqual(['Progression', 'Chorus'])
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
    await p.keyboard.press(`${CMD}+z`)
    expect(await blocks(p)).toEqual(['Chorus', 'Progression', 'Progression'])
  })

  it('▶ Song plays the song without moving the editor; Space pauses and resumes it', async () => {
    const p = await twoSections()
    await drag(p, await center(chip(p, 'Chorus')), await center(p.locator('.song-lane')))
    // Edit the Progression, which isn't in the song.
    await chip(p, 'Progression').click()
    await p.getByRole('button', { name: 'Play song' }).click()
    await p.getByRole('button', { name: 'Pause song' }).waitFor()
    // The chord track's playhead hides: what plays isn't the section on screen.
    await p.waitForSelector('[data-playhead-scope][data-playhead-off]')
    expect(await current(p)).toBe('Progression')
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
    expect(await p.locator('button.play').getAttribute('aria-label')).toBe('Play')
    await p.keyboard.press('Space')
    await p.getByRole('button', { name: 'Play song' }).waitFor()
    await p.keyboard.press('Space')
    await p.getByRole('button', { name: 'Pause song' }).waitFor()
    // The transport's Play switches to the section.
    await p.locator('button.play').click()
    await p.getByRole('button', { name: 'Play song' }).waitFor()
    expect(await p.locator('button.play').getAttribute('aria-label')).toBe('Pause')
    await p.keyboard.press('Shift+Space')
  })
})

describe('chord menu', () => {
  it('closes when you click a chord, and stays closed', async () => {
    const p = await start(full())
    await p.mouse.click(...(await pointIn(p, 1, 0.5)), { button: 'right' })
    await p.locator('.chord-menu').waitFor()
    await p.mouse.click(...(await pointIn(p, 2, 0.5)))
    await p.locator('.chord-menu').waitFor({ state: 'detached' })
    await p.mouse.click(...(await pointIn(p, 2, 0.5)))
    expect(await p.locator('.chord-menu').count()).toBe(0)
  })
})

describe('an arranged song at every width', () => {
  it('scrolls its chips and timeline sideways inside, never the page; the Export menu stays on screen', async () => {
    const p = await start(full())
    for (const label of [/^Verse /, /^Pre-chorus /, /^Chorus /, /^Bridge /]) {
      await p.locator('.add-section .dropdown-trigger').click()
      await p.getByRole('menuitem', { name: label }).click()
    }
    await p.locator('.song-arranger .panel-bar').click()
    await p.getByRole('button', { name: /Add every section in order/ }).click()
    expect(await p.locator('.song-block').count()).toBeGreaterThan(3)
    const overflow = () => p.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')
    for (const width of [320, 360, 375, 430, 600, 640, 768, 900, 1024, 1280]) {
      await p.setViewportSize({ width, height: 900 })
      expect(await overflow(), `${width}px: no sideways page scroll`).toBeLessThanOrEqual(0)
      await p.locator('.export-menu .dropdown-trigger').click()
      await p.getByRole('button', { name: 'Whole song' }).waitFor()
      const menu = await p.locator('.export-panel').boundingBox()
      if (!menu) throw new Error('No Export menu')
      expect(menu.x, `${width}px: Export menu starts on screen`).toBeGreaterThanOrEqual(0)
      expect(menu.x + menu.width, `${width}px: Export menu ends on screen`).toBeLessThanOrEqual(width)
      expect(await overflow(), `${width}px: nothing runs off with the menu open`).toBeLessThanOrEqual(0)
      await p.keyboard.press('Escape')
      // The Share panel too.
      await p.getByRole('button', { name: 'Share this song' }).click()
      const share = await p.locator('.share-panel').boundingBox()
      if (!share) throw new Error('No Share panel')
      expect(share.x, `${width}px: Share panel starts on screen`).toBeGreaterThanOrEqual(0)
      expect(share.x + share.width, `${width}px: Share panel ends on screen`).toBeLessThanOrEqual(width)
      expect(await overflow(), `${width}px: nothing runs off with the Share panel open`).toBeLessThanOrEqual(0)
      await p.keyboard.press('Escape')
    }
  })
})

describe('layout at every width', () => {
  // Phones (smallest first), the widths between phone and desktop (where the toolbar wraps), tablet, laptop.
  for (const width of [320, 360, 375, 430, 600, 640, 768, 900, 1024, 1280]) {
    it(`${width}px: nothing runs off-screen, the progression browser included`, async () => {
      const p = await start(full())
      await p.setViewportSize({ width, height: 900 })
      // As a string: this file is type-checked for Node, which has no `document`.
      const overflow = () => p.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')
      expect(await overflow()).toBeLessThanOrEqual(0)
      await p.locator('.progressions-trigger').click()
      const panel = await p.locator('.prog-browser').boundingBox()
      if (!panel) throw new Error('No progression browser')
      expect(panel.x).toBeGreaterThanOrEqual(0)
      expect(panel.x + panel.width).toBeLessThanOrEqual(width)
      // The Use buttons stay on screen too.
      const use = await p.getByRole('button', { name: 'Use both' }).boundingBox()
      expect(use!.x + use!.width).toBeLessThanOrEqual(width)
      expect(use!.y + use!.height).toBeLessThanOrEqual(900)
      expect(await overflow()).toBeLessThanOrEqual(0)
    })
  }
})

describe('phone chip rows', () => {
  it('scrolls the picked genre chip fully into view', async () => {
    const p = await start(full())
    await p.setViewportSize({ width: 375, height: 800 })
    await p.locator('.progressions-trigger').click()
    const nav = p.locator('.prog-browser .session-sidebar')
    const last = nav.locator('.session-view').last()
    await last.click()
    await p.waitForTimeout(600) // smooth scroll
    const [row, chip] = [await nav.boundingBox(), await last.boundingBox()]
    if (!row || !chip) throw new Error('No chip row')
    expect(chip.x).toBeGreaterThanOrEqual(row.x - 1)
    expect(chip.x + chip.width).toBeLessThanOrEqual(row.x + row.width + 1)
  })
})

describe('phone header', () => {
  it('is two rows that never re-wrap: logo + session, then the song button, Export and Share', async () => {
    const p = await start(full())
    for (const width of [320, 360, 375, 430, 600]) {
      await p.setViewportSize({ width, height: 800 })
      const top = async (selector: string) => Math.round((await p.locator(selector).boundingBox())!.y)
      const [logo, session] = [await top('.logo-icon'), await top('.session-trigger')]
      const [song, exp] = [await top('.song-menu .dropdown-trigger'), await top('.export-menu .dropdown-trigger')]
      expect(Math.abs(logo - session), `${width}px: logo and session share a row`).toBeLessThan(12)
      expect(Math.abs(song - exp), `${width}px: song button and Export share a row`).toBeLessThan(4)
      expect(Math.abs(song - (await top('.share-menu .dropdown-trigger'))), `${width}px: and Share`).toBeLessThan(4)
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

describe('progression browser', () => {
  const bpm = (p: Page) => p.locator('.song-menu .trigger-bpm').textContent()
  const preset = (p: Page) => p.locator('select[aria-label="Instrument preset"]').inputValue()
  /** Open the browser and find the Andalusian cadence (Acoustic, 104 BPM; Cm Bb Ab G in C). */
  const findAndalusian = async (p: Page) => {
    await p.locator('.progressions-trigger').click()
    await p.getByRole('searchbox', { name: 'Search progressions' }).fill('andalusian')
  }

  it('hearing one leaves the track alone', async () => {
    const p = await start(full())
    const [bpmBefore, presetBefore] = [await bpm(p), await preset(p)]
    await p.locator('.progressions-trigger').click()
    await p.locator('.prog-open').first().click()
    await p.getByRole('button', { name: 'Stop hearing Pop anthem' }).waitFor()
    await p.keyboard.press('Escape')
    expect(await p.locator('.prog-browser').count()).toBe(0)
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
    expect([await bpm(p), await preset(p)]).toEqual([bpmBefore, presetBefore])
  })

  it('Use chords keeps your instruments and tempo', async () => {
    const p = await start(full())
    const [bpmBefore, presetBefore] = [await bpm(p), await preset(p)]
    await findAndalusian(p)
    await p.locator('.prog-open').first().click()
    await p.getByRole('button', { name: 'Use chords' }).click()
    expect(await p.locator('.prog-browser').count()).toBe(0)
    expect(await names(p)).toEqual(['Cm', 'Bb', 'Ab', 'G'])
    expect([await bpm(p), await preset(p)]).toEqual([bpmBefore, presetBefore])
  })

  it('Use both (↓ then Enter) takes its instruments and tempo too; one ⌘Z restores everything', async () => {
    const p = await start(full())
    const [bpmBefore, presetBefore] = [await bpm(p), await preset(p)]
    await findAndalusian(p)
    await p.keyboard.press('ArrowDown')
    await p.keyboard.press('Enter')
    expect(await p.locator('.prog-browser').count()).toBe(0)
    expect(await names(p)).toEqual(['Cm', 'Bb', 'Ab', 'G'])
    expect([await bpm(p), await preset(p)]).toEqual(['104 BPM', 'acoustic'])
    await p.evaluate('document.activeElement.blur()')
    await p.keyboard.press(`${CMD}+z`)
    expect(await names(p)).toEqual(['C', 'F', 'G', 'Am'])
    expect([await bpm(p), await preset(p)]).toEqual([bpmBefore, presetBefore])
  })

  it("the empty track's start button opens it", async () => {
    const p = await start(seedTrack([]))
    await p.getByRole('button', { name: 'Start from a progression' }).click()
    await p.locator('.prog-browser').waitFor()
  })
})

describe('export', () => {
  /** The WAV header's fields and the length of its audio in seconds. */
  const readWav = (bytes: Buffer) => ({
    riff: bytes.toString('ascii', 0, 4) + bytes.toString('ascii', 8, 12),
    channels: bytes.readUInt16LE(22),
    rate: bytes.readUInt32LE(24),
    bits: bytes.readUInt16LE(34),
    seconds: bytes.readUInt32LE(40) / (bytes.readUInt16LE(32) * bytes.readUInt32LE(24)),
  })
  /** The 24-bit samples (−1…1), interleaved. */
  const samples = (bytes: Buffer) => Array.from({ length: (bytes.length - 44) / 3 }, (_, i) => bytes.readIntLE(44 + i * 3, 3) / 0x800000)

  it('renders the mix to a WAV named after the session, and MIDI of one part', async () => {
    const p = await start(full())
    await p.locator('.export-menu .dropdown-trigger').click()
    await p.getByRole('button', { name: 'Audio (WAV)' }).click()
    const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('menuitem', { name: /All parts that are on/ }).click()])
    expect(download.suggestedFilename()).toBe('Untitled session.wav')
    const { readFile } = await import('node:fs/promises')
    const bytes = await readFile(await download.path())
    const wav = readWav(bytes)
    expect(wav).toMatchObject({ riff: 'RIFFWAVE', channels: 2, rate: 44100, bits: 24 })
    // 4 bars of 4/4 at 120 BPM = 8 s, plus at most 2 s of ring-out.
    expect(wav.seconds).toBeGreaterThanOrEqual(8)
    expect(wav.seconds).toBeLessThanOrEqual(10)
    // The limiter (an AudioWorklet in the offline render) keeps every sample at or under −1 dBFS
    // (Pop peaked at +3 dBFS without it), and its 5 ms delay is cut: the first chord starts the file.
    const audio = samples(bytes)
    const peak = audio.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(peak).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6)
    expect(peak).toBeGreaterThan(0.5)
    expect(audio.findIndex((v) => Math.abs(v) > 0.001)).toBeLessThan(2 * 44) // within 1 ms (stereo frames)
    expect(await p.locator('.export-status').count()).toBe(0)

    await p.locator('.export-menu .dropdown-trigger').click()
    await p.getByRole('button', { name: 'MIDI', exact: true }).click()
    const [midi] = await Promise.all([p.waitForEvent('download'), p.getByRole('menuitem', { name: /^Bass only/ }).click()])
    expect(midi.suggestedFilename()).toBe('Untitled session - Bass.mid')
  })

  it('shows progress while rendering, and Cancel stops it with nothing downloaded', async () => {
    // 8 bars at 30 BPM: about a minute of audio, long enough to cancel.
    const slow = full()
    const p = await start({ ...slow, present: { ...slow.present, bars: 8, bpm: 30 } })
    let downloads = 0
    p.on('download', () => downloads++)
    await p.locator('.export-menu .dropdown-trigger').click()
    await p.getByRole('button', { name: 'Audio (WAV)' }).click()
    await p.getByRole('menuitem', { name: /All parts that are on/ }).click()
    const status = p.locator('.export-status')
    await status.waitFor()
    expect(await status.textContent()).toMatch(/Rendering Untitled session\.wav… \d+%/)
    await status.getByRole('button', { name: 'Cancel' }).click()
    expect(await status.count()).toBe(0)
    await p.waitForTimeout(1500)
    expect(downloads).toBe(0)
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

describe('undo covers instruments and tempo', () => {
  const undoKey = async (p: Page) => {
    await p.keyboard.press('Escape')
    await p.evaluate('document.activeElement.blur()')
    await p.keyboard.press(`${CMD}+z`)
  }

  it('one ⌘Z restores a typed tempo', async () => {
    const p = await start(full())
    const bpm = p.locator('.song-menu .trigger-bpm')
    const before = await bpm.textContent()
    await p.locator('.song-menu .dropdown-trigger').click()
    await p.locator('.song-panel input[aria-label="Tempo (BPM)"]').fill('93')
    await undoKey(p)
    expect(await bpm.textContent()).toBe(before)
  })

  it('a preset picked in the collapsed Instruments bar keeps the tempo; one ⌘Z undoes it', async () => {
    const p = await start(full())
    const bpm = p.locator('.song-menu .trigger-bpm')
    const bpmBefore = await bpm.textContent()
    const select = p.locator('select[aria-label="Instrument preset"]')
    const before = await select.inputValue()
    await select.selectOption({ label: 'Just chords' })
    expect(await select.inputValue()).toBe('just')
    expect(await bpm.textContent()).toBe(bpmBefore)
    await undoKey(p)
    expect(await select.inputValue()).toBe(before)
  })

  it('a whole volume drag is one undo step', async () => {
    const p = await start(full())
    const volume = p.locator('input[aria-label="Chords volume"]')
    await p.locator('.instruments-panel .panel-bar').click()
    const before = await volume.inputValue()
    const box = await volume.boundingBox()
    if (!box) throw new Error('No slider')
    const y = box.y + box.height / 2
    await drag(p, [box.x + box.width * 0.9, y], [box.x + box.width * 0.1, y])
    expect(Number(await volume.inputValue())).toBeLessThan(Number(before))
    await undoKey(p)
    expect(await volume.inputValue()).toBe(before)
  })
})

describe('sharing', () => {
  const chipNames = (p: Page) => p.locator('.section-chip-name').allTextContents()
  const sessionName = (p: Page) => p.locator('.session-trigger').textContent()
  const notice = (p: Page, text: string | RegExp) => p.locator('.share-notice', { hasText: text })
  const sessionList = async (p: Page) => {
    await p.locator('.session-trigger').click()
    await p.locator('.session-browser').waitFor()
    const list = await p.locator('.session-row .session-title').allTextContents()
    await p.keyboard.press('Escape')
    return list
  }

  it('copies a link that opens the song as a new session in a fresh browser, never overwriting anything', async () => {
    const p = await start(full())
    // Name the session, add a Chorus with a chord, arrange both.
    await p.locator('.session-trigger').click()
    await p.getByRole('button', { name: 'More options for Untitled session', exact: true }).click()
    await p.locator('.session-popup button', { hasText: 'Rename' }).click()
    await p.keyboard.type('Summer demo')
    await p.keyboard.press('Enter')
    await p.keyboard.press('Escape')
    await p.locator('.add-section .dropdown-trigger').click()
    await p.getByRole('menuitem', { name: /^Chorus / }).click()
    await p.getByRole('button', { name: 'Add a chord' }).click()
    await p.getByLabel('Type any chord').fill('Dm')
    await p.keyboard.press('Enter')
    await p.locator('.song-arranger .panel-bar').click()
    await p.getByRole('button', { name: /Add every section in order/ }).click()

    // Share → Copy link.
    await p.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await p.getByRole('button', { name: 'Share this song' }).click()
    const field = p.getByLabel('Link to this song')
    await expect.poll(() => field.inputValue()).toMatch(/#song=[A-Za-z0-9_-]+$/)
    const link = await field.inputValue()
    expect(link.length).toBeLessThan(2_000)
    await p.getByRole('button', { name: 'Copy link' }).click()
    await p.getByRole('button', { name: 'Copied ✓' }).waitFor()
    expect(await p.evaluate<string>('navigator.clipboard.readText()')).toBe(link)

    // Someone else opens it: a browser with nothing saved.
    const q = await startAt(link)
    await notice(q, /Opened .Summer demo. from a link/).waitFor()
    expect(await sessionName(q)).toContain('Summer demo')
    expect(await chipNames(q)).toEqual(['Progression', 'Chorus'])
    expect(await names(q)).toEqual(['C', 'F', 'G', 'Am'])
    expect(await q.locator('.song-block').count()).toBe(2) // the Song panel opens on an arranged song
    expect(await q.evaluate<string>('location.hash')).toBe('')
    // The blank session made on arrival is gone: only the shared one is listed.
    expect(await sessionList(q)).toEqual(['Summer demo'])
    // Editing the song dismisses the notice.
    await q.keyboard.press('ArrowUp')
    await notice(q, 'from a link').waitFor({ state: 'detached' })

    // The same link pasted into the open tab: a second copy, the first untouched.
    await q.evaluate(`location.hash = ${JSON.stringify(new URL(link).hash)}`)
    await notice(q, /Opened .Summer demo \(shared\). from a link/).waitFor()
    expect(await sessionName(q)).toContain('Summer demo (shared)')
    expect((await sessionList(q)).sort()).toEqual(['Summer demo', 'Summer demo (shared)'])

    // A broken link says so and leaves everything as it was.
    await q.evaluate(`location.hash = '#song=cut-off'`)
    await notice(q, "This link doesn't open a song").waitFor()
    expect(await sessionName(q)).toContain('Summer demo (shared)')
    expect(await q.evaluate<string>('location.hash')).toBe('')
    expect((await sessionList(q)).length).toBe(2)
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
