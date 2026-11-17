import { describe, expect, it } from 'vitest'
import { installHint } from './pwa'

describe('the help popover on installing', () => {
  it('says the installed app is installed, offers the browser prompt, else the device own way', () => {
    expect(installHint(true, true, true)).toBe('installed')
    expect(installHint(false, true, false)).toBe('prompt')
    expect(installHint(false, false, true)).toBe('ios')
    expect(installHint(false, false, false)).toBe('menu')
  })
})
