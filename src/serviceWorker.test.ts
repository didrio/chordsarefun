import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildVersion, PAGE_TIMEOUT_MS, precacheList, serviceWorkerSource } from './serviceWorker'

const BASE = 'https://chords.test/'
const BUILT = ['index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'favicon.svg', 'site.webmanifest', 'og.png', '_headers', 'robots.txt', 'sitemap.xml', 'licenses.txt', 'assets/index-abc.js.map', '.DS_Store']

describe('what the offline copy saves', () => {
  it('saves the app (index as ./) and leaves out what running it never needs', () => {
    expect(precacheList(BUILT)).toEqual(['./', 'assets/index-abc.css', 'assets/index-abc.js', 'favicon.svg', 'site.webmanifest'])
    expect(precacheList(['sw.js', 'index.html'])).toEqual(['./'])
  })

  it('gets a new version when any file or name changes, and the same one for the same build', () => {
    const files = [
      { path: 'index.html', bytes: new TextEncoder().encode('<html>') },
      { path: 'assets/a.js', bytes: new TextEncoder().encode('x') },
    ]
    const v = buildVersion(files)
    expect(v).toMatch(/^[0-9a-f]{16}$/)
    expect(buildVersion([...files].reverse())).toBe(v)
    expect(buildVersion([files[0], { path: 'assets/a.js', bytes: new TextEncoder().encode('y') }])).not.toBe(v)
    expect(buildVersion([files[0], { path: 'assets/b.js', bytes: files[1].bytes }])).not.toBe(v)
  })

  it('is a script on its own: no imports, and it names its version and files', () => {
    const src = serviceWorkerSource(['./', 'assets/a.js'], 'v1')
    expect(() => new Function(src)).not.toThrow()
    expect(src).not.toMatch(/^\s*import /m)
    expect(src).toContain('"v1"')
    expect(src).toContain('"assets/a.js"')
  })
})

/** A tiny service worker world: Cache Storage, fetch and the worker's events, enough to run the real script. */
function worker(precache = ['./', 'assets/a.js', 'favicon.svg'], version = 'v2') {
  const stores = new Map<string, Map<string, Response>>()
  const key = (r: Request | string) => (typeof r === 'string' ? new URL(r, BASE).href : r.url)
  const cacheFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name)!
    return {
      match: async (r: Request | string) => store.get(key(r))?.clone(),
      put: async (r: Request | string, res: Response) => void store.set(key(r), res),
      addAll: async (rs: Request[]) => {
        for (const r of rs) store.set(r.url, await fetch(r))
      },
    }
  }
  const caches = {
    open: async (name: string) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  }
  const server = new Map<string, string>()
  for (const u of precache) server.set(new URL(u, BASE).href, `server ${u}`)
  let online = true
  let hang = false
  const fetch = vi.fn(async (r: Request | string) => {
    if (hang) return new Promise<Response>(() => {})
    if (!online) throw new TypeError('offline')
    const body = server.get(key(r))
    return new Response(body ?? 'missing', { status: body === undefined ? 404 : 200 })
  })
  const listeners: Record<string, (e: unknown) => void> = {}
  const self = {
    location: { href: BASE + 'sw.js' },
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  }
  new Function('self', 'caches', 'fetch', 'setTimeout', serviceWorkerSource(precache, version))(
    self,
    caches,
    fetch,
    // Looked up on each call, so fake timers apply.
    (fn: () => void, ms: number, ...args: unknown[]) => setTimeout(fn, ms, ...args),
  )

  /** Fires a lifecycle event and waits for what it asked to wait for. */
  const lifecycle = async (type: string) => {
    let wait: Promise<unknown> = Promise.resolve()
    listeners[type]({ waitUntil: (p: Promise<unknown>) => (wait = p) })
    await wait
  }
  /** Fires a fetch: the response the worker gave, or null if it left the request to the browser. */
  const request = (url: string, mode: RequestMode | 'navigate' = 'no-cors'): Promise<Response> | null => {
    let answer: Promise<Response> | null = null
    const req = { url: new URL(url, BASE).href, method: 'GET', mode }
    listeners.fetch({ request: req, respondWith: (p: Promise<Response>) => (answer = p), waitUntil: () => {} })
    return answer
  }
  return {
    stores,
    server,
    fetch,
    self,
    lifecycle,
    request,
    offline: () => (online = false),
    hangs: () => (hang = true),
  }
}

describe('the offline copy at work', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves every file on install, takes over right away and drops older copies only', async () => {
    const w = worker()
    w.stores.set('chords-v1', new Map())
    w.stores.set('someone-else', new Map())
    await w.lifecycle('install')
    expect([...w.stores.get('chords-v2')!.keys()].sort()).toEqual([BASE, BASE + 'assets/a.js', BASE + 'favicon.svg'])
    expect(w.self.skipWaiting).toHaveBeenCalled()
    await w.lifecycle('activate')
    expect([...w.stores.keys()].sort()).toEqual(['chords-v2', 'someone-else'])
    expect(w.self.clients.claim).toHaveBeenCalled()
  })

  it('opens the newest page when online, and saves it', async () => {
    const w = worker()
    await w.lifecycle('install')
    w.server.set(BASE, 'new deploy')
    expect(await w.request(BASE, 'navigate')!.then((r) => r.text())).toBe('new deploy')
    await Promise.resolve()
    expect(await w.stores.get('chords-v2')!.get(BASE)!.clone().text()).toBe('new deploy')
  })

  it('opens the saved page offline, and when the network hangs', async () => {
    const w = worker()
    await w.lifecycle('install')
    w.offline()
    expect(await w.request(BASE + '?utm=x', 'navigate')!.then((r) => r.text())).toBe('server ./')

    const slow = worker()
    await slow.lifecycle('install')
    vi.useFakeTimers()
    slow.hangs()
    const answer = slow.request(BASE + 'index.html', 'navigate')!
    await vi.advanceTimersByTimeAsync(PAGE_TIMEOUT_MS)
    expect(await answer.then((r) => r.text())).toBe('server ./')
  })

  it('serves saved files from the copy, saves new hashed assets, and leaves everything else alone', async () => {
    const w = worker()
    await w.lifecycle('install')
    w.offline()
    expect(await w.request('favicon.svg')!.then((r) => r.text())).toBe('server favicon.svg')

    const online = worker()
    await online.lifecycle('install')
    online.server.set(BASE + 'assets/b.js', 'next')
    expect(await online.request('assets/b.js')!.then((r) => r.text())).toBe('next')
    await Promise.resolve()
    expect(online.stores.get('chords-v2')!.has(BASE + 'assets/b.js')).toBe(true)

    expect(online.request('https://analytics.example/beacon.js')).toBeNull()
    expect(online.request('licenses.txt', 'navigate')).toBeNull()
    expect(online.request('og.png')).toBeNull()
  })
})
