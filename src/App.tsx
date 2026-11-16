import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChordInspector, type InspectorTab } from './components/ChordInspector'
import { NotesLane } from './components/NotesLane'
import { ProgressionMenu, type ProgressionMenuHandle } from './components/ProgressionMenu'
import { HomeNotice } from './components/HomeNotice'
import { DiceIcon } from './components/DiceIcon'
import { InstrumentsPanel } from './components/InstrumentsPanel'
import { ArrowIcon } from './components/ArrowIcon'
import { HelpTip } from './components/HelpTip'
import { MidiMenu } from './components/MidiMenu'
import { SongMenu } from './components/SongMenu'
import { Panel } from './components/Panel'
import { LoopIcon, PauseIcon, PlayIcon, PlusIcon, RedoIcon, StopIcon, UndoIcon } from './components/Icons'
import { SessionMenu } from './components/SessionBrowser'
import { Timeline } from './components/Timeline'
import { useChordDrag, type DragState } from './components/useChordDrag'
import { describeDrop, heldName } from './dropLabel'
import { legacyMusic, sessionPrefix, useSessions, type Sessions } from './session'
import { downloadBackup } from './backup'
import { useHistory } from './history'
import { usePersistentState } from './persist'
import { clickSelect, EMPTY_SELECTION, pruneSelection, selectAll, type ClickMods, type Selection } from './selection'
import { shortcutFor } from './shortcuts'
import { COPY_KEY, DUPLICATE_KEY, TAP } from './platform'
import { DEFAULT_TRACK, isTrack, migrateTrack, withMusic, type TrackMusic } from './track'
import {
  ensureAudio,
  pausePlayback,
  previewChord,
  previewProgression,
  previewSession,
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
import { canInvert, invert, shiftOctave, type Chord } from './music/chord'
import { downloadMidi } from './music/midi'
import { keyCandidates, suggestHome, type Home } from './music/home'
import { inContext } from './music/suggest'
import { PROGRESSIONS, progressionClips, progressionMusic, type Progression } from './music/progressions'
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
  rescaleClips,
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

/**
 * The app shell: sessions. The workspace below is keyed by session, so switching
 * sessions remounts it and every setting loads from that session's saved values.
 */
export default function App() {
  const sessions = useSessions()
  const flushRef = useRef<() => void>(() => {})
  /** Save what's on screen first, so a switch, copy or backup has the latest edits and undo history. */
  const flush = () => flushRef.current()
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
  return (
    <Workspace
      key={sessions.current}
      prefix={sessionPrefix(sessions.current)}
      sessions={sessions}
      flushRef={flushRef}
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
  '.clip, button, input, select, label, summary, .ruler, .panel, .notes-lane, .dropdown, .home-notice, .session-backdrop'

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
}

function Workspace({ prefix, sessions, sessionMenu, flushRef }: WorkspaceProps) {
  // Everything here is saved in the session (keys listed in SESSION_KEYS).
  const k = (key: string) => prefix + key
  // Hidden by default: powerful, but a lot on first sight.
  const [moreOpen, setMoreOpen] = usePersistentState(k('moreOpen'), false)
  const [instrumentsOpen, setInstrumentsOpen] = usePersistentState(k('instrumentsOpen'), false)
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
  const [panelOpen, setPanelOpen] = usePersistentState(k('panelOpen'), false)
  // The track (clips, length, key, time signature, instruments, tempo) is the undoable, saved
  // document. Sessions saved before the instruments and tempo joined it get their old values.
  const [legacy] = useState(() => legacyMusic(prefix))
  const track = useHistory({ ...DEFAULT_TRACK, ...legacy }, { key: k('track'), isValid: isTrack, migrate: (v) => migrateTrack(v, legacy) })
  useEffect(() => {
    flushRef.current = track.flush
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
  }, [track.value])
  const { clips, bars, tonic, mode, sig, groove, bpm } = track.value
  const barTicks = sigBarTicks(sig)
  const beatTicks = sigBeatTicks(sig)
  const gridTicks = gridStep(gridKey, barTicks)
  const withClips = (update: (c: Clip[]) => Clip[]) => (t: typeof track.value) => {
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
  /** Playhead in ticks while stopped/paused; while playing the audio transport is the source of truth. */
  const [playhead, setPlayhead] = useState(0)
  const isPlaying = playState === 'playing'
  /** Set when a progression is loaded mid-playback: restart from the top once it's scheduled. */
  const restartRef = useRef(false)

  const totalTicks = bars * barTicks
  // Undo can shorten the track under the playhead.
  const playheadPos = playhead < totalTicks ? playhead : 0
  const homeSuggestion = useMemo(() => suggestHome(clips, { tonic, mode }), [clips, tonic, mode])
  const detectedKeys = useMemo(() => keyCandidates(clips), [clips])
  /**
   * After a home change: the home the chords were written in, offered as "move them".
   * It lasts while the chords are untouched (same clips array) and home is still `to`.
   */
  const [homeOffer, setHomeOffer] = useState<{ from: Home; to: Home; clips: Clip[] } | null>(null)
  const activeOffer =
    homeOffer && homeOffer.clips === clips && homeOffer.to.tonic === tonic && homeOffer.to.mode === mode ? homeOffer : null
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
  /**
   * Change the selection, and with it the details panel: one clip selected opens it on
   * that clip (on the tab used last); several hide it. Deselecting leaves it as it is.
   */
  const select = (next: Selection) => {
    setSelection(next)
    if (next.ids.length > 1) setPanelOpen(false)
    if (next.ids.length !== 1) return
    setInspectedId(next.ids[0])
    setPanelOpen(true)
  }
  const selectOnly = (id: string) => select({ ids: [id], anchor: id })
  const clearSelection = () => setSelection(EMPTY_SELECTION)

  useEffect(() => setTransportBpm(bpm), [bpm])
  useEffect(() => setMetronome(metronomeOn, metronomeVolume), [metronomeOn, metronomeVolume])
  useEffect(() => setAudioGroove(groove), [groove])

  const stop = () => {
    stopPlayback()
    setPlayState('stopped')
    setPlayhead(0)
  }

  // Keep the audio schedule in sync with the track (live edits while playing).
  useEffect(() => {
    // A progression loaded while playing restarts from the top (seek first: in one-shot
    // mode a shorter track would otherwise end playback right away).
    if (restartRef.current) {
      restartRef.current = false
      seekPlayback(0)
      setPlayhead(0)
    }
    schedule({ clips, totalTicks, sig, loop, groove, onEnd: stop })
  }, [clips, totalTicks, sig, loop, groove])

  /** In play-once mode, playback ends with the last clip (or the track, if empty). */
  const pastEnd = (ticks: number) => !loop && ticks >= playbackEnd(clips, totalTicks)

  const pause = () => {
    setPlayhead(pausePlayback() % totalTicks)
    setPlayState('paused')
  }

  const togglePlay = () => {
    if (isPlaying) return pause()
    const from = pastEnd(playheadPos) ? 0 : playheadPos
    stopPreview() // a preview still going would play over the track
    ensureAudio() // must be kicked off inside the user gesture
    startPlayback(from)
    setPlayhead(from)
    setPlayState('playing')
  }

  const seek = (ticks: number) => {
    const t = Math.min(Math.max(ticks, 0), totalTicks - 1)
    if (isPlaying && pastEnd(t)) {
      pausePlayback()
      setPlayState('paused')
    } else if (isPlaying) {
      seekPlayback(t)
    }
    setPlayhead(t)
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

  const removeSelected = () => {
    if (selectedIds.length === 0) return
    setClips((c) => c.filter((clip) => !selectedIds.includes(clip.id)))
    clearSelection()
  }

  // Clicking anywhere non-interactive deselects, like a typical editor. Clips handle
  // their own selection; palette chords act on the selection (replace), and controls
  // (buttons, inputs, ruler) shouldn't drop it.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest(KEEPS_SELECTION)) return
      setSelection(EMPTY_SELECTION)
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

  /** Re-voice the selection (2+ clips) or the whole track so chords move as little as possible. */
  const smoothen = () => {
    const target = chordClips(selectedClips.length > 1 ? selectedClips : sortedClips)
    const voiced = smoothVoicing(target.map((c) => c.chord))
    const byId = new Map(target.map((c, i) => [c.id, voiced[i]]))
    setClips((c) => c.map((clip) => (byId.has(clip.id) ? { ...clip, chord: byId.get(clip.id)! } : clip)))
  }

  /** Replace the track with a progression from the library, in its scale (one undo step). */
  /** The last progression loaded, so random picks don't repeat it. */
  const lastProgression = useRef<Progression | null>(null)
  const loadProgression = (prog: Progression) => {
    lastProgression.current = prog
    stopPreview()
    // Back to the top. While playing, keep playing (so progressions can be auditioned
    // one after another); the restart happens once the new clips are scheduled.
    if (isPlaying) restartRef.current = true
    else stop()
    track.commit((t) => {
      const bar = sigBarTicks(t.sig)
      return { ...t, mode: prog.mode, clips: progressionClips(prog, t.tonic, t.bars * bar, bar) }
    })
    clearSelection()
  }

  const randomProgression = () => loadProgression(pickRandom(PROGRESSIONS, lastProgression.current))
  const randomGroove = () => setGroove(applyGroove(groove, pickRandom(RANDOM_GROOVES, matchingGroove(groove))))
  /** How long each chord sounds in a preview of several chords: a bar, capped so previews stay quick. */
  const previewSeconds = Math.min((barTicks / TICKS_PER_BEAT) * (60 / bpm), MAX_PREVIEW_SECONDS)
  /**
   * Hear a progression once the way it's meant to sound: its own instruments and tempo, in
   * the current key (pauses the song first, like hearing a session).
   */
  const hearProgression = (prog: Progression) => {
    if (isPlaying) pause()
    void previewSession(progressionMusic(prog, tonic), { passes: 1 })
  }
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
      // The sessions window is modal: it handles its own keys.
      if (document.querySelector('.session-backdrop')) return
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
          return track.undo()
        case 'redo':
          return track.redo()
        case 'playPause':
          return togglePlay()
        case 'stop':
          return stop()
        case 'step':
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
          return removeSelected()
        case 'deselect':
          return clearSelection()
        case 'selectAll':
          return select(selectAll(clips, selection))
        case 'duplicate':
          return duplicateSelected()
        case 'nudge':
          return nudgeSelected(shortcut.dir)
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
  const progressionMenu = useRef<ProgressionMenuHandle>(null)
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
    track.commit((t) => ({ ...t, ...to }))
    setHomeOffer(chordClips(clips).length > 0 ? { from, to, clips } : null)
  }

  /**
   * Use a key detected from the chords (one undo step). Only a re-label: the chords are
   * already in that key, so no offer to move them (and any earlier offer goes away).
   */
  const applyDetectedKey = (to: Home) => {
    if (to.tonic === tonic && to.mode === mode) return
    track.commit((t) => ({ ...t, ...to }))
    setHomeOffer(null)
  }

  /** Move the chords from the home they were written in to the current one (one undo step). */
  const moveChordsHome = () => {
    if (!activeOffer) return
    const { from, to } = activeOffer
    setClips((c) => c.map((clip) => (clip.chord ? { ...clip, chord: chordToKey(clip.chord, from, to) } : clip)))
    setHomeOffer(null)
  }

  const changeBars = (n: number) => {
    track.commit((t) => ({ ...t, bars: n, clips: fitToLength(t.clips, n * sigBarTicks(t.sig)) }))
  }

  /** Changing time signature stretches clips with the bars, so one chord per bar stays one per bar. */
  const changeSig = (next: TimeSignature) => {
    const factor = sigBarTicks(next) / barTicks
    track.commit((t) => ({ ...t, sig: next, clips: rescaleClips(t.clips, sigBarTicks(next) / sigBarTicks(t.sig)) }))
    // Keep the playhead at the same spot in the music (also while playing). Not via
    // seek(): that clamps to the old track length.
    const scaled = Math.round(playheadPos * factor)
    setPlayhead(scaled)
    if (isPlaying) seekPlayback(scaled)
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
          <MidiMenu
            groove={groove}
            disabled={chordClips(clips).length === 0}
            onDownload={(parts, filename) => downloadMidi({ clips: sortedClips, totalTicks, bpm, sig, groove, parts }, filename)}
          />
        </div>
      </header>

      {/* Row 2, play and create: the transport (as in a DAW), then the two ways to fill the track. */}
      <div className="main-toolbar">
        <div className="toolbar-section transport">
          <button className="play" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="icon" onClick={stop} aria-label="Stop" title="Stop and return to the start (Shift+Space)">
            <StopIcon />
          </button>
          <button className="toggle icon" aria-pressed={loop} onClick={() => setLoop((l) => !l)} aria-label="Loop" title="Loop (L)">
            <LoopIcon />
          </button>
          <span className="transport-gap" aria-hidden />
          <button className="icon ghost" onClick={track.undo} disabled={!track.canUndo} aria-label="Undo" title="Undo (⌘Z / Ctrl+Z)">
            <UndoIcon />
          </button>
          <button className="icon ghost" onClick={track.redo} disabled={!track.canRedo} aria-label="Redo" title="Redo (⇧⌘Z / Ctrl+Y)">
            <RedoIcon />
          </button>
          <span className="transport-gap" aria-hidden />
          <button className="tinted add-chord" onClick={newChord} title="Add a chord: an empty spot in the first free space (up to a bar), then pick its chord">
            <PlusIcon />
            Add chord
          </button>
        </div>
        <div className="toolbar-section">
          <ProgressionMenu
            ref={progressionMenu}
            tonic={tonic}
            highlight={clips.length === 0}
            onUse={loadProgression}
            onPreview={hearProgression}
          />
          {/* All the randomizing in one group (T19 adds "Both"). Key, tempo and time signature are never touched. */}
          <div className="random-group" role="group" aria-label="Random">
            <span className="random-label">
              <DiceIcon />
              Random
            </span>
            <button onClick={randomProgression} title="Replace the chords with a random progression">
              Chords
            </button>
            <button onClick={randomGroove} title="Pick random instruments (a preset)">
              Instruments
            </button>
          </div>
        </div>
      </div>

      {activeOffer && (
        <HomeNotice
          from={activeOffer.from}
          to={activeOffer.to}
          outside={chordClips(clips).filter((c) => !isDiatonic(c.chord, tonic, mode)).length}
          onMove={moveChordsHome}
          onDismiss={() => setHomeOffer(null)}
        />
      )}

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
            inspectedId={panelOpen && !multiSelected ? inspectedId : null}
            isPlaying={isPlaying}
            playhead={playheadPos}
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
            onRemove={(id) => {
              // The × on a selected clip removes the whole selection.
              if (selectedIds.includes(id)) removeSelected()
              else setClips((c) => removeClip(c, id))
            }}
            emptyState={
              <>
                <span className="track-empty-title">Start your progression</span>
                <span className="track-empty-actions">
                  <button className="primary" onClick={() => progressionMenu.current?.open()}>
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
          hint="every note and how chords connect"
          open={moreOpen}
          onToggle={() => setMoreOpen((o) => !o)}
        >
          <div className="advanced-controls">
            <span className="lane-legend">
              {clips.length > 0 ? (
                <>
                  Lines show how each note moves to the next chord.
                  <span className="out-swatch" aria-hidden /> not in the key
                </>
              ) : (
                'Add chords to see their notes here.'
              )}
            </span>
            <span className="advanced-buttons">
            <span className="octave" role="group" aria-label="Inversion">
              <span className="muted">Inversion{selectedClips.length > 0 ? ' (selected)' : ''}</span>
              <button
                className="small arrow"
                onClick={() => invertChords(-1)}
                disabled={!canInvertAll(-1)}
                aria-label="Inversion down"
                title="Move the selected chords (or all) one inversion down (↓)"
              >
                <ArrowIcon dir="down" />
              </button>
              <button
                className="small arrow"
                onClick={() => invertChords(1)}
                disabled={!canInvertAll(1)}
                aria-label="Inversion up"
                title="Move the selected chords (or all) one inversion up (↑)"
              >
                <ArrowIcon dir="up" />
              </button>
            </span>
            <span className="octave" role="group" aria-label="Octave">
              <span className="muted">Octave{selectedClips.length > 0 ? ' (selected)' : ''}</span>
              <button
                className="small arrow"
                onClick={() => shiftOctaves(-1)}
                disabled={!octaveShifted(-1)}
                aria-label="Octave down"
                title="Move the selected chords (or all) down an octave (Shift+↓)"
              >
                <ArrowIcon dir="down" />
              </button>
              <button
                className="small arrow"
                onClick={() => shiftOctaves(1)}
                disabled={!octaveShifted(1)}
                aria-label="Octave up"
                title="Move the selected chords (or all) up an octave (Shift+↑)"
              >
                <ArrowIcon dir="up" />
              </button>
            </span>
            <button
              className="small"
              onClick={smoothen}
              disabled={chordClips(selectedClips.length > 1 ? selectedClips : clips).length < 2}
              title="Pick inversions so each chord moves as little as possible from the one before"
            >
              Smooth voicing{selectedClips.length > 1 ? ' (selected)' : ''}
            </button>
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
            />
          </div>
        </Panel>

        <InstrumentsPanel
          groove={groove}
          open={instrumentsOpen}
          onToggle={() => setInstrumentsOpen((o) => !o)}
          onChange={setGroove}
          onSlideStart={track.beginGesture}
          onSlide={slideGroove}
        />

        {panelOpen && !multiSelected && inspected ? (
          <section className="panel details-panel" aria-label="Chord details">
            <ChordInspector
              key={inspected.id}
              chord={inspected.chord}
              spot={spotOf(inspected.id)}
              tab={inspectorTab}
              onTab={setInspectorTab}
              onChange={(chord, fresh) => setInspectedChord(inspected, chord, fresh)}
              onClear={() => {
                setClips((c) => c.map((x) => (x.id === inspected.id ? { ...x, chord: null } : x)))
                // An empty spot has no flavors; land on its ideas (and stay there once it's filled).
                setInspectorTab((t) => (t === 'flavors' ? 'ideas' : t))
              }}
              onPreview={(chord, fresh) => !isPlaying && previewChord(fresh ? fitOctave(chord, otherChords(inspected.id)) : chord)}
              onHearInContext={(chord, fresh) => hearInContext(inspected, chord, fresh)}
              onClose={() => setPanelOpen(false)}
            />
          </section>
        ) : (
          // No chord's details are open: say what the next move is, where the details would be.
          // (An empty track says it on the track itself.)
          clips.length > 0 && (
            <p className="details-hint">
              {multiSelected ? (
                <>
                  <b>{selectedClips.length} chords selected.</b> Drag them to move them together (hold {COPY_KEY} to
                  copy), {DUPLICATE_KEY} duplicates them, ↑&nbsp;↓ changes their inversion, Delete removes them.
                </>
              ) : (
                <>
                  <b>{TAP} a chord</b> to hear it and see ideas for that spot.
                </>
              )}
            </p>
          )
        )}
      </div>

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
