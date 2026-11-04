import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChordInspector, type InspectorTab } from './components/ChordInspector'
import { NotesLane } from './components/NotesLane'
import { Palette, SpiceRow } from './components/Palette'
import { ProgressionMenu } from './components/ProgressionMenu'
import { HomeMenu } from './components/HomeMenu'
import { HomeNotice } from './components/HomeNotice'
import { GrooveMenu } from './components/GrooveMenu'
import { MidiMenu } from './components/MidiMenu'
import { OptionsMenu } from './components/OptionsMenu'
import { SessionMenu } from './components/SessionMenu'
import { Timeline } from './components/Timeline'
import { useChordDrag, type DragState } from './components/useChordDrag'
import { describeDrop, heldName } from './dropLabel'
import { COPY_KEY, FREE_KEY } from './platform'
import { clearScratch, sessionPrefix, useSessions, type Sessions } from './session'
import { useHistory } from './history'
import { load, usePersistentState } from './persist'
import { clickSelect, EMPTY_SELECTION, pruneSelection, selectAll, type ClickMods, type Selection } from './selection'
import { shortcutFor } from './shortcuts'
import { DEFAULT_TRACK, isTrack, migrateTrack } from './track'
import {
  ensureAudio,
  pausePlayback,
  previewChord,
  previewProgression,
  schedule,
  seekPlayback,
  setBpm as setTransportBpm,
  setMetronome,
  setGroove as setAudioGroove,
  startPlayback,
  stopPlayback,
  stopPreview,
} from './music/audio'
import { canInvert, chordName, invert, shiftOctave, type Chord } from './music/chord'
import { downloadMidi } from './music/midi'
import { spiceChords, suggestHome, type Home } from './music/home'
import { PROGRESSIONS, progressionChords, progressionClips, type Progression } from './music/progressions'
import {
  applyGroove,
  DEFAULT_GROOVE,
  GROOVES,
  isGrooveSettings,
  matchingGroove,
  pickRandom,
  type GrooveSettings,
} from './music/grooves'
import {
  chordToKey,
  diatonicChords,
  FLAVORS,
  isDiatonic,
  rootDegree,
  type ChordSpec,
  type PaletteFlavor,
} from './music/theory'
import { fitToNeighbors, smoothVoicing } from './music/voicing'
import {
  addEmptyClip,
  chordClips,
  dropChanges,
  fitToLength,
  gridStep,
  GRIDS,
  planDrop,
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
  const resetScratch = useRef(false)
  const flushRef = useRef<() => void>(() => {})
  // After saving the unsaved session under a name, start the unsaved one over. Runs after
  // the old workspace unmounted (its last save) and the new one loaded.
  useEffect(() => {
    if (!resetScratch.current) return
    resetScratch.current = false
    clearScratch()
  }, [sessions.current])
  const saveAs = (name: string) => {
    flushRef.current()
    const fromScratch = sessions.current === null
    const id = sessions.saveAs(name)
    resetScratch.current = fromScratch
    sessions.open(id)
  }
  return (
    <Workspace
      key={sessions.current ?? 'scratch'}
      prefix={sessionPrefix(sessions.current)}
      sessions={sessions}
      onSaveAs={saveAs}
      flushRef={flushRef}
    />
  )
}

const isSelection = (v: unknown) => {
  const s = v as Selection
  return typeof s === 'object' && s !== null && Array.isArray(s.ids) && s.ids.every((id) => typeof id === 'string')
}

/** Elements whose clicks don't clear the clip selection. */
const KEEPS_SELECTION = '.clip, .palette .chord, button, input, select, label, summary, .ruler, .panel, .notes-lane, .dropdown'

const isFlavor = (v: unknown) => FLAVORS.some((f) => f.key === v)
/** Before palette flavors there was a 7ths on/off setting; start from it. */
const initialFlavor = (): PaletteFlavor => (load('sevenths', false, (v) => typeof v === 'boolean') ? '7ths' : 'triads')

const DEFAULT_BPM = 120

/** Grooves random picks choose from: not plain "Just chords", and not the 3/4-only waltz. */
const RANDOM_GROOVES = GROOVES.filter((g) => g.id !== 'just' && g.id !== 'waltz')

/** Longest a chord sounds in a progression preview, so previews stay quick at slow tempos. */
const MAX_PREVIEW_SECONDS = 1.5

type WorkspaceProps = {
  /** Storage key prefix of the session (see session.ts). */
  prefix: string
  sessions: Sessions
  onSaveAs: (name: string) => void
  /** Set to this workspace's "save everything now", so a session can be copied right away. */
  flushRef: { current: () => void }
}

function Workspace({ prefix, sessions, onSaveAs, flushRef }: WorkspaceProps) {
  // Everything here is saved in the session (keys listed in SESSION_KEYS).
  const k = (key: string) => prefix + key
  const [flavor, setFlavor] = usePersistentState<PaletteFlavor>(k('flavor'), initialFlavor(), isFlavor)
  // Hidden by default: powerful, but a lot on first sight.
  const [showNotes, setShowNotes] = usePersistentState(k('notesLaneOpen'), false)
  const [bpm, setBpm] = usePersistentState(k('bpm'), DEFAULT_BPM)
  const [gridKey, setGridKey] = usePersistentState<GridKey>(k('grid'), '1/4', (v) => GRIDS.some((g) => g.key === v))
  const [loop, setLoop] = usePersistentState(k('loop'), true)
  const [metronomeOn, setMetronomeOn] = usePersistentState(k('metronome'), false)
  const [metronomeVolume, setMetronomeVolume] = usePersistentState(k('metronomeVolume'), 0.6)
  // `groove2`: volumes saved before the measured level pass would be badly balanced
  // against the new instrument trims, so everyone starts again from the default mix.
  const [groove, setGroove] = usePersistentState<GrooveSettings>(k('groove2'), DEFAULT_GROOVE, isGrooveSettings)
  const [inspectorTab, setInspectorTab] = usePersistentState<InspectorTab>(
    k('inspectorTab'),
    'flavors',
    (v) => v === 'flavors' || v === 'ideas',
  )
  const [tipsOpen, setTipsOpen] = usePersistentState(k('tipsOpen'), false)
  // The details panel shows the inspected clip: the last one selected on its own. It
  // stays when you click elsewhere (deselect); only selecting another clip switches it.
  const [inspectedId, setInspectedId] = usePersistentState<string | null>(
    k('inspected'),
    null,
    (v) => v === null || typeof v === 'string',
  )
  const [panelOpen, setPanelOpen] = usePersistentState(k('panelOpen'), true)
  // The track (clips, length, key, time signature) is the undoable, saved document.
  const track = useHistory(DEFAULT_TRACK, { key: k('track'), isValid: isTrack, migrate: migrateTrack })
  useEffect(() => {
    flushRef.current = track.flush
  })
  // Leaving the session (switching): stop the music it was playing.
  useEffect(() => () => stopPlayback(), [])
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
  }, [track.value, groove, bpm])
  const { clips, bars, tonic, mode, sig } = track.value
  const barTicks = sigBarTicks(sig)
  const beatTicks = sigBeatTicks(sig)
  const gridTicks = gridStep(gridKey, barTicks)
  const withClips = (update: (c: Clip[]) => Clip[]) => (t: typeof track.value) => {
    const next = update(t.clips)
    return sameClips(next, t.clips) ? t : { ...t, clips: next }
  }
  const setClips = (update: (c: Clip[]) => Clip[]) => track.commit(withClips(update))
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
  const palette = useMemo(() => diatonicChords(tonic, mode, flavor), [tonic, mode, flavor])
  const spice = useMemo(() => spiceChords(tonic, mode, flavor), [tonic, mode, flavor])
  const homeSuggestion = useMemo(() => suggestHome(clips, { tonic, mode }), [clips, tonic, mode])
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
   * that clip (a different clip starts on "Other flavors", an empty one on ideas); several
   * collapse it. Deselecting leaves it as it is.
   */
  const select = (next: Selection, within: Clip[] = clips) => {
    setSelection(next)
    if (next.ids.length > 1) setPanelOpen(false)
    if (next.ids.length !== 1) return
    const id = next.ids[0]
    if (id !== inspectedId) {
      setInspectedId(id)
      const clip = within.find((c) => c.id === id)
      setInspectorTab(clip && !clip.chord ? 'ideas' : 'flavors')
    }
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

  /** Start over: the default track, groove and tempo. Workspace preferences (grid, loop, metronome, display) stay. */
  const isFresh =
    clips.length === 0 &&
    bars === DEFAULT_TRACK.bars &&
    tonic === DEFAULT_TRACK.tonic &&
    mode === DEFAULT_TRACK.mode &&
    sig.beats === DEFAULT_TRACK.sig.beats &&
    sig.unit === DEFAULT_TRACK.sig.unit &&
    bpm === DEFAULT_BPM &&
    JSON.stringify(groove) === JSON.stringify(DEFAULT_GROOVE)
  const clearAll = () => {
    track.commit(() => DEFAULT_TRACK)
    setGroove(DEFAULT_GROOVE)
    setBpm(DEFAULT_BPM)
    clearSelection()
    stop()
  }

  /**
   * Clicking a palette or spice chord only plays it (over the track, if it's playing), so
   * you can try chords in context without touching the track. Dragging places them.
   */
  const hearChord = (chord: Chord) => previewChord(chord)

  /** Change the chords of clips `ids` (one undo step) and play the first result. */
  const editChords = (ids: string[], update: (chord: Chord) => Chord) => {
    const first = chordClips(sortedClips).find((c) => ids.includes(c.id))
    if (!first) return
    setClips((c) => updateChords(c, ids, update))
    if (!isPlaying) previewChord(update(first.chord))
  }

  /**
   * Set the inspected clip's chord (one undo step). A fresh chord (typed, an idea, built
   * on the keyboard) is voiced to fit its neighbors, like a chord dragged in; edits of
   * the current chord (notes, bass, inversion, flavor) keep its voicing.
   */
  const setInspectedChord = (clip: Clip, chord: Chord, fresh = false) => {
    const { prev, next } = spotOf(clip.id)
    const voiced = fresh ? fitToNeighbors(chord, prev ?? clip.chord, next ?? clip.chord) : chord
    setClips((c) => c.map((x) => (x.id === clip.id ? { ...x, chord: voiced } : x)))
  }

  /**
   * Inversion up/down (↑/↓, the notes bar, a clip's buttons): the selected chords, or all
   * of them when nothing is selected; a clip's own buttons on an unselected clip move just
   * it. They move together: if any can't, none do.
   */
  const invertTargets = (id?: string) =>
    id && !selectedIds.includes(id) ? chordClips(sortedClips).filter((c) => c.id === id) : octaveTargets
  const canInvertAll = (dir: 1 | -1, id?: string) => {
    const targets = invertTargets(id)
    return targets.length > 0 && targets.every((c) => canInvert(c.chord, dir))
  }
  const invertChords = (dir: 1 | -1, id?: string) => {
    if (!canInvertAll(dir, id)) return
    editChords(
      invertTargets(id).map((c) => c.id),
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
  const hearProgression = (prog: Progression) => {
    const barSeconds = (barTicks / TICKS_PER_BEAT) * (60 / bpm)
    previewProgression(progressionChords(prog, tonic), Math.min(barSeconds, MAX_PREVIEW_SECONDS))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      const typing = (t instanceof HTMLInputElement && t.type !== 'range') || t instanceof HTMLSelectElement
      if (typing) return
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
        case 'chord':
          return palette[shortcut.index] && hearChord(palette[shortcut.index].chord)
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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const trackRef = useRef<HTMLDivElement>(null)
  /**
   * The drop plan for a drag. A new chord (from the palette or spice) is voiced to fit
   * its neighbors, so it lands in the register the track is already in.
   */
  const plan = (d: DragState) => {
    // Option/Ctrl turns a move into a copy, live, as in a DAW.
    const held = d.held.existing ? { ...d.held, copy: d.copy } : d.held
    const p = d.overTicks === null ? null : planDrop(clips, held, d.overTicks, totalTicks, d.free ? 0 : gridTicks, barTicks)
    if (!p || d.held.existing) return p
    const sorted = [...p.clips].sort((a, b) => a.start - b.start)
    const i = sorted.findIndex((c) => c.id === p.placedId)
    const chord = sorted[i].chord
    if (!chord) return p
    const fitted = fitToNeighbors(chord, sorted[i - 1]?.chord, sorted[i + 1]?.chord)
    return { ...p, clips: p.clips.map((c) => (c.id === p.placedId ? { ...c, chord: fitted } : c)) }
  }

  const { drag, begin: beginDrag } = useChordDrag({
    trackRef,
    totalTicks,
    onDrop: (d) => {
      const result = plan(d)
      if (!result) return
      setClips(() => result.clips)
      // The dropped clip(s) end up selected, so the panel shows the chord just placed.
      select({ ids: result.placedIds, anchor: result.placedId }, result.clips)
      const placed = result.clips.find((c) => c.id === result.placedId)?.chord ?? d.held.chord
      if (placed) previewChord(placed)
    },
    onClick: (held, mods) => {
      if (held.existing) {
        const clip = clips.find((c) => c.id === held.id)
        if (clip) selectClip(clip, mods)
      } else if (held.chord) {
        hearChord(held.chord)
      }
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
      <header>
        <h1>Chords</h1>
        <SessionMenu sessions={sessions} onSaveAs={onSaveAs} onOpen={sessions.open} />
        <div className="controls">
          <HomeMenu home={{ tonic, mode }} suggestion={homeSuggestion} onChange={changeHome} />
          <OptionsMenu
            bpm={bpm}
            onBpm={setBpm}
            sig={sig}
            onSig={changeSig}
            bars={bars}
            onBars={changeBars}
            gridKey={gridKey}
            onGrid={setGridKey}
          />
          <span className="metronome">
            <button
              className="toggle icon"
              aria-pressed={metronomeOn}
              aria-label="Metronome"
              onClick={() => {
                ensureAudio()
                setMetronomeOn((m) => !m)
              }}
              title="Metronome (M)"
            >
              <MetronomeIcon />
            </button>
            <input
              type="range"
              className="volume"
              min={0}
              max={1}
              step={0.01}
              value={metronomeVolume}
              onChange={(e) => setMetronomeVolume(Number(e.target.value))}
              aria-label="Metronome volume"
              title="Metronome volume"
            />
          </span>
        </div>
      </header>

      {activeOffer && (
        <HomeNotice
          from={activeOffer.from}
          to={activeOffer.to}
          outside={chordClips(clips).filter((c) => !isDiatonic(c.chord, tonic, mode)).length}
          onMove={moveChordsHome}
          onDismiss={() => setHomeOffer(null)}
        />
      )}

      <section>
        <div className="palette-head">
          <p className="palette-hint" title="Drop on a gap or a clip's edge to add, on a clip's middle to replace">
            Click to hear · drag to add
          </p>
          <span className="segmented" role="group" aria-label="Palette chord size">
            {FLAVORS.map((f) => (
              <button
                key={f.key}
                className="toggle"
                aria-pressed={flavor === f.key}
                onClick={() => setFlavor(f.key)}
                title={f.title}
              >
                {f.label}
              </button>
            ))}
          </span>
          <ProgressionMenu tonic={tonic} onUse={loadProgression} onPreview={hearProgression} onRandom={randomProgression} />
          <GrooveMenu
            groove={groove}
            onChange={setGroove}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onRandom={randomGroove}
          />
        </div>
        <div className="chord-picker">
          <div className="picker-half">
            <span className="picker-label">In key</span>
            <Palette
              chords={palette}
              onPick={(spec: ChordSpec) => hearChord(spec.chord)}
              onPointerDown={(chord, e) =>
                beginDrag({ id: crypto.randomUUID(), chord: chord.chord, existing: false, grabOffset: 0 }, e)
              }
            />
          </div>
          <SpiceRow
            spice={spice}
            tonic={tonic}
            mode={mode}
            onPick={(s) => hearChord(s.chord)}
            onPointerDown={(s, e) => beginDrag({ id: crypto.randomUUID(), chord: s.chord, existing: false, grabOffset: 0 }, e)}
          />
        </div>
      </section>

      <section>
        <div className="toolbar">
          <div className="group">
            <button className="play" onClick={togglePlay} title="Play / Pause (Space)">
              {isPlaying ? '❚❚ Pause' : '▶ Play'}
            </button>
            <button onClick={stop} title="Stop and return to the start (Shift+Space)">
              ■ Stop
            </button>
            <button className="toggle" aria-pressed={loop} onClick={() => setLoop((l) => !l)} title="Loop (L)">
              Loop
            </button>
          </div>
          <div className="group">
            <button onClick={track.undo} disabled={!track.canUndo} title="Undo (⌘Z / Ctrl+Z)">
              Undo
            </button>
            <button onClick={track.redo} disabled={!track.canRedo} title="Redo (⇧⌘Z / Ctrl+Y)">
              Redo
            </button>
          </div>
        </div>

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
          onInvert={(id, dir) => invertChords(dir, id)}
          onCreateEmpty={(ticks) => {
            const id = crypto.randomUUID()
            const next = addEmptyClip(clips, id, ticks, totalTicks, barTicks)
            if (next === clips) return
            setClips(() => next)
            select({ ids: [id], anchor: id }, next)
          }}
        >
          <div className="lane-bar">
            <button
              className="toggle small"
              aria-pressed={showNotes}
              onClick={() => setShowNotes((v) => !v)}
              title="Show each chord's notes over time"
            >
              Notes
            </button>
            {showNotes && clips.length > 0 && (
              <span className="lane-legend">
                Lines show how each note moves to the next chord.
                <span className="out-swatch" aria-hidden /> not in the key
              </span>
            )}
            <span className="octave" role="group" aria-label="Inversion">
              <span className="muted">Inversion{selectedClips.length > 0 ? ' (selected)' : ''}</span>
              <button
                className="small"
                onClick={() => invertChords(-1)}
                disabled={!canInvertAll(-1)}
                aria-label="Inversion down"
                title="Move the selected chords (or all) one inversion down (↓)"
              >
                ▾
              </button>
              <button
                className="small"
                onClick={() => invertChords(1)}
                disabled={!canInvertAll(1)}
                aria-label="Inversion up"
                title="Move the selected chords (or all) one inversion up (↑)"
              >
                ▴
              </button>
            </span>
            <span className="octave" role="group" aria-label="Octave">
              <span className="muted">Octave{selectedClips.length > 0 ? ' (selected)' : ''}</span>
              <button
                className="small"
                onClick={() => shiftOctaves(-1)}
                disabled={!octaveShifted(-1)}
                aria-label="Octave down"
                title="Move the selected chords (or all) down an octave (Shift+↓)"
              >
                ▾
              </button>
              <button
                className="small"
                onClick={() => shiftOctaves(1)}
                disabled={!octaveShifted(1)}
                aria-label="Octave up"
                title="Move the selected chords (or all) up an octave (Shift+↑)"
              >
                ▴
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
          </div>
          {showNotes && (
            <NotesLane
              clips={preview ? preview.clips : clips}
              totalTicks={totalTicks}
              tonic={tonic}
              mode={mode}
              selectedIds={selectedIds}
              bassOn={groove.bass.on}
            />
          )}
        </Timeline>

        <div className={panelOpen ? 'panel' : 'panel collapsed'}>
          <button
            className="panel-bar"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((o) => !o)}
            title={panelOpen ? 'Collapse the details' : 'Expand the details'}
          >
            <span className="chevron" aria-hidden />
            <span>{multiSelected ? `${selectedClips.length} chords selected` : 'Chord details'}</span>
            {!panelOpen && !multiSelected && inspected && (
              <span className="muted">· {inspected.chord ? chordName(inspected.chord) : 'Empty clip'}</span>
            )}
          </button>
          {panelOpen &&
            (multiSelected ? (
              <div className="multi">
                <p className="muted">Change their voicing together:</p>
                <div className="group">
                  <button onClick={() => invertChords(-1)} title="Lower inversion (↓)">
                    ▾ Lower
                  </button>
                  <button onClick={() => invertChords(1)} title="Higher inversion (↑)">
                    ▴ Higher
                  </button>
                  <button onClick={smoothen} title="Pick inversions so each chord moves as little as possible">
                    Smooth voicing
                  </button>
                </div>
              </div>
            ) : inspected ? (
              <ChordInspector
                key={inspected.id}
                chord={inspected.chord}
                spot={spotOf(inspected.id)}
                tab={inspectorTab}
                onTab={setInspectorTab}
                onChange={(chord, fresh) => setInspectedChord(inspected, chord, fresh)}
                onClear={() => {
                  setClips((c) => c.map((x) => (x.id === inspected.id ? { ...x, chord: null } : x)))
                  setInspectorTab('ideas')
                }}
                onPreview={(chord) => !isPlaying && previewChord(chord)}
              />
            ) : (
              <p className="muted panel-empty">
                Select a chord on the track to see how it fits the key, try other flavors, and edit its notes. Double-click
                empty space on the track for an empty clip with chord ideas.
              </p>
            ))}
        </div>

        <div className="footer">
          <details className="shortcuts" open={tipsOpen} onToggle={(e) => setTipsOpen(e.currentTarget.open)}>
            <summary>Shortcuts &amp; tips</summary>
            <dl>
              <dt>Drag a clip</dt>
              <dd>Move it; the preview shows what will happen</dd>
              <dt>{COPY_KEY} + drag a clip</dt>
              <dd>Copy it (or the selected clips) somewhere else</dd>
              <dt>Double-click empty space</dt>
              <dd>Add an empty clip (up to a bar) with chord ideas</dd>
              <dt>Drag a clip's edge</dt>
              <dd>Resize it</dd>
              <dt>Click / drag the ruler</dt>
              <dd>Move the playhead</dd>
              <dt>{FREE_KEY} while dragging</dt>
              <dd>Ignore the grid</dd>
              <dt>Shift+click · ⌘/Ctrl+click</dt>
              <dd>Select a range of clips · add/remove one clip</dd>
              <dt>⌘A / Ctrl+A</dt>
              <dd>Select all clips</dd>
              <dt>Click · drag a palette chord</dt>
              <dd>Hear it · add it (or drop on a clip to replace it)</dd>
              <dt>1 – 7</dt>
              <dd>Hear that palette chord</dd>
              <dt>← →</dt>
              <dd>Previous / next clip, or move the playhead</dd>
              <dt>↑ ↓</dt>
              <dd>Selected chords (or all) one inversion higher / lower</dd>
              <dt>Shift+↑ ↓</dt>
              <dd>Selected chords (or all) an octave up / down</dd>
              <dt>Notes bar</dt>
              <dd>Inversion, octave and smooth voicing for the selected chords (or all)</dd>
              <dt>Space · Shift+Space</dt>
              <dd>Play/pause · stop</dd>
              <dt>L · M</dt>
              <dd>Loop · metronome on/off</dd>
              <dt>Delete · Esc</dt>
              <dd>Remove · deselect clips</dd>
              <dt>⌘Z · ⇧⌘Z</dt>
              <dd>Undo · redo</dd>
            </dl>
          </details>
          <div className="group">
            <button
              onClick={clearAll}
              disabled={isFresh}
              title="Start over: empty track, C major, 4 bars of 4/4, 120 BPM, default groove. Undo brings the track back; the groove and tempo reset for good."
            >
              Clear
            </button>
            <MidiMenu
              groove={groove}
              disabled={chordClips(clips).length === 0}
              onDownload={(parts, filename) => downloadMidi({ clips: sortedClips, totalTicks, bpm, sig, groove, parts }, filename)}
            />
          </div>
        </div>
      </section>

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


/** A simple metronome glyph (pyramid body and pendulum). */
function MetronomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M5.5 1.5h5l3 13h-11z" />
      <path d="M8 11 12 3.5" strokeLinecap="round" />
      <path d="M3.6 10.5h8.8" />
    </svg>
  )
}
