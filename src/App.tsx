import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChordInspector, type InspectorTab } from './components/ChordInspector'
import { ChordMenu, type ChordMenuGroup } from './components/ChordMenu'
import { NotesLane } from './components/NotesLane'
import { ProgressionBrowser } from './components/ProgressionBrowser'
import { HomeNotice } from './components/HomeNotice'
import { DiceIcon } from './components/DiceIcon'
import { InstrumentsPanel } from './components/InstrumentsPanel'
import { ArrowIcon } from './components/ArrowIcon'
import { HelpTip } from './components/HelpTip'
import { ExportMenu, type ExportChoice } from './components/ExportMenu'
import { ExportStatus, type ExportJob } from './components/ExportStatus'
import { SongMenu } from './components/SongMenu'
import { Panel } from './components/Panel'
import { LoopIcon, PauseIcon, PlayIcon, PlusIcon, RedoIcon, StopIcon, UndoIcon } from './components/Icons'
import { SessionMenu } from './components/SessionBrowser'
import { SongPanel } from './components/SongPanel'
import type { BlockDrag } from './components/useBlockDrag'
import { Timeline } from './components/Timeline'
import { useChordDrag, type DragState } from './components/useChordDrag'
import { describeDrop, heldName } from './dropLabel'
import { legacyMusic, sessionPrefix, songHistory, useSessions, type Sessions } from './session'
import { downloadBackup } from './backup'
import { SaveWarning } from './components/SaveWarning'
import { ShareMenu } from './components/ShareMenu'
import { ShareNotice, type ShareOutcome } from './components/ShareNotice'
import { decodeShare, planShared, sharedPayload } from './share'
import { useHistory } from './history'
import { askToKeepStorage, usePersistentState } from './persist'
import { clickSelect, EMPTY_SELECTION, pruneSelection, selectAll, type ClickMods, type Selection } from './selection'
import { shortcutFor } from './shortcuts'
import { COPY_KEY, DUPLICATE_KEY, IS_MAC, TAP } from './platform'
import { DEFAULT_TRACK, withMusic, type Track, type TrackMusic } from './track'
import {
  addSection,
  blockSpans,
  changedSection,
  copySection,
  duplicateBlocks,
  forkBlock,
  insertBlocks,
  moveBlocks,
  removeBlocks,
  sectionSegments,
  songSegments,
  songTicks,
  stepGap,
  MAIN_SECTION,
  mapSongChords,
  removeSection,
  renameSection,
  rescaleSong,
  sectionName,
  sectionOf,
  sectionTrack,
  songClips,
  songFromTrack,
  songHasChords,
  songWithProgression,
  withSectionTrack,
  type Section,
  type Song,
} from './song'
import {
  ensureAudio,
  renderAudio,
  pausePlayback,
  playheadTicks,
  previewChord,
  previewProgression,
  schedule,
  seekPlayback,
  setBpm as setTransportBpm,
  setMetronome,
  setGroove as setAudioGroove,
  silenceAll,
  startPlayback,
  stopPlayback,
  stopPreview,
} from './music/audio'
import { canInvert, chordName, invert, shiftOctave, type Chord } from './music/chord'
import { downloadMidi, PART_LABELS } from './music/midi'
import { renderedWav } from './music/wav'
import { downloadFile } from './download'
import { exportFileName } from './names'
import { keyCandidates, suggestHome, type Home } from './music/home'
import { inContext } from './music/suggest'
import { PROGRESSIONS, type Progression, type ProgressionParts } from './music/progressions'
import {
  applyGroove,
  GROOVES,
  matchingGroove,
  pickRandom,
  type GrooveSettings,
} from './music/grooves'
import {
  chordToKey,
  isDiatonic,
  rootDegree,
  type PaletteFlavor,
} from './music/theory'
import { segmentsEnd } from './music/segments'
import { fitOctave, smoothVoicing } from './music/voicing'
import {
  addEmptyClip,
  addNextEmptyClip,
  chordClips,
  dropChanges,
  fitToLength,
  gridStep,
  GRIDS,
  nudgeClips,
  planDrop,
  planDuplicate,
  playbackEnd,
  removeClip,
  resizeClip,
  sameClips,
  sigBarTicks,
  sigBeatTicks,
  stepGrid,
  TICKS_PER_BEAT,
  updateChords,
  type Clip,
  type GridKey,
  type HeldChord,
  type TimeSignature,
} from './music/timeline'

/** Take the shared song out of the URL (keeping the page and its query), so a reload doesn't open it again. */
const clearShareHash = () => window.history.replaceState(window.history.state, '', location.pathname + location.search)

/**
 * The app shell: sessions. The workspace below is keyed by session, so switching
 * sessions remounts it and every setting loads from that session's saved values.
 */
export default function App() {
  const sessions = useSessions()
  const flushRef = useRef<() => void>(() => {})
  /** Save what's on screen first, so a switch, copy or backup has the latest edits and undo history. */
  const flush = () => flushRef.current()

  // A shared song in the URL (`#song=…`, share.ts): read on load, and when the hash changes (a link
  // pasted into a tab that's already open). It becomes a new session, opened; the hash is then cleared.
  const [incoming, setIncoming] = useState(() => sharedPayload(location.hash))
  // While a link from the page load is read (a few ms), show nothing, so the last session doesn't flash first.
  const [booting, setBooting] = useState(incoming !== null)
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome | null>(null)
  const latestSessions = useRef(sessions)
  useEffect(() => {
    latestSessions.current = sessions
  })
  useEffect(() => {
    const onHash = () => setIncoming(sharedPayload(location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    if (incoming === null) return
    let cancelled = false // StrictMode runs this twice: only the second one imports
    void decodeShare(incoming).then((result) => {
      if (cancelled) return
      // A link from a newer app stays in the URL, so reloading (and getting that app) opens it.
      if (result.ok || result.reason !== 'too-new') clearShareHash()
      if (!result.ok) setShareOutcome({ kind: result.reason })
      else {
        flushRef.current()
        const s = latestSessions.current
        const plan = planShared(result, s.sessions)
        const meta = plan.sessions[0]
        setShareOutcome(s.importSessions(plan, meta.id) ? { kind: 'opened', name: meta.name } : { kind: 'full' })
      }
      setIncoming(null)
      setBooting(false)
    })
    return () => {
      cancelled = true
    }
  }, [incoming])
  const dismissShare = () => {
    if (shareOutcome?.kind === 'too-new') clearShareHash()
    setShareOutcome(null)
  }

  const open = (id: string) => {
    flush()
    sessions.open(id)
  }
  const duplicate = (id: string) => {
    if (id === sessions.current) flush()
    return sessions.duplicate(id)
  }
  const newSession = (folder: string | null) => {
    flush()
    sessions.create(folder)
  }
  const backup = () => {
    flush()
    downloadBackup()
  }
  if (booting) return null
  return (
    <Workspace
      key={sessions.current}
      prefix={sessionPrefix(sessions.current)}
      sessions={sessions}
      flushRef={flushRef}
      onBackup={backup}
      shareOutcome={shareOutcome}
      onShareDone={dismissShare}
      sessionMenu={(onBeforePreview) => (
        <SessionMenu
          sessions={sessions}
          onFlush={flush}
          onOpen={open}
          onNew={newSession}
          onDuplicate={duplicate}
          onBackup={backup}
          onBeforePreview={onBeforePreview}
        />
      )}
    />
  )
}

const isSelection = (v: unknown) => {
  const s = v as Selection
  return typeof s === 'object' && s !== null && Array.isArray(s.ids) && s.ids.every((id) => typeof id === 'string')
}

/** Elements whose clicks don't clear the clip selection. */
const KEEPS_SELECTION =
  '.clip, .song-block, button, input, select, label, summary, .ruler, .panel, .notes-lane, .dropdown, .floating-notices, .modal-backdrop, .chord-menu'

/** Chord size for ideas. The Triads/7ths/9ths toggle is gone with the palette, so ideas use triads. */
const flavor: PaletteFlavor = 'triads'

/** Grooves random picks choose from: not plain "Just chords", and not the 3/4-only waltz. */
const RANDOM_GROOVES = GROOVES.filter((g) => g.id !== 'just' && g.id !== 'waltz')

/** Longest a chord sounds in a progression preview, so previews stay quick at slow tempos. */
const MAX_PREVIEW_SECONDS = 1.5

type WorkspaceProps = {
  /** Storage key prefix of the session (see session.ts). */
  prefix: string
  sessions: Sessions
  /** The sessions trigger (and window), shown in the song bar; given a way to pause the song before hearing a session. */
  sessionMenu: (onBeforePreview: () => void) => ReactNode
  /** Set to this workspace's "save everything now", so a session can be copied right away. */
  flushRef: { current: () => void }
  /** Save everything, then download a backup of every session (the save warning offers it). */
  onBackup: () => void
  /** What opening a shared link did (shown as a notice until dismissed), or null. */
  shareOutcome: ShareOutcome | null
  onShareDone: () => void
}

function Workspace({ prefix, sessions, sessionMenu, flushRef, onBackup, shareOutcome, onShareDone }: WorkspaceProps) {
  // Everything here is saved in the session (keys listed in SESSION_KEYS).
  const k = (key: string) => prefix + key
  // Hidden by default: powerful, but a lot on first sight.
  const [moreOpen, setMoreOpen] = usePersistentState(k('moreOpen'), false)
  const [instrumentsOpen, setInstrumentsOpen] = usePersistentState(k('instrumentsOpen'), false)
  const [songOpen, setSongOpen] = usePersistentState(k('songOpen'), false)
  const [gridKey, setGridKey] = usePersistentState<GridKey>(k('grid'), '1/4', (v) => GRIDS.some((g) => g.key === v))
  const [loop, setLoop] = usePersistentState(k('loop'), true)
  const [metronomeOn, setMetronomeOn] = usePersistentState(k('metronome'), false)
  const [metronomeVolume, setMetronomeVolume] = usePersistentState(k('metronomeVolume'), 0.6)
  // The details panel's tab is sticky (like a DAW's device view): it stays on whatever you used last.
  const [inspectorTab, setInspectorTab] = usePersistentState<InspectorTab>(
    k('inspectorTab'),
    'ideas',
    (v) => v === 'ideas' || v === 'flavors' || v === 'notes',
  )
  // The details panel shows the inspected clip: the last one selected on its own. It
  // stays when you click elsewhere (deselect); only selecting another clip switches it.
  const [inspectedId, setInspectedId] = usePersistentState<string | null>(
    k('inspected'),
    null,
    (v) => v === null || typeof v === 'string',
  )
  // The song (key, tempo, time signature, and its sections: chords, length, instruments) is the
  // undoable, saved document. Sessions saved before songs open as a song with one unnamed
  // section; those saved before the instruments and tempo joined the track get their old values.
  const [legacy] = useState(() => legacyMusic(prefix))
  const [songPersist] = useState(() => songHistory(prefix, legacy))
  const song = useHistory<Song>(songFromTrack({ ...DEFAULT_TRACK, ...legacy }), songPersist)
  // The section being edited: session state, not part of undo (like the selection). A stale id means the first.
  const [storedSection, setStoredSection] = usePersistentState<string>(k('section'), MAIN_SECTION, (v) => typeof v === 'string')
  const section = sectionOf(song.value, storedSection)
  const sectionId = section.id
  /** An edit of the edited section's track, as an edit of the song (key, tempo and meter go to the song). */
  const inSection = (update: (t: Track) => Track) => (s: Song) => withSectionTrack(s, sectionId, update(sectionTrack(s, sectionId)))
  /**
   * Edits of the edited section seen as a track (its chords, length and instruments with the
   * song's key, tempo and time signature). Everything that edits chords goes through this and
   * never needs to know about songs; song-wide changes (key, meter) use `song` directly.
   */
  const track = {
    commit: (update: (t: Track) => Track) => song.commit(inSection(update)),
    beginGesture: song.beginGesture,
    updateGesture: (update: (t: Track) => Track) => song.updateGesture(inSection(update)),
  }
  useEffect(() => {
    flushRef.current = song.flush
  })
  // Leaving the session (switching): silence everything it was playing or previewing, so
  // nothing from it sounds in the session that opens next (which never starts playing by itself).
  useEffect(() => () => silenceAll(), [])
  // "Last edited" in the session list.
  const touch = useRef(sessions.touch)
  useEffect(() => {
    touch.current = sessions.touch
  })
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    touch.current()
  }, [song.value])
  // "Opened … from a link" goes away by itself once you edit the song (compared with the song as it opened,
  // not "after the first render", which StrictMode runs twice).
  const songAtOpen = useRef(song.value)
  const shareDone = useRef(onShareDone)
  useEffect(() => {
    shareDone.current = shareOutcome?.kind === 'opened' ? onShareDone : () => {}
  })
  useEffect(() => {
    if (song.value !== songAtOpen.current) shareDone.current()
  }, [song.value])
  const { tonic, mode, sig, bpm, sections, arrangement } = song.value
  const { clips, bars, groove } = section
  const barTicks = sigBarTicks(sig)
  const beatTicks = sigBeatTicks(sig)
  const gridTicks = gridStep(gridKey, barTicks)
  const withClips = (update: (c: Clip[]) => Clip[]) => (t: Track) => {
    const next = update(t.clips)
    return sameClips(next, t.clips) ? t : { ...t, clips: next }
  }
  const setClips = (update: (c: Clip[]) => Clip[]) => track.commit(withClips(update))
  /** Instruments and tempo: one undo step per change (no step if nothing changed). */
  const setMusic = (music: Partial<TrackMusic>) => track.commit((t) => withMusic(t, music))
  const setBpm = (bpm: number) => setMusic({ bpm })
  const setGroove = (groove: GrooveSettings) => setMusic({ groove })
  /** A slider being dragged: the whole drag is one undo step, started by track.beginGesture. */
  const slideGroove = (groove: GrooveSettings) => track.updateGesture((t) => withMusic(t, { groove }))
  // Saved too, so a session reopens with the same chord (and its panel) open.
  const [rawSelection, setSelection] = usePersistentState<Selection>(k('selection'), EMPTY_SELECTION, isSelection)
  const [playState, setPlayState] = useState<'stopped' | 'playing' | 'paused'>('stopped')
  /**
   * What the transport plays: the edited section, or the whole song (▶ Song). One transport,
   * never two things at once; Space resumes whichever was used last.
   */
  const [playScope, setPlayScope] = useState<'section' | 'song'>('section')
  /** Playheads in ticks while stopped/paused (the section's and the song's); while playing the audio transport is the source of truth. */
  const [playhead, setPlayhead] = useState(0)
  const [songPlayhead, setSongPlayhead] = useState(0)
  const isPlaying = playState === 'playing'
  /** Set when a progression is loaded mid-playback: restart from the top once it's scheduled. */
  const restartRef = useRef(false)
  /** Set when playback switches between the section and the song: start from here once the other is scheduled. */
  const pendingStart = useRef<number | null>(null)

  const totalTicks = bars * barTicks
  // Undo can shorten the track (or the song) under the playhead.
  const playheadPos = playhead < totalTicks ? playhead : 0
  // The song: its blocks back to back, and what playing it plays (one segment per block).
  const spans = useMemo(() => blockSpans({ sections, sig, arrangement }), [sections, sig, arrangement])
  const songLength = useMemo(() => songTicks({ sections, sig, arrangement }), [sections, sig, arrangement])
  const songSegs = useMemo(() => songSegments(song.value), [song.value])
  const songPos = songPlayhead < songLength ? songPlayhead : 0

  // Exporting: an audio render runs in the background (one at a time) with its progress shown.
  const [exportJob, setExportJob] = useState<ExportJob | null>(null)
  const renderAbort = useRef<AbortController | null>(null)
  // Opening another session cancels a render still running.
  useEffect(() => () => renderAbort.current?.abort(), [])
  // A song with no blocks left (removed, undone) can't be what plays: the section takes over.
  const scope: 'section' | 'song' = playScope === 'song' && songLength > 0 ? 'song' : 'section'
  const songScope = scope === 'song'
  const sectionPlaying = isPlaying && !songScope
  const songPlaying = isPlaying && songScope
  // The key is the song's: detection and the suggestion look at every section's chords.
  const allClips = useMemo(() => songClips({ sections, sig, arrangement }), [sections, sig, arrangement])
  const hasWork = allClips.some((c) => c.chord !== null)
  // Once there's work worth keeping, ask the browser not to clear it when space runs low.
  useEffect(() => {
    if (hasWork) askToKeepStorage()
  }, [hasWork])
  const homeSuggestion = useMemo(() => suggestHome(allClips, { tonic, mode }), [allClips, tonic, mode])
  const detectedKeys = useMemo(() => keyCandidates(allClips), [allClips])
  /**
   * After a home change: the home the chords were written in, offered as "move them".
   * It lasts while every section is untouched (same sections array) and home is still `to`.
   */
  const [homeOffer, setHomeOffer] = useState<{ from: Home; to: Home; sections: Section[] } | null>(null)
  const activeOffer =
    homeOffer && homeOffer.sections === sections && homeOffer.to.tonic === tonic && homeOffer.to.mode === mode ? homeOffer : null
  // Undo/delete can remove selected clips; ignore ids that no longer exist.
  const selection = pruneSelection(rawSelection, clips)
  const selectedIds = selection.ids
  const sortedClips = [...clips].sort((a, b) => a.start - b.start)
  const selectedClips = sortedClips.filter((c) => selectedIds.includes(c.id))
  const multiSelected = selectedClips.length > 1
  const inspected = clips.find((c) => c.id === inspectedId) ?? null
  /** The nearest chords before/after a clip (empty clips skipped), and where a looping track goes back to. */
  const spotOf = (id: string) => {
    const i = sortedClips.findIndex((c) => c.id === id)
    const prev = [...sortedClips.slice(0, i)].reverse().find((c) => c.chord)?.chord ?? null
    const next = sortedClips.slice(i + 1).find((c) => c.chord)?.chord ?? null
    const first = sortedClips.find((c) => c.chord)
    const loopTo = !next && loop && first && first.id !== id ? first.chord : null
    return { prev, next, loopTo, tonic, mode, flavor }
  }
  // The song's blocks have their own selection; selecting blocks clears the chords' and vice versa.
  const [rawBlockSelection, setBlockSelection] = useState<Selection>(EMPTY_SELECTION)
  const blockSelection = pruneSelection(rawBlockSelection, spans)
  const selectedBlocks = blockSelection.ids
  const blocksActive = selectedBlocks.length > 0
  /**
   * Change the selection, and with it the details panel: one clip selected shows it on
   * that clip (on the tab used last); several show its empty state. Deselecting leaves it as it is.
   */
  const select = (next: Selection) => {
    setSelection(next)
    if (next.ids.length > 0) setBlockSelection(EMPTY_SELECTION)
    if (next.ids.length !== 1) return
    setInspectedId(next.ids[0])
  }
  const selectOnly = (id: string) => select({ ids: [id], anchor: id })
  const clearSelection = () => setSelection(EMPTY_SELECTION)


  useEffect(() => setTransportBpm(bpm), [bpm])
  useEffect(() => setMetronome(metronomeOn, metronomeVolume), [metronomeOn, metronomeVolume])
  useEffect(() => setAudioGroove(groove), [groove])

  /** Each scope's length, playhead (while stopped) and setter. */
  const scopes = {
    section: { total: totalTicks, pos: playheadPos, set: setPlayhead },
    song: { total: songLength, pos: songPos, set: setSongPlayhead },
  }

  /** Stop and return the scope that plays (or played last) to its start. */
  const stop = () => {
    stopPlayback()
    setPlayState('stopped')
    scopes[scope].set(0)
  }
  const stopRef = useRef(stop)
  useEffect(() => {
    stopRef.current = stop
  })

  const sectionSegs = useMemo(() => sectionSegments(song.value, storedSection), [song.value, storedSection])
  const segments = songScope ? songSegs : sectionSegs
  const scopeTicks = songScope ? songLength : totalTicks

  // Keep the audio schedule in sync with what plays (live edits while playing).
  useEffect(() => {
    // A progression loaded while playing restarts from the top (seek first: in one-shot
    // mode a shorter track would otherwise end playback right away).
    if (restartRef.current) {
      restartRef.current = false
      if (!songScope) seekPlayback(0)
    }
    schedule({ segments, totalTicks: scopeTicks, sig, loop, onEnd: () => stopRef.current() })
    // Switching between the section and the song: start once the new one is scheduled.
    if (pendingStart.current !== null) {
      startPlayback(pendingStart.current)
      pendingStart.current = null
    }
  }, [segments, scopeTicks, sig, loop, songScope])

  /** In play-once mode, playback ends with the last chord (or the track, if empty). */
  const endOf = (scope: 'section' | 'song') => (scope === 'song' ? segmentsEnd(songSegs) : playbackEnd(clips, totalTicks))
  const pastEnd = (ticks: number, which = scope) => !loop && ticks >= endOf(which)

  /** Pause whatever plays, keeping its position. */
  const pause = () => {
    scopes[scope].set(pausePlayback() % Math.max(scopeTicks, 1))
    setPlayState('paused')
  }

  /**
   * Play the section or the song from its playhead. If the other one is playing, it stops (its
   * position kept) and this one starts once it's scheduled.
   */
  const play = (which: 'section' | 'song') => {
    if (which === 'song' && songLength === 0) return
    const pos = scopes[which].pos
    const from = pastEnd(pos, which) ? 0 : pos
    stopPreview() // a preview still going would play over the track
    ensureAudio() // must be kicked off inside the user gesture
    scopes[which].set(from)
    if (which === scope) startPlayback(from)
    else {
      if (isPlaying) scopes[scope].set(pausePlayback() % Math.max(scopeTicks, 1))
      else stopPlayback()
      pendingStart.current = from
      setPlayScope(which)
    }
    setPlayState('playing')
  }

  /** Space: pause whatever plays, or resume the one used last. */
  const togglePlay = () => (isPlaying ? pause() : play(scope))

  /**
   * Move a playhead (a ruler, or a click on empty track space). While the other scope plays,
   * only this one's position changes; otherwise this scope becomes the one Space plays.
   */
  const seekIn = (which: 'section' | 'song', ticks: number) => {
    const t = Math.min(Math.max(ticks, 0), scopes[which].total - 1)
    if (which !== scope) {
      if (!isPlaying) {
        stopPlayback()
        setPlayState('stopped')
        setPlayScope(which)
      }
      scopes[which].set(t)
      return
    }
    if (isPlaying && pastEnd(t)) {
      pausePlayback()
      setPlayState('paused')
    } else if (isPlaying) {
      seekPlayback(t)
    }
    scopes[which].set(t)
  }
  const seek = (ticks: number) => seekIn('section', ticks)

  /** Where the chord track's playhead is while something plays: in song mode only while the edited section sounds. */
  const playheadAt = (): number | null => {
    const t = playheadTicks()
    if (!songScope) return t % totalTicks
    const at = songLength ? t % songLength : 0
    const block = spans.find((b) => b.start <= at && at < b.start + b.length)
    return block?.section === sectionId ? at - block.start : null
  }

  /** ⌘D / Ctrl+D: copies of the selected chords right after them (planDuplicate), selected. */
  const duplicateSelected = () => {
    const copyIds = Object.fromEntries(selectedIds.map((id) => [id, crypto.randomUUID()]))
    const result = planDuplicate(clips, selectedIds, copyIds, totalTicks, gridTicks, barTicks)
    if (!result) return
    setClips(() => result.clips)
    select({ ids: result.placedIds, anchor: result.placedId })
  }

  /** ⌥←/→ (Mac) or Ctrl+←/→: the selected chords one grid step into empty space (nudgeClips). */
  const nudgeSelected = (dir: -1 | 1) => {
    const moved = nudgeClips(clips, selectedIds, dir, gridTicks, totalTicks, beatTicks, barTicks)
    if (moved) setClips(() => moved)
  }

  /** Clear chord: the selected chords become empty spots, staying where they are. */
  const clearSelected = () => {
    setClips((c) => c.map((x) => (selectedIds.includes(x.id) ? { ...x, chord: null } : x)))
    // An empty spot has no flavors; land on its ideas (and stay there once it's filled).
    setInspectorTab((t) => (t === 'flavors' ? 'ideas' : t))
  }

  /** The chord menu: where it's open (viewport pixels), or null. It acts on the selection. */
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  /** Right-click or ⋯ on a chord: acts on the selection, or on that chord if it isn't selected. */
  const openChordMenu = (clip: Clip, x: number, y: number) => {
    if (!selectedIds.includes(clip.id)) selectOnly(clip.id)
    setMenuAt({ x, y })
  }

  const removeSelected = () => {
    if (selectedIds.length === 0) return
    setClips((c) => c.filter((clip) => !selectedIds.includes(clip.id)))
    clearSelection()
  }

  /**
   * Edit another section: its chords show on the track, and the selection and chord details
   * start fresh. Playback keeps going, now with this section's chords and instruments.
   */
  const switchSection = (id: string) => {
    if (id === sectionId) return
    setStoredSection(id)
    setSelection(EMPTY_SELECTION)
    setInspectedId(null)
    setMenuAt(null)
  }

  /** "+ Section": a new, empty section with this one's instruments and length; you go straight to it. */
  const newSection = (label: string) => {
    const id = crypto.randomUUID()
    song.commit((s) => addSection(s, id, label, sectionId))
    switchSection(id)
    return id
  }

  /** "Make a new section from this": an independent copy to change, opened right away. */
  const forkSection = (id: string) => {
    const copyId = crypto.randomUUID()
    song.commit((s) => copySection(s, id, copyId))
    switchSection(copyId)
  }

  /** Delete a section (undoable). Deleting the one being edited opens its neighbor. */
  const deleteSection = (id: string) => {
    if (sections.length <= 1) return
    if (id === sectionId) {
      const i = sections.findIndex((s) => s.id === id)
      switchSection((sections[i - 1] ?? sections[i + 1]).id)
    }
    song.commit((s) => removeSection(s, id))
  }

  // --- The song timeline: blocks are where sections play in the song ---------------------------

  /** Click a block: select it (Shift range, ⌘/Ctrl toggle) and edit its section. */
  const clickBlock = (id: string, mods: ClickMods = { shift: false, toggle: false }) => {
    const block = spans.find((b) => b.id === id)
    if (!block) return
    setBlockSelection(clickSelect(blockSelection, spans, id, mods))
    setSelection(EMPTY_SELECTION)
    switchSection(block.section)
  }

  /** The selected blocks' sections in song order (what a copy of them plays). */
  const sectionsOf = (ids: string[]) => arrangement.filter((b) => ids.includes(b.id)).map((b) => b.section)

  /** A drop on the song timeline: a section added, blocks moved, or copied (linked). The result is selected. */
  const dropOnSong = ({ source, gap, copy }: BlockDrag & { gap: number }) => {
    if (source.kind === 'move' && !copy) {
      song.commit((s) => moveBlocks(s, source.ids, gap))
      setBlockSelection({ ids: source.ids, anchor: source.ids[0] })
      return
    }
    const sectionIds = source.kind === 'add' ? [source.section] : sectionsOf(source.ids)
    const newIds = sectionIds.map(() => crypto.randomUUID())
    song.commit((s) => insertBlocks(s, gap, sectionIds, newIds))
    setBlockSelection({ ids: newIds, anchor: newIds[0] })
    setSelection(EMPTY_SELECTION)
  }

  /** "Add every section in order": the empty song's quick start. */
  const addEverySection = () => {
    const newIds = sections.map(() => crypto.randomUUID())
    song.commit((s) => insertBlocks(s, s.arrangement.length, sections.map((x) => x.id), newIds))
  }

  /** ⌘D on blocks: linked copies right after them, selected. */
  const duplicateSelectedBlocks = () => {
    const newIds = selectedBlocks.map(() => crypto.randomUUID())
    song.commit((s) => duplicateBlocks(s, selectedBlocks, newIds))
    setBlockSelection({ ids: newIds, anchor: newIds[0] })
  }

  /** Delete on blocks: out of the song (the sections stay). */
  const removeSelectedBlocks = () => {
    song.commit((s) => removeBlocks(s, selectedBlocks))
    setBlockSelection(EMPTY_SELECTION)
  }

  /** ←/→ with blocks selected: the previous/next block, edited like a click. */
  const stepBlock = (dir: -1 | 1) => {
    const from = blockSelection.anchor && selectedBlocks.includes(blockSelection.anchor) ? blockSelection.anchor : selectedBlocks[0]
    const next = spans[spans.findIndex((b) => b.id === from) + dir]
    if (next) clickBlock(next.id)
  }

  /** ⌥←/→ (Ctrl on Windows) with blocks selected: move them one place. */
  const nudgeBlocks = (dir: -1 | 1) => {
    const gap = stepGap(song.value, selectedBlocks, dir)
    if (gap !== null) song.commit((s) => moveBlocks(s, selectedBlocks, gap))
  }

  /** "Make a new section from this" on a block: it plays an independent copy, opened to edit. */
  const forkSelectedBlock = (id: string) => {
    const copyId = crypto.randomUUID()
    song.commit((s) => forkBlock(s, id, copyId))
    switchSection(copyId)
  }

  /** The block menu (right-click / ⋯): where it's open, or null. It acts on the selected blocks. */
  const [blockMenuAt, setBlockMenuAt] = useState<{ x: number; y: number } | null>(null)
  /** Right-click selects an unselected block first (without opening its section: "Edit this section" does). */
  const openBlockMenu = (id: string, x: number, y: number) => {
    if (!selectedBlocks.includes(id)) {
      setBlockSelection({ ids: [id], anchor: id })
      setSelection(EMPTY_SELECTION)
    }
    setBlockMenuAt({ x, y })
  }
  const blockMenuGroups = (): ChordMenuGroup[] => {
    const one = selectedBlocks.length === 1 ? spans.find((b) => b.id === selectedBlocks[0]) : undefined
    const needOne = 'Select one part of the song'
    return [
      [
        {
          id: 'edit',
          label: 'Edit this section',
          disabled: !one,
          title: one ? 'Show its chords on the track' : needOne,
          onSelect: () => one && switchSection(one.section),
        },
      ],
      [
        { id: 'duplicate', label: 'Duplicate', shortcut: DUPLICATE_KEY, title: 'Play it again right after (the same music)', onSelect: duplicateSelectedBlocks },
        {
          id: 'fork',
          label: 'Make a new section from this',
          disabled: !one,
          title: one ? 'This part plays an independent copy you can change; the other repeats stay as they are' : needOne,
          onSelect: () => one && forkSelectedBlock(one.id),
        },
      ],
      [
        {
          id: 'remove',
          label: 'Remove from song',
          shortcut: IS_MAC ? '⌫' : 'Del',
          danger: true,
          title: 'The section stays (in the chips above)',
          onSelect: removeSelectedBlocks,
        },
      ],
    ]
  }
  const blockMenuTitle =
    selectedBlocks.length === 1 ? sectionName(sectionOf(song.value, spans.find((b) => b.id === selectedBlocks[0])?.section ?? '')) : `${selectedBlocks.length} parts`

  /** Undo/redo for the whole song. A step that changes another section opens it first, so no change happens off screen. */
  const showStep = (to: Song | undefined) => {
    if (!to) return false
    const show = changedSection(song.value, to, sectionId)
    if (show !== sectionId) switchSection(show)
    return true
  }
  const undo = () => showStep(song.previous) && song.undo()
  const redo = () => showStep(song.next) && song.redo()

  // Clicking anywhere non-interactive deselects, like a typical editor. Clips handle
  // their own selection; palette chords act on the selection (replace), and controls
  // (buttons, inputs, ruler) shouldn't drop it.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest(KEEPS_SELECTION)) return
      setSelection(EMPTY_SELECTION)
      setBlockSelection(EMPTY_SELECTION)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [setSelection])

  /**
   * Click a clip: plain click selects it (opening the inspector) and plays it; Shift
   * extends a range from the anchor, ⌘/Ctrl adds or removes it. The playhead stays put:
   * opening a chord to work on it shouldn't jump the song (move it with the ruler).
   */
  const selectClip = (clip: Clip, mods: ClickMods = { shift: false, toggle: false }) => {
    select(clickSelect(selection, clips, clip.id, mods))
    if (!isPlaying && clip.chord) previewChord(clip.chord)
  }

  /** Select the clip before/after the anchor; returns false if nothing is selected. */
  const stepSelection = (dir: -1 | 1) => {
    if (selectedIds.length === 0) return false
    const from = selection.anchor && selectedIds.includes(selection.anchor) ? selection.anchor : selectedIds[0]
    const sorted = [...clips].sort((a, b) => a.start - b.start)
    const next = sorted[sorted.findIndex((c) => c.id === from) + dir]
    if (next) selectClip(next)
    return true
  }

  const nudgePlayhead = (dir: -1 | 1) => {
    const target = stepGrid(playheadPos, dir, gridTicks || TICKS_PER_BEAT / 4, barTicks)
    if (target >= 0 && target < totalTicks) seek(target)
  }

  /** Every chord on the track (except one clip's own): what a new chord's octave is fitted to. */
  const otherChords = (exceptId?: string) =>
    chordClips(sortedClips)
      .filter((c) => c.id !== exceptId)
      .map((c) => c.chord)

  /** Change the chords of clips `ids` (one undo step) and play the first result. */
  const editChords = (ids: string[], update: (chord: Chord) => Chord) => {
    const first = chordClips(sortedClips).find((c) => ids.includes(c.id))
    if (!first) return
    setClips((c) => updateChords(c, ids, update))
    if (!isPlaying) previewChord(update(first.chord))
  }

  /**
   * Set the inspected clip's chord (one undo step). A fresh chord (typed, an idea, built
   * on the keyboard) is moved to the octave nearest the other chords (its inversion is kept), like a chord dragged in; edits of
   * the current chord (notes, bass, inversion, flavor) keep its voicing.
   */
  const setInspectedChord = (clip: Clip, chord: Chord, fresh = false) => {
    const voiced = fresh ? fitOctave(chord, otherChords(clip.id)) : chord
    setClips((c) => c.map((x) => (x.id === clip.id ? { ...x, chord: voiced } : x)))
  }

  /** Inversion up/down (↑/↓, the notes bar): the selected chords, or all when nothing is selected. They move together: if any can't, none do. */
  const canInvertAll = (dir: 1 | -1) => octaveTargets.length > 0 && octaveTargets.every((c) => canInvert(c.chord, dir))
  const invertChords = (dir: 1 | -1) => {
    if (!canInvertAll(dir)) return
    editChords(
      octaveTargets.map((c) => c.id),
      (c) => invert(c, dir),
    )
  }

  /** The clips octave shifts apply to: the selection, or the whole track when nothing is selected. */
  const octaveTargets = chordClips(selectedClips.length > 0 ? selectedClips : sortedClips)
  /** Every target chord an octave up/down, or null if any of them would leave the range (they move together). */
  const octaveShifted = (dir: 1 | -1) => {
    const moved = octaveTargets.map((c) => shiftOctave(c.chord, dir))
    return moved.length > 0 && moved.every((c) => c !== null) ? moved : null
  }
  const shiftOctaves = (dir: 1 | -1) => {
    const moved = octaveShifted(dir)
    if (!moved) return
    const byId = new Map(octaveTargets.map((c, i) => [c.id, moved[i]!]))
    setClips((c) => c.map((clip) => (byId.has(clip.id) ? { ...clip, chord: byId.get(clip.id)! } : clip)))
    if (!isPlaying) previewChord(moved[0]!)
  }

  /** The rows of the chord menu, for whoever is selected. Disabled rows say why in their tooltip. */
  const chordMenuGroups = (): ChordMenuGroup[] => {
    const one = selectedClips.length === 1 ? selectedClips[0] : null
    const withChords = selectedClips.filter((c) => c.chord)
    const showTab = (tab: InspectorTab) => {
      if (!one) return
      setInspectorTab(tab)
    }
    const needOne = 'Select one chord to see its ideas'
    const invertable = (dir: 1 | -1) =>
      withChords.length > 0 && withChords.every((c) => c.chord && canInvert(c.chord, dir))
    const shiftable = (dir: 1 | -1) => withChords.length > 0 && withChords.every((c) => c.chord && shiftOctave(c.chord, dir))
    return [
      [
        { id: 'ideas', label: 'Ideas for this spot', disabled: !one, title: one ? undefined : needOne, onSelect: () => showTab('ideas') },
        {
          id: 'variations',
          label: 'Variations (7ths, sus, minor…)',
          disabled: !one?.chord,
          title: one?.chord ? undefined : one ? 'Pick a chord first' : needOne,
          onSelect: () => showTab('flavors'),
        },
      ],
      [
        { id: 'inv-up', label: 'Higher inversion', shortcut: '↑', disabled: !invertable(1), onSelect: () => invertChords(1) },
        { id: 'inv-down', label: 'Lower inversion', shortcut: '↓', disabled: !invertable(-1), onSelect: () => invertChords(-1) },
        { id: 'oct-up', label: 'Octave up', shortcut: '⇧↑', disabled: !shiftable(1), onSelect: () => shiftOctaves(1) },
        { id: 'oct-down', label: 'Octave down', shortcut: '⇧↓', disabled: !shiftable(-1), onSelect: () => shiftOctaves(-1) },
      ],
      [
        { id: 'duplicate', label: 'Duplicate', shortcut: DUPLICATE_KEY, onSelect: duplicateSelected },
        {
          id: 'clear',
          label: 'Clear chord',
          disabled: withChords.length === 0,
          title: 'Remove the chord but keep its place, so you can pick another',
          onSelect: clearSelected,
        },
        { id: 'delete', label: 'Delete', shortcut: IS_MAC ? '⌫' : 'Del', danger: true, onSelect: removeSelected },
      ],
    ]
  }
  const menuTitle =
    selectedClips.length === 1
      ? (selectedClips[0]!.chord ? chordName(selectedClips[0]!.chord) : 'Empty spot')
      : `${selectedClips.length} chords`

  /** Who the Voicing buttons act on, in words. */
  const voicingScope =
    octaveTargets.length === 0
      ? 'No chords yet'
      : selectedClips.length === 0
        ? `All ${octaveTargets.length} chord${octaveTargets.length === 1 ? '' : 's'}`
        : selectedClips.length === 1
          ? chordName(octaveTargets[0]!.chord)
          : `${selectedClips.length} selected chords`

  /** Re-voice the selection (2+ clips) or the whole track so chords move as little as possible. */
  const smoothen = () => {
    const target = chordClips(selectedClips.length > 1 ? selectedClips : sortedClips)
    const voiced = smoothVoicing(target.map((c) => c.chord))
    const byId = new Map(target.map((c, i) => [c.id, voiced[i]]))
    setClips((c) => c.map((clip) => (byId.has(clip.id) ? { ...clip, chord: byId.get(clip.id)! } : clip)))
  }

  /** The last progression used, so random picks don't repeat it. */
  const lastProgression = useRef<Progression | null>(null)
  /**
   * Take a progression's chords (in its scale), its instruments and tempo, or both: one undo
   * step (songWithProgression: into the section being edited). New chords send the playhead back to the top; while playing it
   * keeps playing (so progressions can be auditioned one after another): the restart happens
   * once the new clips are scheduled.
   */
  const takeProgression = (prog: Progression, parts: ProgressionParts) => {
    lastProgression.current = prog
    stopPreview()
    if (parts.chords) {
      // The section's playhead goes back to the top; the song keeps playing if it plays.
      if (sectionPlaying) restartRef.current = true
      else if (!isPlaying && !songScope) stop()
      setPlayhead(0)
      clearSelection()
    }
    song.commit((s) => songWithProgression(s, sectionId, prog, parts))
  }

  const randomProgression = (instruments: boolean) =>
    takeProgression(pickRandom(PROGRESSIONS, lastProgression.current), { chords: true, instruments })
  const randomGroove = () => setGroove(applyGroove(groove, pickRandom(RANDOM_GROOVES, matchingGroove(groove))))
  /** How long each chord sounds in a preview of several chords: a bar, capped so previews stay quick. */
  const previewSeconds = Math.min((barTicks / TICKS_PER_BEAT) * (60 / bpm), MAX_PREVIEW_SECONDS)
  /**
   * Hear a chord where it would sit in the inspected clip's spot (the chord before, it, the
   * chord after), without touching the track. A fresh chord (an idea) is played in the
   * octave it would be placed in. Like other previews, it waits while the track plays.
   */
  const hearInContext = (clip: Clip, chord: Chord, fresh = false) => {
    if (isPlaying) return
    const voiced = fresh ? fitOctave(chord, otherChords(clip.id)) : chord
    previewProgression(inContext(spotOf(clip.id), voiced), previewSeconds)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      const typing = (t instanceof HTMLInputElement && t.type !== 'range') || t instanceof HTMLSelectElement
      if (typing) return
      // The sessions window and the progression browser are modal: they handle their own keys.
      if (document.querySelector('.modal-backdrop, .chord-menu')) return
      // Dropdowns and sliders handle their own keys (arrows, Enter, Esc), but Space
      // still plays/pauses so changes can be heard without leaving them.
      if (t instanceof Element && t.closest('.dropdown, input[type="range"]') && e.key !== ' ') return
      const shortcut = shortcutFor(e)
      if (!shortcut) return
      e.preventDefault()
      // A focused button would also "click" on Space; drop focus so only the shortcut runs.
      if (e.target instanceof HTMLButtonElement) e.target.blur()
      switch (shortcut.type) {
        case 'undo':
          return undo()
        case 'redo':
          return redo()
        case 'playPause':
          return togglePlay()
        case 'stop':
          return stop()
        case 'step':
          if (blocksActive) return stepBlock(shortcut.dir)
          if (!stepSelection(shortcut.dir)) nudgePlayhead(shortcut.dir)
          return
        case 'invert':
          return invertChords(shortcut.dir)
        case 'octave':
          return shiftOctaves(shortcut.dir)
        case 'toggleLoop':
          return setLoop((l) => !l)
        case 'toggleMetronome':
          return setMetronomeOn((m) => !m)
        case 'remove':
          return blocksActive ? removeSelectedBlocks() : removeSelected()
        case 'deselect':
          setBlockSelection(EMPTY_SELECTION)
          return clearSelection()
        case 'selectAll':
          return blocksActive ? setBlockSelection(selectAll(spans, blockSelection)) : select(selectAll(clips, selection))
        case 'duplicate':
          return blocksActive ? duplicateSelectedBlocks() : duplicateSelected()
        case 'nudge':
          return blocksActive ? nudgeBlocks(shortcut.dir) : nudgeSelected(shortcut.dir)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** "+ New": an empty spot in the first free space (see addNextEmptyClip), selected so its ideas show. */
  const newChord = () => {
    const id = crypto.randomUUID()
    const next = addNextEmptyClip(clips, id, totalTicks, barTicks)
    if (!next) return
    setClips(() => next)
    select({ ids: [id], anchor: id })
  }

  const trackRef = useRef<HTMLDivElement>(null)
  /** The progression browser: open from its trigger or the empty track's "Start from a progression". */
  const [browsing, setBrowsing] = useState(false)
  const browseTrigger = useRef<HTMLButtonElement>(null)
  const closeBrowser = () => {
    setBrowsing(false)
    browseTrigger.current?.focus()
  }
  /** The drop plan for a drag of clips on the track. Option/Ctrl turns a move into a copy, live, as in a DAW. */
  const plan = (d: DragState) =>
    d.overTicks === null ? null : planDrop(clips, { ...d.held, copy: d.copy }, d.overTicks, totalTicks, d.free ? 0 : gridTicks, barTicks)

  const { drag, begin: beginDrag } = useChordDrag({
    trackRef,
    totalTicks,
    onDrop: (d) => {
      const result = plan(d)
      if (!result) return
      setClips(() => result.clips)
      // The dropped clip(s) end up selected, so the panel shows the chord just placed.
      select({ ids: result.placedIds, anchor: result.placedId })
      const placed = result.clips.find((c) => c.id === result.placedId)?.chord ?? d.held.chord
      if (placed) previewChord(placed)
    },
    onClick: (held, mods) => {
      const clip = clips.find((c) => c.id === held.id)
      if (clip) selectClip(clip, mods)
    },
  })
  const preview = drag ? plan(drag) : null
  const isOverTrack = drag?.overTicks != null
  const dropChangeMap = drag && preview ? dropChanges(clips, preview, drag.held.id) : null
  const dropLabel = drag ? describeDrop({ ...drag.held, copy: drag.copy }, preview, isOverTrack, clips) : null
  const dragHue = (drag?.held.chord && rootDegree(drag.held.chord, tonic, mode)) ?? undefined

  /**
   * Home is context, not content: changing it re-labels the chords (colors, numerals,
   * fit) and never changes them. Moving them is offered right after (moveChordsHome).
   * Repeated changes keep offering a move from the home the chords were written in.
   */
  const changeHome = (to: Home) => {
    if (to.tonic === tonic && to.mode === mode) return
    const from = activeOffer ? activeOffer.from : { tonic, mode }
    song.commit((s) => ({ ...s, ...to }))
    setHomeOffer(songHasChords(song.value) ? { from, to, sections } : null)
  }

  /**
   * Use a key detected from the chords (one undo step). Only a re-label: the chords are
   * already in that key, so no offer to move them (and any earlier offer goes away).
   */
  const applyDetectedKey = (to: Home) => {
    if (to.tonic === tonic && to.mode === mode) return
    song.commit((s) => ({ ...s, ...to }))
    setHomeOffer(null)
  }

  /** Move every section's chords from the home they were written in to the current one (one undo step). */
  const moveChordsHome = () => {
    if (!activeOffer) return
    const { from, to } = activeOffer
    song.commit((s) => mapSongChords(s, (chord) => chordToKey(chord, from, to)))
    setHomeOffer(null)
  }

  const changeBars = (n: number) => {
    track.commit((t) => ({ ...t, bars: n, clips: fitToLength(t.clips, n * sigBarTicks(t.sig)) }))
  }

  /** Changing time signature stretches every section's chords with the bars, so one chord per bar stays one per bar. */
  const changeSig = (next: TimeSignature) => {
    const factor = sigBarTicks(next) / barTicks
    song.commit((s) => rescaleSong(s, next))
    // Keep the playhead at the same spot in the music (also while playing). Not via
    // seek(): that clamps to the old track length.
    const scaled = Math.round(playheadPos * factor)
    const songScaled = Math.round(songPos * factor)
    setPlayhead(scaled)
    setSongPlayhead(songScaled)
    if (isPlaying) seekPlayback(songScope ? songScaled : scaled)
  }


  /**
   * Export the song or the edited section as MIDI (at once) or audio (rendered, with progress
   * and Cancel), named after the session ("My song - Chorus - Bass.wav").
   */
  async function exportMusic({ format, scope, parts, stem }: ExportChoice) {
    const whole = scope === 'song'
    const segments = whole ? songSegs : sectionSegs
    const name = exportFileName({
      session: sessions.currentName,
      section: whole || sections.length < 2 ? undefined : sectionName(section),
      part: stem ? PART_LABELS[parts[0]] : undefined,
      ext: format === 'wav' ? 'wav' : 'mid',
    })
    if (format === 'midi') {
      const markers = whole ? spans.map((b) => ({ tick: b.start, text: sectionName(sections.find((s) => s.id === b.section)!) })) : []
      downloadMidi({ segments, markers, bpm, sig, parts }, name)
      return
    }
    if (renderAbort.current) return // one render at a time
    const abort = new AbortController()
    renderAbort.current = abort
    setExportJob({ name, progress: 0 })
    try {
      const rendered = await renderAudio(
        { segments, sig, bpm, parts },
        {
          signal: abort.signal,
          // Only a new whole percent re-renders.
          onProgress: (f) => setExportJob((job) => (job && !job.failed && Math.floor(f * 100) !== Math.floor(job.progress * 100) ? { ...job, progress: f } : job)),
        },
      )
      downloadFile(renderedWav(rendered) as BlobPart, 'audio/wav', name)
      setExportJob(null)
    } catch (e) {
      if (abort.signal.aborted) return
      console.error(e)
      setExportJob({ name, progress: 0, failed: true })
    } finally {
      if (renderAbort.current === abort) renderAbort.current = null
    }
  }

  /** Cancel the running render, or dismiss a failed one. */
  const cancelExport = () => {
    renderAbort.current?.abort()
    renderAbort.current = null
    setExportJob(null)
  }

  return (
    <main>
      {/* Row 1, the song: which session, its key, tempo and timing, and the way out (MIDI). */}
      <header className="song-bar">
        <div className="logo">
          <img className="logo-icon" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="22" height="22" />
          <h1>create a chord progression</h1>
          <HelpTip />
        </div>
        {sessionMenu(() => isPlaying && pause())}
        <div className="song-settings">
          <SongMenu
            home={{ tonic, mode }}
            suggestion={homeSuggestion}
            detected={detectedKeys}
            onChange={changeHome}
            onDetect={applyDetectedKey}
            bpm={bpm}
            onBpm={setBpm}
            sig={sig}
            onSig={changeSig}
            bars={bars}
            onBars={changeBars}
            lengthLabel={sections.length > 1 ? `Length of ${sectionName(section)}` : 'Length'}
            gridKey={gridKey}
            onGrid={setGridKey}
            metronomeOn={metronomeOn}
            onMetronome={() => {
              ensureAudio()
              setMetronomeOn((m) => !m)
            }}
            metronomeVolume={metronomeVolume}
            onMetronomeVolume={setMetronomeVolume}
          />
          <ExportMenu
            groove={groove}
            songGrooves={songSegs.map((seg) => seg.groove)}
            disabled={chordClips(clips).length === 0 && !songSegs.some((seg) => chordClips(seg.clips).length > 0)}
            rendering={exportJob !== null && !exportJob.failed}
            onExport={exportMusic}
          />
          <ShareMenu song={song.value} name={sessions.currentName} disabled={!songHasChords(song.value)} />
        </div>
      </header>

      {/* Row 2, play and create: the transport (as in a DAW), then the two ways to fill the track. */}
      <div className="main-toolbar">
        <div className="toolbar-section transport">
          <button
            className="play"
            onClick={() => (sectionPlaying ? pause() : play('section'))}
            aria-label={sectionPlaying ? 'Pause' : 'Play'}
            title={
              sectionPlaying
                ? 'Pause (Space)'
                : sections.length > 1
                  ? `Play ${sectionName(section)} (Space; ▶ Song plays the whole song)`
                  : 'Play (Space)'
            }
          >
            {sectionPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="icon" onClick={stop} aria-label="Stop" title="Stop and return to the start (Shift+Space)">
            <StopIcon />
          </button>
          <button className="toggle icon" aria-pressed={loop} onClick={() => setLoop((l) => !l)} aria-label="Loop" title="Loop (L)">
            <LoopIcon />
          </button>
          <span className="transport-gap" aria-hidden />
          <button className="icon ghost" onClick={undo} disabled={!song.canUndo} aria-label="Undo" title="Undo (⌘Z / Ctrl+Z)">
            <UndoIcon />
          </button>
          <button className="icon ghost" onClick={redo} disabled={!song.canRedo} aria-label="Redo" title="Redo (⇧⌘Z / Ctrl+Y)">
            <RedoIcon />
          </button>
          <span className="transport-gap" aria-hidden />
          <button className="tinted add-chord" onClick={newChord} title="Add a chord: an empty spot in the first free space (up to a bar), then pick its chord">
            <PlusIcon />
            Add chord
          </button>
        </div>
        <div className="toolbar-section">
          <button
            ref={browseTrigger}
            className={clips.length === 0 ? 'dropdown-trigger progressions-trigger accent' : 'dropdown-trigger progressions-trigger'}
            aria-haspopup="dialog"
            aria-expanded={browsing}
            title="Browse over 180 progressions by genre: hear each with its own instruments, take its chords, its instruments or both"
            onClick={() => setBrowsing(true)}
          >
            Browse progressions
          </button>
          {browsing && (
            <ProgressionBrowser
              tonic={tonic}
              groove={groove}
              bpm={bpm}
              onUse={(prog, parts) => {
                takeProgression(prog, parts)
                closeBrowser()
              }}
              onBeforePreview={() => isPlaying && pause()}
              onClose={closeBrowser}
            />
          )}
          {/* All the randomizing in one group. The key and time signature are never touched; Both takes a progression's tempo. */}
          <div className="random-group" role="group" aria-label="Random">
            <span className="random-label" title="Random">
              <DiceIcon />
              <span className="random-word">Random</span>
            </span>
            <button onClick={() => randomProgression(false)} title="Replace the chords with a random progression (keeps your instruments)">
              Chords
            </button>
            <button onClick={randomGroove} title="Pick random instruments (a preset; keeps your chords and tempo)">
              Instruments
            </button>
            <button onClick={() => randomProgression(true)} title="A random progression with its own instruments and tempo">
              Both
            </button>
          </div>
        </div>
      </div>

      <SongPanel
        open={songOpen}
        onToggle={() => setSongOpen((o) => !o)}
        sections={sections}
        current={sectionId}
        onSwitch={switchSection}
        onAdd={newSection}
        onRename={(id, name) => song.commit((s) => renameSection(s, id, name))}
        onFork={forkSection}
        onDelete={deleteSection}
        song={song.value}
        spans={spans}
        songTicks={songLength}
        barTicks={barTicks}
        selectedIds={selectedBlocks}
        playing={songPlaying}
        playhead={songPos}
        playheadTicks={playheadTicks}
        onPlay={() => (songPlaying ? pause() : play('song'))}
        onSeek={(t) => seekIn('song', t)}
        onBlockClick={clickBlock}
        onBlockMenu={openBlockMenu}
        onDeselect={() => setBlockSelection(EMPTY_SELECTION)}
        onDrop={dropOnSong}
        onAddAll={addEverySection}
      />

      {/* Floating notices, stacked at the bottom of the window: they never move the page. */}
      <div className="floating-notices">
        <SaveWarning onBackup={onBackup} />
        {shareOutcome && (
          <ShareNotice
            outcome={shareOutcome}
            onPlay={() => {
              play(arrangement.length > 0 ? 'song' : 'section')
              onShareDone()
            }}
            onDismiss={onShareDone}
          />
        )}
        {exportJob && <ExportStatus job={exportJob} onCancel={cancelExport} />}
        {activeOffer && (
          <HomeNotice
            from={activeOffer.from}
            to={activeOffer.to}
            outside={chordClips(allClips).filter((c) => !isDiatonic(c.chord, tonic, mode)).length}
            onMove={moveChordsHome}
            onDismiss={() => setHomeOffer(null)}
          />
        )}
      </div>

      <div className="panels" data-playhead-scope>
        <div className="timeline-row">
          <Timeline
            trackRef={trackRef}
            clips={preview ? preview.clips : clips}
            totalTicks={totalTicks}
            gridTicks={gridTicks}
            barTicks={barTicks}
            beatTicks={beatTicks}
            tonic={tonic}
            mode={mode}
            selectedIds={selectedIds}
            inspectedId={!multiSelected ? inspectedId : null}
            isPlaying={isPlaying}
            playhead={playheadPos}
            playheadAt={playheadAt}
            onSeek={seek}
            dragging={drag !== null}
            placingIds={preview?.placedIds ?? []}
            liftedIds={drag?.held.existing && !drag.copy && !preview ? (drag.held.groupIds ?? [drag.held.id]) : []}
            invalid={isOverTrack && !preview}
            changes={dropChangeMap}
            onSelect={(id) => (id ? selectOnly(id) : clearSelection())}
            onClipPointerDown={(clip, e, grabOffset) => {
              // Dragging any clip of a multi-selection moves the whole selection.
              const group = selectedIds.length > 1 && selectedIds.includes(clip.id) ? selectedIds : undefined
              // Ids for copies, in case Option/Ctrl is held at some point during the drag.
              const copyIds = Object.fromEntries((group ?? [clip.id]).map((id) => [id, crypto.randomUUID()]))
              const held: HeldChord = { id: clip.id, chord: clip.chord, existing: true, grabOffset, groupIds: group, copyIds }
              beginDrag(held, e)
            }}
            onResizeStart={track.beginGesture}
            onResize={(id, edge, ticks) =>
              track.updateGesture(withClips((c) => resizeClip(c, id, edge, ticks, totalTicks)))
            }
            onMenu={openChordMenu}
            onRemove={(id) => {
              // The × on a selected clip removes the whole selection.
              if (selectedIds.includes(id)) removeSelected()
              else setClips((c) => removeClip(c, id))
            }}
            emptyState={
              <>
                <span className="track-empty-title">Start your progression</span>
                <span className="track-empty-actions">
                  <button className="primary" onClick={() => setBrowsing(true)}>
                    Start from a progression
                  </button>
                  <button onClick={newChord}>Add a chord</button>
                </span>
                <span className="track-empty-hint">or double-click anywhere on the track</span>
              </>
            }
            onCreateEmpty={(ticks) => {
              const id = crypto.randomUUID()
              const next = addEmptyClip(clips, id, ticks, totalTicks, barTicks)
              if (next === clips) return
              setClips(() => next)
              select({ ids: [id], anchor: id })
            }}
          />
          </div>

        <Panel
          title="Voicing"
          open={moreOpen}
          onToggle={() => setMoreOpen((o) => !o)}
          className="voicing-panel"
          actions={
            <>
              <span className="voicing-scope" title="The buttons below change these chords">
                {voicingScope}
              </span>
              <span className="octave" role="group" aria-label="Inversion">
                <span className="muted">Inversion</span>
                <button
                  className="small"
                  onClick={() => invertChords(-1)}
                  disabled={!canInvertAll(-1)}
                  aria-label="Inversion lower"
                  title="One inversion lower (↓)"
                >
                  <ArrowIcon dir="down" /> Lower
                </button>
                <button
                  className="small"
                  onClick={() => invertChords(1)}
                  disabled={!canInvertAll(1)}
                  aria-label="Inversion higher"
                  title="One inversion higher (↑)"
                >
                  Higher <ArrowIcon dir="up" />
                </button>
              </span>
              <span className="octave" role="group" aria-label="Octave">
                <span className="muted">Octave</span>
                <button
                  className="small arrow"
                  onClick={() => shiftOctaves(-1)}
                  disabled={!octaveShifted(-1)}
                  aria-label="Octave down"
                  title="Down an octave (Shift+↓)"
                >
                  <ArrowIcon dir="down" />
                </button>
                <button
                  className="small arrow"
                  onClick={() => shiftOctaves(1)}
                  disabled={!octaveShifted(1)}
                  aria-label="Octave up"
                  title="Up an octave (Shift+↑)"
                >
                  <ArrowIcon dir="up" />
                </button>
              </span>
              <button
                className="small"
                onClick={smoothen}
                disabled={chordClips(selectedClips.length > 1 ? selectedClips : clips).length < 2}
                title={`Pick inversions so each chord moves as little as possible from the one before (${
                  selectedClips.length > 1 ? 'the selected chords' : 'all chords'
                })`}
              >
                Smooth voicing
              </button>
            </>
          }
        >
          <div className="advanced-controls">
            <span className="lane-legend">
              {clips.length > 0 ? (
                <>
                  Every note and how chords connect: lines show how each note moves to the next chord.
                  <span className="out-swatch" aria-hidden /> not in the key. Click a chord's notes to select it.
                </>
              ) : (
                'Add chords to see their notes here.'
              )}
            </span>
          </div>
          <div className="lane-wrap">
            <NotesLane
              clips={preview ? preview.clips : clips}
              totalTicks={totalTicks}
              tonic={tonic}
              mode={mode}
              selectedIds={selectedIds}
              bassOn={groove.bass.on}
              onSelect={(id, mods) => {
                const clip = clips.find((c) => c.id === id)
                if (clip) selectClip(clip, mods)
              }}
            />
          </div>
        </Panel>

        <InstrumentsPanel
          groove={groove}
          section={sections.length > 1 ? sectionName(section) : undefined}
          open={instrumentsOpen}
          onToggle={() => setInstrumentsOpen((o) => !o)}
          onChange={setGroove}
          onSlideStart={track.beginGesture}
          onSlide={slideGroove}
        />

        <section className="panel details-panel" aria-label="Chord details">
          {!multiSelected && inspected ? (
            <ChordInspector
              key={inspected.id}
              chord={inspected.chord}
              spot={spotOf(inspected.id)}
              tab={inspectorTab}
              onTab={setInspectorTab}
              onChange={(chord, fresh) => setInspectedChord(inspected, chord, fresh)}
              onRestore={(chord) => setClips((c) => c.map((x) => (x.id === inspected.id ? { ...x, chord } : x)))}
              onMenu={(x, y) => openChordMenu(inspected, x, y)}
              onPreview={(chord, fresh) => !isPlaying && previewChord(fresh ? fitOctave(chord, otherChords(inspected.id)) : chord)}
              onHearInContext={(chord, fresh) => hearInContext(inspected, chord, fresh)}
            />
          ) : (
            // Nothing to show yet: say what the next move is, in the same frame (same height).
            // One span inside the flex box, so the bold words and the text after them keep their space.
            <p className="details-hint">
              <span>
                {clips.length === 0 ? (
                  <>
                    <b>Chord details</b> show up here once there&apos;s a chord on the track.
                  </>
                ) : multiSelected ? (
                  <>
                    <b>{selectedClips.length} chords selected.</b> Drag them to move them together (hold {COPY_KEY} to
                    copy), {DUPLICATE_KEY} duplicates them, ↑&nbsp;↓ changes their inversion, Delete removes them.
                  </>
                ) : (
                  <>
                    <b>{TAP} a chord</b> to hear it and see ideas for that spot.
                  </>
                )}
              </span>
            </p>
          )}
        </section>
      </div>

      {blockMenuAt && selectedBlocks.length > 0 && (
        <ChordMenu x={blockMenuAt.x} y={blockMenuAt.y} title={blockMenuTitle} groups={blockMenuGroups()} onClose={() => setBlockMenuAt(null)} />
      )}

      {menuAt && selectedClips.length > 0 && (
        <ChordMenu x={menuAt.x} y={menuAt.y} title={menuTitle} groups={chordMenuGroups()} onClose={() => setMenuAt(null)} />
      )}

      {drag && (
        <div
          className={isOverTrack ? 'drag-ghost over' : 'drag-ghost'}
          style={{ left: drag.x, top: drag.y, '--hue': dragHue === undefined ? undefined : (dragHue * 360) / 7 } as CSSProperties}
          data-diatonic={dragHue === undefined ? 'no' : 'yes'}
        >
          <span className="ghost-symbol">
            {drag.copy && drag.held.existing && <span aria-hidden>+ </span>}
            {heldName(drag.held)}
          </span>
          {dropLabel && <span className="ghost-label">{dropLabel}</span>}
        </div>
      )}
    </main>
  )
}
