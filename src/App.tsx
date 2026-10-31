import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Palette } from './components/Palette'
import { TimeSignatureControl } from './components/TimeSignatureControl'
import { Timeline } from './components/Timeline'
import { useChordDrag, type DragState } from './components/useChordDrag'
import { describeDrop, heldName } from './dropLabel'
import { useHistory } from './history'
import { usePersistentState } from './persist'
import { clickSelect, EMPTY_SELECTION, pruneSelection, selectAll, type ClickMods, type Selection } from './selection'
import { shortcutFor } from './shortcuts'
import { DEFAULT_TRACK, isTrack } from './track'
import {
  ensureAudio,
  pausePlayback,
  previewChord,
  schedule,
  seekPlayback,
  setBpm as setTransportBpm,
  setMetronome,
  startPlayback,
  stopPlayback,
} from './music/audio'
import { downloadMidi } from './music/midi'
import { chordInKey, chordToKey, diatonicChords, KEYS, MODE_LABELS, MODES, type ChordSpec, type ModeName } from './music/theory'
import {
  addChord,
  BAR_OPTIONS,
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
  type Clip,
  type GridKey,
  type HeldChord,
  type TimeSignature,
} from './music/timeline'

/** Elements whose clicks don't clear the clip selection. */
const KEEPS_SELECTION = '.clip, .palette .chord, button, input, select, label, summary, .ruler'

export default function App() {
  // Settings, saved in the browser.
  const [sevenths, setSevenths] = usePersistentState('sevenths', false)
  const [bpm, setBpm] = usePersistentState('bpm', 120)
  const [gridKey, setGridKey] = usePersistentState<GridKey>('grid', '1/4', (v) => GRIDS.some((g) => g.key === v))
  const [loop, setLoop] = usePersistentState('loop', true)
  const [metronomeOn, setMetronomeOn] = usePersistentState('metronome', false)
  const [metronomeVolume, setMetronomeVolume] = usePersistentState('metronomeVolume', 0.6)
  // The track (clips, length, key, time signature) is the undoable, saved document.
  const track = useHistory(DEFAULT_TRACK, { key: 'track', isValid: isTrack })
  const { clips, bars, tonic, mode, sig } = track.value
  const barTicks = sigBarTicks(sig)
  const beatTicks = sigBeatTicks(sig)
  const gridTicks = gridStep(gridKey, barTicks)
  const withClips = (update: (c: Clip[]) => Clip[]) => (t: typeof track.value) => {
    const next = update(t.clips)
    return sameClips(next, t.clips) ? t : { ...t, clips: next }
  }
  const setClips = (update: (c: Clip[]) => Clip[]) => track.commit(withClips(update))
  const [rawSelection, setSelection] = useState<Selection>(EMPTY_SELECTION)
  const [playState, setPlayState] = useState<'stopped' | 'playing' | 'paused'>('stopped')
  /** Playhead in ticks while stopped/paused; while playing the audio transport is the source of truth. */
  const [playhead, setPlayhead] = useState(0)
  const isPlaying = playState === 'playing'

  const totalTicks = bars * barTicks
  // Undo can shorten the track under the playhead.
  const playheadPos = playhead < totalTicks ? playhead : 0
  const palette = useMemo(() => diatonicChords(tonic, mode, sevenths), [tonic, mode, sevenths])
  // Undo/delete can remove selected clips; ignore ids that no longer exist.
  const selection = pruneSelection(rawSelection, clips)
  const selectedIds = selection.ids
  const selectedClips = clips.filter((c) => selectedIds.includes(c.id))
  const selectOnly = (id: string) => setSelection({ ids: [id], anchor: id })
  const clearSelection = () => setSelection(EMPTY_SELECTION)

  useEffect(() => setTransportBpm(bpm), [bpm])
  useEffect(() => setMetronome(metronomeOn, metronomeVolume), [metronomeOn, metronomeVolume])

  const stop = () => {
    stopPlayback()
    setPlayState('stopped')
    setPlayhead(0)
  }

  // Keep the audio schedule in sync with the track (live edits while playing).
  useEffect(() => {
    schedule({ clips, totalTicks, sig, loop, onEnd: stop })
  }, [clips, totalTicks, sig, loop])

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
  }, [])

  /**
   * Click a clip: plain click selects it, moves the playhead to its start and plays it;
   * Shift extends a range from the anchor, ⌘/Ctrl adds or removes it.
   */
  const selectClip = (clip: Clip, mods: ClickMods = { shift: false, toggle: false }) => {
    setSelection(clickSelect(selection, clips, clip.id, mods))
    if (!mods.shift && !mods.toggle) seek(clip.start)
    if (!isPlaying) previewChord(clip.symbol)
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

  const pickChord = (chord: ChordSpec) => {
    previewChord(chord.symbol)
    if (selectedIds.length > 0) {
      setClips((c) => c.map((clip) => (selectedIds.includes(clip.id) ? { ...clip, symbol: chord.symbol } : clip)))
    } else setClips((c) => addChord(c, chord.symbol, totalTicks, gridTicks, barTicks))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
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
          return palette[shortcut.index] && pickChord(palette[shortcut.index])
        case 'step':
          if (!stepSelection(shortcut.dir)) nudgePlayhead(shortcut.dir)
          return
        case 'toggleLoop':
          return setLoop((l) => !l)
        case 'toggleMetronome':
          return setMetronomeOn((m) => !m)
        case 'remove':
          return removeSelected()
        case 'deselect':
          return clearSelection()
        case 'selectAll':
          return setSelection(selectAll(clips, selection))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const trackRef = useRef<HTMLDivElement>(null)
  const plan = (d: DragState) =>
    d.overTicks === null ? null : planDrop(clips, d.held, d.overTicks, totalTicks, d.free ? 0 : gridTicks, barTicks)

  const { drag, begin: beginDrag } = useChordDrag({
    trackRef,
    totalTicks,
    onDrop: (d) => {
      const result = plan(d)
      if (!result) return
      setClips(() => result.clips)
      if (d.held.existing) setSelection({ ids: result.placedIds, anchor: result.placedId })
      previewChord(d.held.symbol)
    },
    onClick: (held, mods) => {
      if (held.existing) {
        const clip = clips.find((c) => c.id === held.id)
        if (clip) selectClip(clip, mods)
      } else {
        pickChord({ symbol: held.symbol, roman: '' })
      }
    },
  })
  const preview = drag ? plan(drag) : null
  const isOverTrack = drag?.overTicks != null
  const dropChangeMap = drag && preview ? dropChanges(clips, preview, drag.held.id) : null
  const dropLabel = drag ? describeDrop(drag.held, preview, isOverTrack, clips) : null
  const dragHue = drag ? chordInKey(drag.held.symbol, tonic, mode)?.degree : undefined

  /** Changing key/scale moves the clips with it, keeping each chord's role (and color). */
  const changeKey = (to: { tonic: string; mode: ModeName }) =>
    track.commit((t) => ({
      ...t,
      ...to,
      clips: t.clips.map((c) => ({ ...c, symbol: chordToKey(c.symbol, t, to) })),
    }))

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
        <div className="controls">
          <label>
            Key
            <select value={tonic} onChange={(e) => changeKey({ tonic: e.target.value, mode })}>
              {KEYS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Scale
            <select value={mode} onChange={(e) => changeKey({ tonic, mode: e.target.value as ModeName })}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="toggle"
            aria-pressed={sevenths}
            onClick={() => setSevenths((v) => !v)}
            title="Show 7th chords in the palette"
          >
            7ths
          </button>
        </div>
      </header>

      <section>
        <p className={selectedClips.length ? 'palette-hint replacing' : 'palette-hint'}>
          {selectedClips.length === 0
            ? 'Click a chord to add it, or drag it onto the track'
            : `Click a chord to replace ${selectedClips.length === 1 ? selectedClips[0].symbol : `${selectedClips.length} chords`}`}
        </p>
        <Palette
          chords={palette}
          onPick={pickChord}
          onPointerDown={(chord, e) =>
            beginDrag({ id: crypto.randomUUID(), symbol: chord.symbol, existing: false, grabOffset: 0 }, e)
          }
        />
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
            <span className="metronome">
              <button
                className="toggle"
                aria-pressed={metronomeOn}
                onClick={() => {
                  ensureAudio()
                  setMetronomeOn((m) => !m)
                }}
                title="Metronome (M)"
              >
                Metronome
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
            <label>
              BPM
              <input
                type="number"
                min={30}
                max={300}
                value={bpm}
                onChange={(e) => setBpm(Math.min(300, Math.max(30, Number(e.target.value) || 120)))}
              />
            </label>
          </div>
          <div className="group">
            <TimeSignatureControl sig={sig} onChange={changeSig} />
            <label>
              Length
              <select value={bars} onChange={(e) => changeBars(Number(e.target.value))}>
                {BAR_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'bar' : 'bars'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Grid
              <select value={gridKey} onChange={(e) => setGridKey(e.target.value as GridKey)}>
                {GRIDS.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="group end">
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
          isPlaying={isPlaying}
          playhead={playheadPos}
          onSeek={seek}
          dragging={drag !== null}
          placingIds={preview?.placedIds ?? []}
          liftedIds={drag?.held.existing && !preview ? (drag.held.groupIds ?? [drag.held.id]) : []}
          invalid={isOverTrack && !preview}
          changes={dropChangeMap}
          onSelect={(id) => (id ? selectOnly(id) : clearSelection())}
          onClipPointerDown={(clip, e, grabOffset) => {
            // Dragging any clip of a multi-selection moves the whole selection.
            const group = selectedIds.length > 1 && selectedIds.includes(clip.id) ? selectedIds : undefined
            const held: HeldChord = { id: clip.id, symbol: clip.symbol, existing: true, grabOffset, groupIds: group }
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
        />

        <div className="footer">
          <details className="shortcuts">
            <summary>Shortcuts &amp; tips</summary>
            <dl>
              <dt>Drag a clip</dt>
              <dd>Move it; the preview shows what will happen</dd>
              <dt>Drag a clip's edge</dt>
              <dd>Resize it</dd>
              <dt>Click / drag the ruler</dt>
              <dd>Move the playhead</dd>
              <dt>Alt while dragging</dt>
              <dd>Ignore the grid</dd>
              <dt>Shift+click · ⌘/Ctrl+click</dt>
              <dd>Select a range of clips · add/remove one clip</dd>
              <dt>⌘A / Ctrl+A</dt>
              <dd>Select all clips</dd>
              <dt>1 – 7</dt>
              <dd>Add that chord (replaces the selected clips)</dd>
              <dt>← →</dt>
              <dd>Previous / next clip, or move the playhead</dd>
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
              onClick={() => {
                setClips(() => [])
                clearSelection()
                stop()
              }}
              disabled={clips.length === 0}
            >
              Clear
            </button>
            <button className="primary" onClick={() => downloadMidi(clips, bpm, sig)} disabled={clips.length === 0}>
              Download MIDI
            </button>
          </div>
        </div>
      </section>

      {drag && (
        <div
          className={isOverTrack ? 'drag-ghost over' : 'drag-ghost'}
          style={{ left: drag.x, top: drag.y, '--hue': dragHue === undefined ? undefined : (dragHue * 360) / 7 } as CSSProperties}
          data-diatonic={dragHue === undefined ? 'no' : 'yes'}
        >
          <span className="ghost-symbol">{heldName(drag.held)}</span>
          {dropLabel && <span className="ghost-label">{dropLabel}</span>}
        </div>
      )}
    </main>
  )
}

