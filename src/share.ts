import { Interval } from 'tonal'
import type { ImportPlan } from './backup'
import { isNoteName, type Chord } from './music/chord'
import { BAR_OPTIONS, sigBarTicks, type Clip } from './music/timeline'
import { isAutoName, sessionPrefix, uniqueName, type SessionMeta } from './session'
import { isSong, migrateSong, packSongHistory, type Section, type Song } from './song'

/**
 * Sharing a song by link (T32). The link carries the song itself, in the URL's hash
 * (`https://chordsarefun.com/#song=…`): the song as JSON, deflated (`CompressionStream`) and
 * base64url. No server: the hash never leaves the browser (it isn't sent with the request), so a
 * link is private to whoever has it, and link previews fetch the bare page (the usual share card).
 *
 * What's in it: the song (key, tempo, time signature, every section's chords, length and
 * instruments, the arrangement) and the session's name. Not the undo history or view settings.
 * Ids are left out (sections are referenced by index) and made fresh on opening: they're most of
 * the size and say nothing (a 4-section song is ~850 characters without them, ~2,100 with).
 *
 * Versions: `v` is the link format. A newer app reads older links through `migrateSong`, like
 * stored songs; an older app shows a link from a newer one as "too new" (reload to update). Bump
 * SHARE_VERSION when a link made now would be misread by the app as it was before the change.
 */

export const SHARE_VERSION = 1

/** The hash parameter: `#song=<payload>`. */
const SHARE_KEY = 'song'

/** A link's payload longer than this isn't one of ours (the biggest real songs are a few thousand). */
const MAX_PAYLOAD = 32_000
/** Most JSON a link may inflate to: a link is someone else's data, and a tiny one could inflate to gigabytes. */
const MAX_JSON_BYTES = 1_000_000
const MAX_SECTIONS = 100
const MAX_BLOCKS = 1_000
const MAX_CLIPS = 2_048
/** Far beyond any voicing the app makes (its range is MIDI 36–88), small enough to never misbehave. */
const MAX_INVERSION = 64
const MAX_NAME = 100
/** Clip times may be fractions after a meter change; allow that much rounding at the edges. */
const TICK_SLACK = 1

type SharedSection = Omit<Section, 'id' | 'clips'> & { clips: Omit<Clip, 'id'>[] }

/** What a link holds: the song without ids (the arrangement lists section indices). */
export type SharedSong = {
  v: number
  name: string
  song: Omit<Song, 'sections' | 'arrangement'> & { sections: SharedSection[]; arrangement: number[] }
}

export type ShareProblem = 'invalid' | 'too-new' | 'unsupported'

export type ShareResult = { ok: true; name: string; song: Song } | { ok: false; reason: ShareProblem }

const INVALID: ShareResult = { ok: false, reason: 'invalid' }

/** The song as a link holds it: ids left out, blocks as section indices. */
export function toShared(song: Song, name: string): SharedSong {
  const index = new Map(song.sections.map((s, i) => [s.id, i]))
  const { sections, arrangement, ...shared } = song
  return {
    v: SHARE_VERSION,
    name,
    song: {
      ...shared,
      sections: sections.map(({ id: _id, clips, ...s }) => ({ ...s, clips: clips.map(({ id: _clip, ...c }) => c) })),
      arrangement: arrangement.map((b) => index.get(b.section)!),
    },
  }
}

const safeChord = (c: Chord) =>
  Math.abs(c.inversion) <= MAX_INVERSION && [...c.add, ...c.omit].every((ivl) => !Interval.get(ivl).empty)

/**
 * Stricter than `isSong`, for songs from links (someone else's data, maybe hand-made): what the app
 * itself could have made, so a crafted link can't hang or crash the page (and then every load, since
 * it's saved). Lengths from the length picker; clips in order, inside their section, not overlapping;
 * real intervals and sane inversions; a tonic that's a note; bounded counts. `isSong` stays as it is:
 * tightening it could throw away saved work.
 */
export function isSafeSong(song: Song): boolean {
  if (!isNoteName(song.tonic) || song.sections.length > MAX_SECTIONS || song.arrangement.length > MAX_BLOCKS) return false
  const bar = sigBarTicks(song.sig)
  return song.sections.every((s) => {
    if (!(BAR_OPTIONS as readonly number[]).includes(s.bars) || s.clips.length > MAX_CLIPS) return false
    const end = s.bars * bar
    let free = 0
    return s.clips.every((c) => {
      const ok =
        c.start >= free - TICK_SLACK && c.length > 0 && c.start + c.length <= end + TICK_SLACK && (c.chord === null || safeChord(c.chord))
      free = c.start + c.length
      return ok
    })
  })
}

/**
 * A link's decoded JSON as a song with fresh ids, brought up to date (`migrateSong`) and checked
 * (`isSong`, `isSafeSong`); or why not: not a song ('invalid'), or made by a newer app ('too-new').
 */
export function fromShared(data: unknown, newId: () => string = () => crypto.randomUUID()): ShareResult {
  const d = data as Partial<SharedSong> | null
  if (typeof d !== 'object' || d === null || typeof d.v !== 'number' || !Number.isInteger(d.v) || d.v < 1) return INVALID
  if (d.v > SHARE_VERSION) return { ok: false, reason: 'too-new' }
  const body = d.song as { sections?: unknown; arrangement?: unknown } | undefined
  if (typeof body !== 'object' || body === null || !Array.isArray(body.sections) || !Array.isArray(body.arrangement)) return INVALID
  if (body.sections.length > MAX_SECTIONS || body.arrangement.length > MAX_BLOCKS) return INVALID
  // Anything malformed is passed along as it is, for isSong to reject.
  const sections = body.sections.map((s: unknown) => {
    const sec = s as { clips?: unknown }
    if (typeof sec !== 'object' || sec === null || !Array.isArray(sec.clips)) return s
    return { ...sec, id: newId(), clips: sec.clips.map((c: unknown) => (typeof c === 'object' && c !== null ? { ...c, id: newId() } : c)) }
  })
  const sectionId = (i: unknown) => (Number.isInteger(i) ? (sections[i as number] as { id?: unknown } | undefined)?.id : undefined)
  const arrangement = body.arrangement.map((i: unknown) => ({ id: newId(), section: sectionId(i) }))
  const song = migrateSong({ ...body, sections, arrangement })
  if (!isSong(song)) return INVALID
  const ordered: Song = {
    ...song,
    sections: song.sections.map((s) => ({ ...s, clips: [...s.clips].sort((a, b) => a.start - b.start) })),
  }
  if (!isSafeSong(ordered)) return INVALID
  const name = typeof d.name === 'string' ? d.name.trim().slice(0, MAX_NAME) : ''
  return { ok: true, name, song: ordered }
}

// --- The codec: JSON ⇄ deflate-raw ⇄ base64url ------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  // In slices: spreading a long array into fromCharCode overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Throws on anything that isn't base64url. */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Not base64url')
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Bytes through a (de)compression stream; null once the output passes `max` (it stops reading there). */
async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
  max = Infinity,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/** Text as a link payload: deflated, base64url. Throws where the browser can't compress (Safari < 16.4). */
export async function encodePayload(text: string): Promise<string> {
  return toBase64Url((await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw')))!)
}

/** The song (and the session's name) as a link payload. */
export const encodeShare = (song: Song, name: string): Promise<string> => encodePayload(JSON.stringify(toShared(song, name)))

/** A link payload back to a song, or why it can't be opened. Never throws. */
export async function decodeShare(payload: string, newId?: () => string): Promise<ShareResult> {
  if (typeof DecompressionStream === 'undefined') return { ok: false, reason: 'unsupported' }
  if (payload.length === 0 || payload.length > MAX_PAYLOAD) return INVALID
  try {
    const json = await pipe(fromBase64Url(payload), new DecompressionStream('deflate-raw'), MAX_JSON_BYTES)
    if (!json) return INVALID
    return fromShared(JSON.parse(new TextDecoder().decode(json)), newId)
  } catch {
    // Not base64url, cut off (the stream ends early), or not JSON.
    return INVALID
  }
}

/** The link: this page (`base`: origin and path, no hash) with the song in its hash. */
export const shareUrl = (base: string, payload: string) => `${base}#${SHARE_KEY}=${payload}`

/**
 * The payload in a URL hash ("#song=…"), or null if it isn't a shared song. Stops at the first
 * character a payload can't contain, so punctuation a chat app glued to the end ("…xyz).") is ignored.
 */
export function sharedPayload(hash: string): string | null {
  const prefix = `#${SHARE_KEY}=`
  if (!hash.startsWith(prefix)) return null
  return /^[A-Za-z0-9_-]*/.exec(hash.slice(prefix.length))![0]
}

// --- Opening a link: a new session ---------------------------------------------------------------

/** What an opened song is called: its own name, "Name (shared)" if that's taken, or "Shared song" for an automatic one. */
export function sharedSessionName(name: string, taken: string[]): string {
  const base = name.trim()
  if (!base || isAutoName(base)) return uniqueName('Shared song', taken)
  return taken.includes(base) ? uniqueName(`${base} (shared)`, taken) : base
}

/**
 * Adding a song from a link as a new session (applied by `importSessions`, like a backup): a new id,
 * nothing existing touched. Its history starts at the song (nothing to undo); an arranged song opens
 * with the Song panel open, so the song timeline and ▶ Song are in view.
 */
export function planShared(
  shared: { name: string; song: Song },
  existing: SessionMeta[],
  newId: () => string = () => crypto.randomUUID(),
  now = Date.now(),
): ImportPlan {
  const id = newId()
  const name = sharedSessionName(shared.name, existing.map((s) => s.name))
  const prefix = sessionPrefix(id)
  const writes: [string, string][] = [[prefix + 'track', JSON.stringify(packSongHistory({ past: [], present: shared.song, future: [] }))]]
  if (shared.song.arrangement.length > 0) writes.push([prefix + 'songOpen', 'true'])
  return {
    sessions: [{ id, name, created: now, updated: now, favorite: false, folder: null }],
    folders: [],
    writes,
    renamed: name === shared.name.trim() ? 0 : 1,
  }
}
