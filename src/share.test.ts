import { describe, expect, it } from 'vitest'
import { readHistory } from './history'
import { makeChord, withBass, type Chord } from './music/chord'
import { DEFAULT_GROOVE, GROOVES, applyGroove, type GrooveSettings } from './music/grooves'
import { PROGRESSIONS, progressionTrack } from './music/progressions'
import { BAR_OPTIONS, TICKS_PER_BAR, TIME_SIGNATURES, type Clip } from './music/timeline'
import type { SessionMeta } from './session'
import { songHistory } from './session'
import {
  decodeShare,
  encodePayload,
  encodeShare,
  fromShared,
  isSafeSong,
  planShared,
  SHARE_VERSION,
  sharedPayload,
  sharedSessionName,
  shareUrl,
  toShared,
  type SharedSong,
} from './share'
import { rescaleSong, songFromTrack, type Section, type Song } from './song'
import { DEFAULT_TRACK } from './track'

const ids = () => {
  let n = 0
  return () => `id${++n}`
}

const groove = (id: string, tweak: Partial<GrooveSettings> = {}): GrooveSettings => ({
  ...applyGroove(DEFAULT_GROOVE, GROOVES.find((g) => g.id === id)!),
  ...tweak,
})

/** One chord per `length` ticks from bar 1. */
const clips = (chords: Chord[], length = TICKS_PER_BAR): Clip[] =>
  chords.map((chord, i) => ({ id: crypto.randomUUID(), chord, start: i * length, length }))

const section = (name: string | null, chords: Chord[], bars: number, g: GrooveSettings): Section => ({
  id: crypto.randomUUID(),
  name,
  clips: clips(chords, (bars * TICKS_PER_BAR) / chords.length),
  bars,
  groove: g,
})

const C = makeChord('C')
const Am7 = makeChord('A', 'm7')
const F = makeChord('F', 'maj7')
const G = makeChord('G', '7')

/** A song with what a link has to survive: slash chords, adds and omits, inversions, an empty spot, tweaked instruments, repeats. */
function bigSong(): Song {
  const tense = { ...G, add: ['9m'], inversion: -2 }
  const noFifth = { ...Am7, omit: ['5P'], inversion: 1 }
  const sections = [
    section('Intro', [C, withBass(F, 'G'), C, noFifth], 4, groove('ballad')),
    section('Verse', [Am7, F, C, G, Am7, F, C, tense], 8, groove('pop', { swing: 0.27 })),
    section('Pre-chorus', [F, G, noFifth, withBass(C, 'E')], 4, groove('motown')),
    section('Chorus', [C, G, Am7, F, C, G, F, F], 8, { ...groove('edm'), chords: { ...groove('edm').chords, volume: 0.4321 } }),
  ]
  sections[1].clips[3] = { ...sections[1].clips[3], chord: null } // an empty spot
  const order = [0, 1, 2, 3, 1, 2, 3, 3]
  return {
    tonic: 'A',
    mode: 'aeolian',
    sig: { beats: 4, unit: 4 },
    bpm: 104,
    sections,
    arrangement: order.map((i) => ({ id: crypto.randomUUID(), section: sections[i].id })),
  }
}

/** A song through a link and back (ids id1, id2, …). */
const roundTrip = async (song: Song, name = 'Summer demo') => {
  const result = await decodeShare(await encodeShare(song, name), ids())
  if (!result.ok) throw new Error(`Didn't decode: ${result.reason}`)
  return result
}

/** A payload made by hand: any JSON, deflated and base64url'd as a link would be. */
const payloadOf = (data: unknown) => encodePayload(JSON.stringify(data))

describe('share links', () => {
  it('round trips a song: the same song back, with fresh ids', async () => {
    const song = bigSong()
    const back = await roundTrip(song)
    expect(back.name).toBe('Summer demo')
    expect(toShared(back.song, back.name)).toEqual(toShared(song, 'Summer demo'))
    const allIds = [...back.song.sections.flatMap((s) => [s.id, ...s.clips.map((c) => c.id)]), ...back.song.arrangement.map((b) => b.id)]
    expect(new Set(allIds).size).toBe(allIds.length)
    expect(allIds.every((id) => id.startsWith('id'))).toBe(true)
    // Repeats point at the same section, in order.
    const names = back.song.arrangement.map((b) => back.song.sections.find((s) => s.id === b.section)!.name)
    expect(names).toEqual(['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Verse', 'Pre-chorus', 'Chorus', 'Chorus'])
  })

  it("round trips a session from before songs (one unnamed section, nothing arranged) and odd meters", async () => {
    const track = progressionTrack({ ...DEFAULT_TRACK, sig: { beats: 7, unit: 8 }, bars: 8 }, PROGRESSIONS[3], { chords: true, instruments: true })
    const song = songFromTrack(track)
    const back = await roundTrip(song, 'Untitled session 4')
    expect(toShared(back.song, '')).toEqual(toShared(song, ''))
    expect(back.song.sections[0].name).toBeNull()
  })

  // Measured: 4 sections, 28 chords, 8 blocks ≈ 850 characters; one 4-chord progression ≈ 450.
  it('stays short: a 4-section song well under 2,000 characters, one progression under 600', async () => {
    const song = bigSong()
    const long = await encodeShare(song, 'Summer demo')
    expect(long.length).toBeLessThan(1_200)
    const short = await encodeShare(songFromTrack(progressionTrack(DEFAULT_TRACK, PROGRESSIONS[0], { chords: true, instruments: true })), 'Pop')
    expect(short.length).toBeLessThan(600)
    expect(shareUrl('https://chordsarefun.com/', long)).toMatch(/^https:\/\/chordsarefun\.com\/#song=[A-Za-z0-9_-]+$/)
  })

  it('keeps reading links made by version 1 (a link made when T32 shipped)', async () => {
    // Never change this string: it stands for links already sent. If the song's shape changes, migrateSong
    // must keep turning this into a valid song (and SHARE_VERSION goes up if old apps would misread new links).
    const V1 =
      '5ZHBbtwwDER_pZgzUdjJBsXq2AbptadeFj5oLcEWYJMGKW8RLPzvBbdJs02a_kBPEgTyzWjmjBNCS-A4ZwQ8FLX6wcaoGQQTHhDOqMKlR8A9CLMkH0yiJbLPlMvIMcdqCLeElUtF2G2E4zIj7G8IlvtahA3hcH5W-p7VXOMY1RBuCIOKnLKz-lE0md-EEaqumXCSafW95uOd-1o5IWApkQWEJdaalf1ltTGbY7UMY-Vs5jt7dxPtfeYVVC_nNdQeuZcl1pywEZKu8z9BV25k8Q37UTzHZiP0U1l-xXD5pGNUpD5lWx8Xj2b-BEJMCeHQEWT2PA-4-4aOUPiU1Yprt46uUStCQ5gyD3VEaHe7ZqO3_K8v_JjS_i8Kf9Kb58TwGS9CTn-l1bnaU6lfRtHVfrfa_q-t8jpN75bTbR0hqkYe8pzZo2-opabbtp8'
    const result = await decodeShare(V1, ids())
    if (!result.ok) throw new Error(result.reason)
    const expected: SharedSong = {
      v: 1,
      name: 'First share',
      song: {
        tonic: 'D',
        mode: 'dorian',
        sig: { beats: 3, unit: 4 },
        bpm: 92,
        sections: [
          {
            name: 'Verse',
            bars: 2,
            groove: DEFAULT_GROOVE,
            clips: [
              { chord: { root: 'D', type: 'm7', add: [], omit: ['5P'], inversion: 1 }, start: 0, length: 1440 },
              { chord: { root: 'G', type: 'add9', add: [], omit: [], inversion: 0, bass: 'B' }, start: 1440, length: 1440 },
            ],
          },
          { name: 'Chorus', bars: 1, groove: DEFAULT_GROOVE, clips: [{ chord: null, start: 0, length: 1440 }] },
        ],
        arrangement: [0, 1, 0],
      },
    }
    expect(toShared(result.song, result.name)).toEqual(expected)
  })

  it('says a link from a newer version is too new, and anything else that isn\'t a song is invalid', async () => {
    const good = toShared(bigSong(), 'x')
    expect(await decodeShare(await payloadOf({ ...good, v: SHARE_VERSION + 1 }))).toEqual({ ok: false, reason: 'too-new' })
    const invalid = { ok: false, reason: 'invalid' }
    expect(await decodeShare('')).toEqual(invalid)
    expect(await decodeShare('not a link!')).toEqual(invalid)
    expect(await decodeShare('AAAAAAAA')).toEqual(invalid) // base64url, not deflate
    const payload = await encodeShare(bigSong(), 'x')
    expect(await decodeShare(payload.slice(0, -20))).toEqual(invalid) // cut off when copied
    expect(await decodeShare(await encodePayload('{"v":1,'))).toEqual(invalid) // not JSON
    expect(await decodeShare(await payloadOf({ v: 1, name: 'x', song: { tonic: 'C' } }))).toEqual(invalid)
    expect(await decodeShare(await payloadOf({ name: 'x', song: good.song }))).toEqual(invalid) // no version
    expect(await decodeShare(await payloadOf({ ...good, song: { ...good.song, arrangement: [9] } }))).toEqual(invalid)
    expect(await decodeShare(await payloadOf(good))).toMatchObject({ ok: true })
  })

  it('stops reading a link that inflates past 1 MB (a tiny link can unpack to gigabytes)', async () => {
    const bomb = await encodePayload(' '.repeat(4_000_000))
    expect(bomb.length).toBeLessThan(32_000)
    expect(await decodeShare(bomb)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('reads the payload from a URL hash, ignoring punctuation glued to the end', () => {
    expect(sharedPayload('#song=abc_-9')).toBe('abc_-9')
    expect(sharedPayload('#song=abc).')).toBe('abc')
    expect(sharedPayload('#song=')).toBe('')
    expect(sharedPayload('#other=abc')).toBeNull()
    expect(sharedPayload('')).toBeNull()
  })
})

describe('songs from links are checked more strictly', () => {
  const one = (edit: (s: Section) => Section): Song => {
    const song = bigSong()
    return { ...song, sections: [edit(song.sections[0]), ...song.sections.slice(1)] }
  }
  const firstClip = (edit: (c: Clip) => Clip) => one((s) => ({ ...s, clips: [edit(s.clips[0]), ...s.clips.slice(1)] }))

  it('accepts what the app makes: every progression in every meter and length, and meter changes', () => {
    expect(isSafeSong(bigSong())).toBe(true)
    for (const sig of TIME_SIGNATURES) {
      for (const bars of BAR_OPTIONS) {
        for (const prog of PROGRESSIONS) {
          const song = songFromTrack(progressionTrack({ ...DEFAULT_TRACK, sig, bars }, prog, { chords: true, instruments: true }))
          if (!isSafeSong(song)) throw new Error(`${prog.name} in ${sig.beats}/${sig.unit}, ${bars} bars`)
        }
      }
    }
    // Rescaled clips can have fractional ticks.
    expect(isSafeSong(rescaleSong(rescaleSong(bigSong(), { beats: 7, unit: 16 }), { beats: 5, unit: 4 }))).toBe(true)
  })

  it('rejects what the app never makes', () => {
    expect(isSafeSong(one((s) => ({ ...s, bars: 3 })))).toBe(false)
    expect(isSafeSong(firstClip((c) => ({ ...c, length: 2 * TICKS_PER_BAR })))).toBe(false) // overlaps the next
    expect(isSafeSong(firstClip((c) => ({ ...c, start: -10 })))).toBe(false)
    expect(isSafeSong(firstClip((c) => ({ ...c, length: 0 })))).toBe(false)
    expect(isSafeSong(one((s) => ({ ...s, clips: [...s.clips.slice(1), { ...s.clips[0], start: 4 * TICKS_PER_BAR }] })))).toBe(false) // past the end
    expect(isSafeSong(firstClip((c) => ({ ...c, chord: { ...C, inversion: 1e9 } })))).toBe(false)
    expect(isSafeSong(firstClip((c) => ({ ...c, chord: { ...C, add: ['zz'] } })))).toBe(false)
    expect(isSafeSong({ ...bigSong(), tonic: 'H' })).toBe(false)
    const song = bigSong()
    expect(isSafeSong({ ...song, arrangement: Array.from({ length: 1_001 }, (_, i) => ({ id: `b${i}`, section: song.sections[0].id })) })).toBe(false)
  })

  it('puts clips in order before checking (a hand-made link may list them any way)', () => {
    const song = bigSong()
    const reversed = toShared({ ...song, sections: song.sections.map((s) => ({ ...s, clips: [...s.clips].reverse() })) }, 'x')
    const result = fromShared(reversed, ids())
    if (!result.ok) throw new Error(result.reason)
    expect(toShared(result.song, 'x')).toEqual(toShared(song, 'x'))
  })
})

describe('opening a link adds a session', () => {
  const here = (name: string): SessionMeta => ({ id: name, name, created: 0, updated: 0, favorite: false, folder: null })

  it("is named after the shared one, '(shared)' if that's taken, 'Shared song' for an automatic name", () => {
    expect(sharedSessionName('Summer demo', ['Other'])).toBe('Summer demo')
    expect(sharedSessionName(' Summer demo ', ['Summer demo'])).toBe('Summer demo (shared)')
    expect(sharedSessionName('Summer demo', ['Summer demo', 'Summer demo (shared)'])).toBe('Summer demo (shared) 2')
    expect(sharedSessionName('Untitled session 3', [])).toBe('Shared song')
    expect(sharedSessionName('', ['Shared song'])).toBe('Shared song 2')
  })

  it('writes the song as a history with nothing to undo, under a new id, opening the Song panel when arranged', () => {
    const song = bigSong()
    const plan = planShared({ name: 'Summer demo', song }, [here('Summer demo')], ids(), 1234)
    expect(plan.sessions).toEqual([{ id: 'id1', name: 'Summer demo (shared)', created: 1234, updated: 1234, favorite: false, folder: null }])
    expect(plan.folders).toEqual([])
    expect(plan.renamed).toBe(1)
    const stored = Object.fromEntries(plan.writes)
    expect(stored['session:id1:songOpen']).toBe('true')
    const h = readHistory<Song>(JSON.parse(stored['session:id1:track']), songHistory('session:id1:'))
    expect(h?.present).toEqual(song)
    expect(h?.past).toEqual([])
    // Nothing arranged: the Song panel keeps its default (closed).
    const single = planShared({ name: 'Loop', song: songFromTrack(DEFAULT_TRACK) }, [], ids())
    expect(single.writes.map(([key]) => key)).toEqual(['session:id1:track'])
  })
})
