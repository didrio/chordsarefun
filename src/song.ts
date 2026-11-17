import type { StoredHistory } from './history'
import type { Chord } from './music/chord'
import { isGrooveSettings, sameGroove, type GrooveSettings } from './music/grooves'
import { progressionTrack, type Progression, type ProgressionParts } from './music/progressions'
import { MODES, type ModeName } from './music/theory'
import { chordClips, rescaleClips, sameClips, sigBarTicks, type Clip, type TimeSignature } from './music/timeline'
import { uniqueName } from './names'
import { DEFAULT_MUSIC, DEFAULT_TRACK, isBpm, isClip, isTimeSignature, isTrack, migrateTrack, type Track, type TrackMusic } from './track'

/**
 * A song: one or more sections (a progression with a label: Verse, Chorus…) sharing one
 * key, tempo and time signature. This is the undoable, saved document of a session.
 *
 * Shared song-wide: key (tonic + mood), tempo, time signature. Per section: chords, length
 * (bars), instruments. The rest of the app edits one section at a time through a `Track`
 * (the section seen with the song's shared settings, see `sectionTrack` / `withSectionTrack`),
 * so the chord editing rules never need to know about songs.
 *
 * A session with one unnamed section and nothing arranged is exactly the app before songs.
 */

export type Section = {
  id: string
  /** Its label ("Chorus", "Verse 2"), or null for the one progression of a session from before songs. */
  name: string | null
  clips: Clip[]
  bars: number
  groove: GrooveSettings
}

/** One appearance of a section in the song's order (T24). Two blocks of one section are the same music. */
export type Block = { id: string; section: string }

export type Song = {
  tonic: string
  mode: ModeName
  sig: TimeSignature
  bpm: number
  sections: Section[]
  arrangement: Block[]
}

/** The id of the section an old (single-progression) session becomes: fixed, so every step of its history agrees. */
export const MAIN_SECTION = 'main'

/** What an unnamed section is called on screen. */
export const UNNAMED_SECTION = 'Progression'

/** A track (one progression) as a song: one unnamed section, nothing arranged. */
export function songFromTrack(t: Track): Song {
  return {
    tonic: t.tonic,
    mode: t.mode,
    sig: t.sig,
    bpm: t.bpm,
    sections: [{ id: MAIN_SECTION, name: null, clips: t.clips, bars: t.bars, groove: t.groove }],
    arrangement: [],
  }
}

export const DEFAULT_SONG: Song = songFromTrack(DEFAULT_TRACK)

const isSection = (v: unknown): v is Section => {
  const s = v as Section
  return (
    typeof s === 'object' &&
    s !== null &&
    typeof s.id === 'string' &&
    (s.name === null || typeof s.name === 'string') &&
    Array.isArray(s.clips) &&
    s.clips.every(isClip) &&
    Number.isFinite(s.bars) &&
    isGrooveSettings(s.groove)
  )
}

/** Guards data loaded from storage. */
export const isSong = (v: unknown): v is Song => {
  const s = v as Song
  if (typeof s !== 'object' || s === null) return false
  if (typeof s.tonic !== 'string' || !(MODES as readonly string[]).includes(s.mode) || !isTimeSignature(s.sig) || !isBpm(s.bpm)) return false
  if (!Array.isArray(s.sections) || s.sections.length === 0 || !s.sections.every(isSection)) return false
  const ids = new Set(s.sections.map((x) => x.id))
  if (ids.size !== s.sections.length) return false
  return Array.isArray(s.arrangement) && s.arrangement.every((b) => typeof b?.id === 'string' && ids.has(b.section))
}

/**
 * Bring a stored value up to date: songs are kept as they are; a track (every session saved
 * before songs, old shapes included: see migrateTrack) becomes a song with one unnamed
 * section. Pure: `legacy` is the session's old groove and tempo, read by the caller.
 */
export function migrateSong(v: unknown, legacy: TrackMusic = DEFAULT_MUSIC): unknown {
  const s = v as { sections?: unknown }
  if (typeof s === 'object' && s !== null && Array.isArray(s.sections)) return v
  const t = migrateTrack(v, legacy)
  return isTrack(t) ? songFromTrack(t) : t
}

// --- Saving the history: each section version stored once -----------------------------

/** A song as saved: its sections are indices into the history's pool. */
type PackedSong = Omit<Song, 'sections'> & { sections: number[] }

export type PackedSongHistory = { pool: Section[] } & StoredHistory<PackedSong>

/**
 * The undo history as saved. An edit changes one section and keeps the others (same
 * objects), so storing each section version once, with steps pointing at it, keeps a song's
 * history about the size of a single progression's, instead of a copy of every section per step.
 */
export function packSongHistory(h: StoredHistory<Song>): PackedSongHistory {
  const pool: Section[] = []
  const byObject = new Map<Section, number>()
  const byContent = new Map<string, number>()
  const indexOf = (s: Section) => {
    let i = byObject.get(s)
    if (i === undefined) {
      // Equal copies (e.g. a freshly migrated history) are shared too.
      const key = JSON.stringify(s)
      i = byContent.get(key)
      if (i === undefined) {
        i = pool.length
        pool.push(s)
        byContent.set(key, i)
      }
      byObject.set(s, i)
    }
    return i
  }
  const pack = (song: Song): PackedSong => ({ ...song, sections: song.sections.map(indexOf) })
  return { pool, past: h.past.map(pack), present: pack(h.present), future: h.future.map(pack) }
}

/**
 * Reverses packSongHistory (steps share the pool's section objects again). Anything else (a
 * history saved before songs) is returned as it is, to be migrated step by step.
 */
export function unpackSongHistory(stored: unknown): unknown {
  const p = stored as PackedSongHistory
  if (typeof p !== 'object' || p === null || !Array.isArray(p.pool) || !Array.isArray(p.past) || !Array.isArray(p.future)) {
    return stored
  }
  const unpack = (song: unknown) => {
    const s = song as PackedSong
    if (typeof s !== 'object' || s === null || !Array.isArray(s.sections)) return song
    // An index that isn't in the pool gives undefined, which isSong rejects.
    return { ...s, sections: s.sections.map((i) => p.pool[i]) }
  }
  return { past: p.past.map(unpack), present: unpack(p.present), future: p.future.map(unpack) }
}

// --- One section seen as a track ---------------------------------------------------------

/** The section with this id, or the first one (an id from storage may be stale). */
export const sectionOf = (song: Song, id: string): Section => song.sections.find((s) => s.id === id) ?? song.sections[0]

/** A section as a track: its chords, length and instruments with the song's key, tempo and time signature. */
export function sectionTrack(song: Song, id: string): Track {
  const s = sectionOf(song, id)
  return { clips: s.clips, bars: s.bars, groove: s.groove, tonic: song.tonic, mode: song.mode, sig: song.sig, bpm: song.bpm }
}

/**
 * Write an edited section track back: the shared settings to the song, the rest to the
 * section. Other sections keep their objects, and when nothing changed the same song comes
 * back, so history adds no step for a no-op edit (it compares by reference).
 */
export function withSectionTrack(song: Song, id: string, t: Track): Song {
  const s = sectionOf(song, id)
  const sectionSame = t.clips === s.clips && t.bars === s.bars && t.groove === s.groove
  const songSame = t.tonic === song.tonic && t.mode === song.mode && t.sig === song.sig && t.bpm === song.bpm
  if (sectionSame && songSame) return song
  return {
    ...song,
    tonic: t.tonic,
    mode: t.mode,
    sig: t.sig,
    bpm: t.bpm,
    sections: sectionSame ? song.sections : song.sections.map((x) => (x === s ? { ...s, clips: t.clips, bars: t.bars, groove: t.groove } : x)),
  }
}

/** Same chords, length and instruments (not the name), whether or not they're the same objects. */
const sameMusic = (a: Section, b: Section) =>
  a === b || (a.bars === b.bars && sameGroove(a.groove, b.groove) && sameClips(a.clips, b.clips))

/**
 * After undo or redo takes the song from `a` to `b`: the section to show, so the change is
 * never off screen. The edited one (`current`) if it changed or no section's music did (a key,
 * tempo or meter change, a rename); otherwise the first section that changed or came back.
 * If `current` is gone (undoing "+ Section"), the section before it.
 */
export function changedSection(a: Song, b: Song, current: string): string {
  if (!b.sections.some((s) => s.id === current)) {
    const i = a.sections.findIndex((s) => s.id === current)
    const before = a.sections
      .slice(0, Math.max(i, 0))
      .reverse()
      .find((s) => b.sections.some((x) => x.id === s.id))
    return before?.id ?? b.sections[0].id
  }
  const changed = b.sections.filter((s) => {
    const old = a.sections.find((x) => x.id === s.id)
    return !old || !sameMusic(old, s)
  })
  if (changed.length === 0 || changed.some((s) => s.id === current)) return current
  return changed[0].id
}

// --- Labels ------------------------------------------------------------------------------

export type SectionKind = 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'breakdown' | 'drop' | 'outro'

/** The labels "+ Section" offers, in song order, each with a color (hue) and what it's for in plain words. */
export const SECTION_LABELS: { kind: SectionKind; label: string; hue: number; hint: string }[] = [
  { kind: 'intro', label: 'Intro', hue: 190, hint: 'Opens the song' },
  { kind: 'verse', label: 'Verse', hue: 215, hint: 'Tells the story; usually calmer' },
  { kind: 'pre-chorus', label: 'Pre-chorus', hue: 45, hint: 'Builds up to the chorus' },
  { kind: 'chorus', label: 'Chorus', hue: 330, hint: 'The hook: the part everyone remembers' },
  { kind: 'bridge', label: 'Bridge', hue: 150, hint: 'Something different before the last chorus' },
  { kind: 'breakdown', label: 'Breakdown', hue: 270, hint: 'Strips back to a few parts' },
  { kind: 'drop', label: 'Drop', hue: 10, hint: 'The big moment after a build-up' },
  { kind: 'outro', label: 'Outro', hue: 95, hint: 'Closes the song' },
]

/** The name "Other…" starts with (then renamed). */
export const OTHER_SECTION = 'Section'

/** A section's name on screen. */
export const sectionName = (s: Section) => s.name ?? UNNAMED_SECTION

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

/** What kind of section a name is ("Verse 2", "pre chorus" → verse, pre-chorus), or null for anything else. */
export function sectionKind(name: string | null): SectionKind | null {
  if (name === null) return null
  const base = letters(name.replace(/\s*\d+$/, ''))
  return SECTION_LABELS.find((l) => letters(l.label) === base)?.kind ?? null
}

/** A section's color (hue), by its kind; null (gray) for unnamed and other sections. */
export const sectionHue = (s: Section): number | null => SECTION_LABELS.find((l) => l.kind === sectionKind(s.name))?.hue ?? null

// --- Section edits (each one undo step) --------------------------------------------------

const names = (song: Song, except?: string) => song.sections.filter((s) => s.id !== except).map(sectionName)

/** A new, empty section named `label` (numbered if taken: "Verse 2"), with `from`'s instruments and length, last. */
export function addSection(song: Song, id: string, label: string, fromId: string): Song {
  const from = sectionOf(song, fromId)
  const section: Section = { id, name: uniqueName(label, names(song)), clips: [], bars: from.bars, groove: from.groove }
  return { ...song, sections: [...song.sections, section] }
}

/** Rename a section (trimmed; kept unique by numbering). Empty or unchanged names change nothing. */
export function renameSection(song: Song, id: string, name: string): Song {
  const s = song.sections.find((x) => x.id === id)
  const trimmed = name.trim()
  if (!s || !trimmed || trimmed === sectionName(s)) return song
  const next = uniqueName(trimmed, names(song, id))
  return { ...song, sections: song.sections.map((x) => (x === s ? { ...s, name: next } : x)) }
}

/**
 * "Make a new section from this": an independent copy (same chords, length, instruments)
 * right after it, numbered ("Chorus" → "Chorus 2"). Repeats in the arrangement stay linked to
 * the original; the copy is free to change.
 */
export function copySection(song: Song, id: string, newId: string): Song {
  const i = song.sections.findIndex((x) => x.id === id)
  if (i < 0) return song
  const s = song.sections[i]
  const copy: Section = { ...s, id: newId, name: uniqueName(sectionName(s).replace(/\s*\d+$/, ''), names(song)) }
  return { ...song, sections: [...song.sections.slice(0, i + 1), copy, ...song.sections.slice(i + 1)] }
}

/** Delete a section and its places in the arrangement. A song always keeps at least one section. */
export function removeSection(song: Song, id: string): Song {
  if (song.sections.length <= 1 || !song.sections.some((s) => s.id === id)) return song
  return {
    ...song,
    sections: song.sections.filter((s) => s.id !== id),
    arrangement: song.arrangement.filter((b) => b.section !== id),
  }
}

// --- Song-wide changes -------------------------------------------------------------------

/** A new time signature: every section's chords stretch with the bars (one chord per bar stays one per bar). */
export function rescaleSong(song: Song, sig: TimeSignature): Song {
  if (sig.beats === song.sig.beats && sig.unit === song.sig.unit) return song
  const factor = sigBarTicks(sig) / sigBarTicks(song.sig)
  return { ...song, sig, sections: song.sections.map((s) => (s.clips.length ? { ...s, clips: rescaleClips(s.clips, factor) } : s)) }
}

/** Every chord of every section changed by `fn` (e.g. moved to another key). Empty spots stay empty. */
export function mapSongChords(song: Song, fn: (chord: Chord) => Chord): Song {
  return {
    ...song,
    sections: song.sections.map((s) => ({ ...s, clips: s.clips.map((c) => (c.chord ? { ...c, chord: fn(c.chord) } : c)) })),
  }
}

/** Whether any section has a chord. */
export const songHasChords = (song: Song) => song.sections.some((s) => chordClips(s.clips).length > 0)

/**
 * Every section's clips laid end to end in section order, for questions about the whole song
 * (which key do the chords point to?). For analysis only: ids may repeat across sections.
 */
export function songClips(song: Pick<Song, 'sections' | 'sig'>): Clip[] {
  const bar = sigBarTicks(song.sig)
  let offset = 0
  return song.sections.flatMap((s) => {
    const at = offset
    offset += s.bars * bar
    return s.clips.map((c) => ({ ...c, start: c.start + at }))
  })
}

/**
 * Take a progression's chords, instruments or both into one section (progressionTrack). Its
 * tempo becomes the song's. Its mood becomes the song's only when no other section has
 * chords: the key is shared, and the other sections were written in it.
 */
export function songWithProgression(song: Song, id: string, prog: Progression, parts: ProgressionParts): Song {
  const target = sectionOf(song, id)
  const othersHaveChords = song.sections.some((s) => s !== target && chordClips(s.clips).length > 0)
  const t = sectionTrack(song, id)
  const next = progressionTrack(t, prog, parts)
  return withSectionTrack(song, id, othersHaveChords ? { ...next, mode: t.mode } : next)
}
