import { useSyncExternalStore } from 'react'

/**
 * The installable, offline app (T33): registers the service worker the build writes (`sw.js`, see
 * serviceWorker.ts), notices when a new version took over this tab, and keeps the browser's install prompt for
 * the help popover's Install button. Browser-only wiring; `installHint` is the pure part.
 */

/** Chrome/Edge's install prompt event (not in TypeScript's DOM types). */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export type PwaState = {
  /** A new version of the app took over this tab: reloading shows it. */
  updateReady: boolean
  /** The browser offered to install the app (Chrome, Edge): `install()` shows its prompt. */
  canInstall: boolean
}

let state: PwaState = { updateReady: false, canInstall: false }
let installPrompt: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const set = (next: Partial<PwaState>) => {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

/** Long-open tabs look for a new version when they're shown again, at most this often. */
const UPDATE_CHECK_MS = 60 * 60 * 1000

/** Starts it all once, from main.tsx. The service worker only in a production build (dev serves no sw.js). */
export function startPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // no mini-infobar on Android: the help popover offers it instead
    installPrompt = e as InstallPromptEvent
    set({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    set({ canInstall: false })
  })
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  // The first worker taking over a fresh page isn't an update; any later takeover is.
  let controlled = navigator.serviceWorker.controller !== null
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) set({ updateReady: true })
    controlled = true
  })
  const register = () => {
    void navigator.serviceWorker.register('./sw.js').then(
      (registration) => {
        let checked = Date.now()
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible' || Date.now() - checked < UPDATE_CHECK_MS) return
          checked = Date.now()
          void registration.update().catch(() => {}) // offline: try again next time
        })
      },
      () => {}, // no offline copy (private mode, blocked): the app works as a normal site
    )
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

/** Shows the browser's install prompt (only while `canInstall`). */
export async function install() {
  const prompt = installPrompt
  if (!prompt) return
  installPrompt = null
  set({ canInstall: false })
  await prompt.prompt()
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** True when the app runs installed (its own window or home-screen app), not in a browser tab. */
export function isInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone or iPad (iPadOS says it's a Mac, but has touch). */
export function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * What the help popover says about installing: already installed; an Install button (the browser offered);
 * iPhone/iPad's Share → Add to Home Screen; or the browser's own menu.
 */
export function installHint(installed: boolean, canInstall: boolean, appleMobile: boolean): 'installed' | 'prompt' | 'ios' | 'menu' {
  if (installed) return 'installed'
  if (canInstall) return 'prompt'
  return appleMobile ? 'ios' : 'menu'
}
