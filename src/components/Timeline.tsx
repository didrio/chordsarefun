import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react'
import { playheadTicks } from '../music/audio'
import { chordInKey, chordNotes, type ModeName } from '../music/theory'
import { clipEnd, snap, type Clip, type ClipChange } from '../music/timeline'

type Props = {
  trackRef: RefObject<HTMLDivElement | null>
  /** Clips to display: the real track, or a drag preview of it. */
  clips: Clip[]
  totalTicks: number
  gridTicks: number
  /** Bar and beat lengths from the time signature. */
  barTicks: number
  beatTicks: number
  tonic: string
  mode: ModeName
  selectedIds: string[]
  isPlaying: boolean
  /** Playhead position in ticks when not playing (while playing it follows the audio). */
  playhead: number
  onSeek: (ticks: number) => void
  /** A chord is being dragged (enables slide animations). */
  dragging: boolean
  /** Clip where the dragged chord would land. */
  placingIds: string[]
  /** Clip(s) being moved while the pointer is off the track (shown faded). */
  liftedIds: string[]
  /** During a drag preview: how each affected clip will change. */
  changes: Map<string, ClipChange> | null
  /** Pointer is over the track but the chord can't go there. */
  invalid: boolean
  onSelect: (id: string | null) => void
  onClipPointerDown: (clip: Clip, e: PointerEvent, grabOffset: number) => void
  /** A resize drag began (the whole drag is one undo step). */
  onResizeStart: () => void
  onResize: (id: string, edge: 'start' | 'end', ticks: number) => void
  onRemove: (id: string) => void
}

const pct = (ticks: number, total: number) => `${(ticks / total) * 100}%`

const CHANGE_LABELS: Record<ClipChange, { icon: string; text: string }> = {
  swap: { icon: '⇄', text: 'swap' },
  replace: { icon: '↻', text: 'replace' },
  left: { icon: '←', text: 'shift' },
  right: { icon: '→', text: 'shift' },
  squeeze: { icon: '⇤', text: 'squeeze' },
}

export function Timeline(props: Props) {
  const { trackRef, clips, totalTicks, gridTicks, barTicks, tonic, mode, selectedIds, isPlaying } = props
  const playheadRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)
  const scrubbingRef = useRef(false)
  const resizeRef = useRef<{ id: string; edge: 'start' | 'end' } | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const ticksAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect()
    return Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * totalTicks
  }
  /** Playhead positions snap to the nearest grid line, or follow the pointer when the grid is off. */
  const seekTicks = (clientX: number, free: boolean) => {
    const t = ticksAt(clientX)
    return Math.min(gridTicks && !free ? snap(t, gridTicks, 'round', barTicks) : Math.round(t), totalTicks - 1)
  }

  // Playhead + active clip, driven by the audio transport.
  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    const frame = () => {
      const t = playheadTicks() % totalTicks
      for (const el of [playheadRef.current, markerRef.current]) if (el) el.style.left = pct(t, totalTicks)
      setActiveId(clips.find((c) => c.start <= t && t < clipEnd(c))?.id ?? null)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, clips, totalTicks])

  const startResize = (id: string, edge: 'start' | 'end') => (e: PointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = { id, edge }
    props.onResizeStart()
    props.onSelect(id)
  }
  const moveResize = (e: PointerEvent) => {
    const r = resizeRef.current
    if (r) props.onResize(r.id, r.edge, snap(ticksAt(e.clientX), e.altKey ? 0 : gridTicks, 'round', barTicks))
  }
  const endResize = () => {
    resizeRef.current = null
  }

  // Ruler: click or drag (including the triangle) to move the playhead.
  const startScrub = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    scrubbingRef.current = true
    // Keep the grab cursor for the whole drag, even off the marker.
    e.currentTarget.classList.add('scrubbing')
    props.onSeek(seekTicks(e.clientX, e.altKey))
  }
  const moveScrub = (e: PointerEvent) => {
    if (scrubbingRef.current) props.onSeek(seekTicks(e.clientX, e.altKey))
  }
  const endScrub = (e: PointerEvent) => {
    scrubbingRef.current = false
    e.currentTarget.classList.remove('scrubbing')
  }

  const bars = Math.round(totalTicks / barTicks)
  // Grid lines restart at each bar; with the grid off, show (dotted) beat lines.
  const lineTicks = gridTicks || props.beatTicks
  const trackClasses = ['track', !gridTicks && 'grid-off', props.dragging && 'dragging', props.invalid && 'invalid']
  const playheadLeft = pct(props.playhead, totalTicks)

  return (
    <div className="timeline">
      <div
        className="ruler"
        onPointerDown={startScrub}
        onPointerMove={moveScrub}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
      >
        {Array.from({ length: bars }, (_, i) => (
          <span key={i} className="bar-number" style={{ left: pct(i * barTicks, totalTicks) }}>
            {i + 1}
          </span>
        ))}
        <div ref={markerRef} className="playhead-marker" style={{ left: playheadLeft }} />
      </div>
      <div
        ref={trackRef}
        className={trackClasses.filter(Boolean).join(' ')}
        onPointerDown={(e) => {
          props.onSelect(null)
          props.onSeek(seekTicks(e.clientX, e.altKey))
        }}
      >
        {Array.from({ length: bars }, (_, i) => (
          <div
            key={i}
            className="bar"
            style={
              {
                left: pct(i * barTicks, totalTicks),
                width: pct(barTicks, totalTicks),
                '--grid-size': pct(lineTicks, barTicks),
              } as CSSProperties
            }
          />
        ))}

        {clips.length === 0 && !props.dragging && (
          <div className="track-empty">Drag chords here, or click them above</div>
        )}

        {clips.map((clip) => {
          const info = chordInKey(clip.symbol, tonic, mode)
          const notes = chordNotes(clip.symbol).join(' ')
          const classes = [
            'clip',
            selectedIds.includes(clip.id) && 'selected',
            isPlaying && clip.id === activeId && 'active',
            props.placingIds.includes(clip.id) && 'placing',
            props.liftedIds.includes(clip.id) && 'lifted',
          ]
          const change = props.changes?.get(clip.id)
          const style = {
            left: pct(clip.start, totalTicks),
            width: pct(clip.length, totalTicks),
            '--hue': info ? (info.degree * 360) / 7 : undefined,
          } as CSSProperties
          return (
            <div
              key={clip.id}
              className={classes.filter(Boolean).join(' ')}
              data-diatonic={info ? 'yes' : 'no'}
              style={style}
              title={`${clip.symbol}: ${notes}`}
              onPointerDown={(e) => {
                e.stopPropagation()
                props.onClipPointerDown(clip, e, ticksAt(e.clientX) - clip.start)
              }}
              // Ctrl+click is a multi-select gesture here, not a context menu.
              onContextMenu={(e) => e.preventDefault()}
            >
              <div
                className="handle start"
                onPointerDown={startResize(clip.id, 'start')}
                onPointerMove={moveResize}
                onPointerUp={endResize}
              />
              {change && (
                <span className={`change-badge ${change}`}>
                  <span aria-hidden>{CHANGE_LABELS[change].icon}</span>
                  <span className="change-text">{CHANGE_LABELS[change].text}</span>
                </span>
              )}
              <span className="symbol">{clip.symbol}</span>
              {info && <span className="roman">{info.roman}</span>}
              <span className="notes">{notes}</span>
              <button
                className="remove"
                aria-label={`Remove ${clip.symbol}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => props.onRemove(clip.id)}
              >
                ×
              </button>
              <div
                className="handle end"
                onPointerDown={startResize(clip.id, 'end')}
                onPointerMove={moveResize}
                onPointerUp={endResize}
              />
            </div>
          )
        })}

        <div ref={playheadRef} className="playhead" style={{ left: playheadLeft }} />
      </div>
    </div>
  )
}
