import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type PointerEvent } from 'react'
import { describeBlockDrop } from '../dropLabel'
import { chordName } from '../music/chord'
import { chordClips } from '../music/timeline'
import { freeKey, IS_MAC } from '../platform'
import type { ClickMods } from '../selection'
import { formatDuration, sectionHue, sectionName, sectionOf, type BlockSpan, type Song } from '../song'
import { PauseIcon, PlayIcon } from './Icons'
import { Panel } from './Panel'
import { SectionBar } from './SectionBar'
import { tint } from './tint'
import { useBlockDrag, type BlockDrag } from './useBlockDrag'

/** The song timeline always shows at least this many bars, so a short song isn't one giant block and there's room to drop. */
const MIN_SONG_BARS = 16

type SectionProps = Omit<ComponentProps<typeof SectionBar>, 'onChipPointerDown' | 'ignoreClick'>

type Props = SectionProps & {
  open: boolean
  onToggle: () => void
  song: Song
  spans: BlockSpan[]
  songTicks: number
  barTicks: number
  /** Selected blocks. */
  selectedIds: string[]
  /** The song is playing (not the section). */
  playing: boolean
  /** The song's playhead while it isn't playing (ticks). */
  playhead: number
  /** The live position while it plays (ticks). */
  playheadTicks: () => number
  onPlay: () => void
  onSeek: (ticks: number) => void
  onBlockClick: (id: string, mods: ClickMods) => void
  onBlockMenu: (id: string, x: number, y: number) => void
  onDeselect: () => void
  onDrop: (drag: BlockDrag & { gap: number }) => void
  onAddAll: () => void
}

const pct = (ticks: number, total: number) => `${(ticks / total) * 100}%`

/**
 * The Song panel: the section chips and ▶ Song in its bar (they work while it's collapsed),
 * and the song timeline in its body: the sections in the order they play, back to back, as
 * wide as they are long. Repeats of a section are the same music (linked).
 */
export function SongPanel(props: Props) {
  const { open, song, spans, songTicks, barTicks, selectedIds, playing } = props
  const laneRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const songBars = Math.round(songTicks / barTicks)
  const scaleBars = Math.max(songBars, MIN_SONG_BARS)
  const scaleTicks = scaleBars * barTicks
  const nameOf = (id: string) => sectionName(sectionOf(song, id))

  const { drag, begin, justDragged } = useBlockDrag({ laneRef, scaleTicks, spans, onDrop: props.onDrop })
  const lifted = drag?.source.kind === 'move' && !drag.copy && drag.gap !== null ? drag.source.ids : []
  const label = drag ? describeBlockDrop(drag.source, drag.gap, song.arrangement, nameOf, { copy: drag.copy, open }) : null
  const dragHue = drag?.source.kind === 'add' ? sectionHue(sectionOf(song, drag.source.section)) : null

  // The song's playhead, and the block that's sounding, follow the audio while the song plays.
  const [activeId, setActiveId] = useState<string | null>(null)
  const playheadTicks = useRef(props.playheadTicks)
  useEffect(() => {
    playheadTicks.current = props.playheadTicks
  })
  useEffect(() => {
    const root = rootRef.current
    if (!playing || !songTicks) {
      root?.style.setProperty('--song-playhead', pct(Math.min(props.playhead, songTicks), scaleTicks))
      return
    }
    let raf = 0
    const frame = () => {
      const t = playheadTicks.current() % songTicks
      root?.style.setProperty('--song-playhead', pct(t, scaleTicks))
      setActiveId(spans.find((b) => b.start <= t && t < b.start + b.length)?.id ?? null)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [playing, props.playhead, songTicks, scaleTicks, spans])

  // Ruler: click or drag to move the song's playhead, snapped to bars (⌘/Alt: free).
  const scrubbing = useRef(false)
  const seekAt = (e: PointerEvent) => {
    const r = laneRef.current?.getBoundingClientRect()
    if (!r || !songTicks) return
    const t = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * scaleTicks
    const snapped = freeKey(e) ? Math.round(t) : Math.round(t / barTicks) * barTicks
    props.onSeek(Math.min(snapped, songTicks - 1))
  }

  const gapX = drag?.gap == null ? null : drag.gap < spans.length ? spans[drag.gap].start : songTicks

  return (
    <>
      <Panel
        title="Song"
        open={open}
        onToggle={props.onToggle}
        className="song-arranger"
        actions={
          <>
            <SectionBar
              sections={props.sections}
              current={props.current}
              onSwitch={props.onSwitch}
              onAdd={props.onAdd}
              onRename={props.onRename}
              onFork={props.onFork}
              onDelete={props.onDelete}
              onChipPointerDown={(id, e) => begin({ kind: 'add', section: id }, e, () => {})}
              ignoreClick={justDragged}
            />
            <span className="song-transport">
              <button
                className="song-play small"
                onClick={props.onPlay}
                disabled={!songTicks}
                aria-label={playing ? 'Pause song' : 'Play song'}
                title={songTicks ? (playing ? 'Pause the song (Space)' : 'Play the whole song, in order') : 'Drag sections onto the song first'}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
                Song
              </button>
              <span className="song-length" title={`${songBars} bar${songBars === 1 ? '' : 's'}`}>
                {formatDuration(songTicks, song.bpm)}
              </span>
            </span>
          </>
        }
      >
        <div className="song-timeline" ref={rootRef}>
          <div className="song-scroll">
            <div className="song-inner" style={{ '--song-bars': scaleBars } as CSSProperties}>
              <div
                className="ruler song-ruler"
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  e.currentTarget.setPointerCapture(e.pointerId)
                  scrubbing.current = true
                  seekAt(e)
                }}
                onPointerMove={(e) => scrubbing.current && seekAt(e)}
                onPointerUp={() => (scrubbing.current = false)}
                onPointerCancel={() => (scrubbing.current = false)}
              >
                {spans.map((b) => (
                  <span key={b.id} className="bar-number" style={{ left: pct(b.start, scaleTicks) }}>
                    {b.start / barTicks + 1}
                  </span>
                ))}
                {songTicks > 0 && <div className="playhead-marker" />}
              </div>
              <div ref={laneRef} className={drag && drag.gap !== null ? 'song-lane dropping' : 'song-lane'} onPointerDown={props.onDeselect}>
                {spans.map((b) => {
                  const section = sectionOf(song, b.section)
                  const name = sectionName(section)
                  const selected = selectedIds.includes(b.id)
                  const classes = [
                    'song-block',
                    selected && 'selected',
                    b.section === props.current && 'editing',
                    playing && b.id === activeId && 'active',
                    lifted.includes(b.id) && 'lifted',
                  ]
                  const bars = section.bars
                  return (
                    <div
                      key={b.id}
                      className={classes.filter(Boolean).join(' ')}
                      style={{
                        // 2px apart, like chords on the track (visual only).
                        left: `calc(${pct(b.start, scaleTicks)} + 2px)`,
                        width: `calc(${pct(b.length, scaleTicks)} - 4px)`,
                        ...tint(sectionHue(section)),
                      }}
                      title={`${name} · ${bars} bar${bars === 1 ? '' : 's'}: click to edit it, drag to move it (hold the copy key to copy)`}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        if (e.button !== 0) return
                        e.preventDefault()
                        const ids = selected && selectedIds.length > 1 ? selectedIds : [b.id]
                        begin({ kind: 'move', ids }, e, (mods) => props.onBlockClick(b.id, mods))
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        // On a Mac, Ctrl+click is a selection gesture, not a right-click.
                        if (IS_MAC && e.ctrlKey) return
                        props.onBlockMenu(b.id, e.clientX, e.clientY)
                      }}
                    >
                      <span className="song-block-name">
                        <span className="section-dot" aria-hidden />
                        {name}
                      </span>
                      <span className="song-block-bars">
                        {bars} bar{bars === 1 ? '' : 's'}
                      </span>
                      <span className="song-block-chords">
                        {chordClips([...section.clips].sort((x, y) => x.start - y.start))
                          .map((c) => chordName(c.chord))
                          .join(' ') || 'No chords yet'}
                      </span>
                      {selected && (
                        <button
                          className="clip-more"
                          aria-label={`More actions for ${name}`}
                          title="Actions (or right-click)"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect()
                            props.onBlockMenu(b.id, r.left, r.bottom + 4)
                          }}
                        >
                          ⋯
                        </button>
                      )}
                    </div>
                  )
                })}
                {spans.length === 0 && !drag && (
                  <div className="song-empty" onPointerDown={(e) => e.stopPropagation()}>
                    Drag sections here, or
                    <button className="small" onClick={props.onAddAll}>
                      Add every section in order
                    </button>
                  </div>
                )}
                {gapX !== null && <div className="song-insert" style={{ left: pct(gapX, scaleTicks) }} />}
                {songTicks > 0 && <div className="playhead" />}
              </div>
            </div>
          </div>
        </div>
      </Panel>
      {drag && (
        <div className={drag.gap !== null ? 'drag-ghost over' : 'drag-ghost'} style={{ left: drag.x, top: drag.y, ...tint(dragHue) }}>
          <span className="ghost-symbol">
            {drag.copy && <span aria-hidden>+ </span>}
            {drag.source.kind === 'add'
              ? nameOf(drag.source.section)
              : drag.source.ids.length === 1
                ? nameOf(song.arrangement.find((b) => b.id === (drag.source as { ids: string[] }).ids[0])?.section ?? '')
                : `${drag.source.ids.length} parts`}
          </span>
          {label && <span className="ghost-label">{label}</span>}
        </div>
      )}
    </>
  )
}
