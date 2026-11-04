import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { analyzeChord } from '../music/analysis'
import { canInvert, chordName, voicedNoteNames } from '../music/chord'
import { freeKey } from '../platform'
import { playheadTicks } from '../music/audio'
import { rootDegree, type ModeName } from '../music/theory'
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
  /** The clip the details panel shows (outlined when it isn't selected). */
  inspectedId: string | null
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
  /** Double-click on empty space: add an empty clip there. */
  onCreateEmpty: (ticks: number) => void
  /** Inversion buttons on a selected clip. */
  onInvert: (id: string, dir: 1 | -1) => void
  /** Rendered under the track (the notes lane); can use the `.playhead` class to follow the playhead. */
  children?: ReactNode
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
  const rootRef = useRef<HTMLDivElement>(null)
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
      // Every playhead (ruler marker, track line, notes lane line) reads this variable.
      rootRef.current?.style.setProperty('--playhead', pct(t, totalTicks))
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
    if (r) props.onResize(r.id, r.edge, snap(ticksAt(e.clientX), freeKey(e) ? 0 : gridTicks, 'round', barTicks))
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
    props.onSeek(seekTicks(e.clientX, freeKey(e)))
  }
  const moveScrub = (e: PointerEvent) => {
    if (scrubbingRef.current) props.onSeek(seekTicks(e.clientX, freeKey(e)))
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
  // The chord after each clip, so "leading" chords can say whether they resolve.
  const sorted = [...clips].sort((a, b) => a.start - b.start)
  const nextChord = new Map(sorted.map((c, i) => [c.id, sorted[i + 1]?.chord]))

  return (
    <div ref={rootRef} className="timeline" style={{ '--playhead': playheadLeft } as CSSProperties}>
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
        <div className="playhead-marker" />
      </div>
      <div
        ref={trackRef}
        className={trackClasses.filter(Boolean).join(' ')}
        onPointerDown={(e) => {
          props.onSelect(null)
          props.onSeek(seekTicks(e.clientX, freeKey(e)))
        }}
        onDoubleClick={(e) => {
          if (e.target instanceof Element && e.target.closest('.clip')) return
          props.onCreateEmpty(ticksAt(e.clientX))
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
          <div className="track-empty">Drag chords here, or double-click for an empty clip with ideas</div>
        )}

        {clips.map((clip) => {
          const handle = (edge: 'start' | 'end') => (
            <div className={`handle ${edge}`} onPointerDown={startResize(clip.id, edge)} onPointerMove={moveResize} onPointerUp={endResize} />
          )
          if (!clip.chord) return <EmptyClip key={clip.id} clip={clip} handle={handle} {...props} />
          const chord = clip.chord
          const degree = rootDegree(chord, tonic, mode)
          const { fit, tension } = analyzeChord(chord, tonic, mode, nextChord.get(clip.id))
          const name = chordName(chord)
          const notes = voicedNoteNames(chord).join(' ')
          const selected = selectedIds.includes(clip.id)
          const tag = [fit.tag, tension.level === 2 && 'clash'].filter(Boolean).join(' · ')
          const classes = [
            'clip',
            selected && 'selected',
            !selected && clip.id === props.inspectedId && 'inspected',
            isPlaying && clip.id === activeId && 'active',
            props.placingIds.includes(clip.id) && 'placing',
            props.liftedIds.includes(clip.id) && 'lifted',
          ]
          const change = props.changes?.get(clip.id)
          const style = {
            left: pct(clip.start, totalTicks),
            width: pct(clip.length, totalTicks),
            '--hue': degree === null ? undefined : (degree * 360) / 7,
          } as CSSProperties
          return (
            <div
              key={clip.id}
              className={classes.filter(Boolean).join(' ')}
              data-diatonic={degree === null ? 'no' : 'yes'}
              style={style}
              title={`${name}: ${notes}\n${fit.title}${tension.level ? ` · ${tension.label}` : ''}`}
              onPointerDown={(e) => {
                e.stopPropagation()
                props.onClipPointerDown(clip, e, ticksAt(e.clientX) - clip.start)
              }}
              // Ctrl+click is a multi-select gesture here, not a context menu.
              onContextMenu={(e) => e.preventDefault()}
            >
              {handle('start')}
              {change && (
                <span className={`change-badge ${change}`}>
                  <span aria-hidden>{CHANGE_LABELS[change].icon}</span>
                  <span className="change-text">{CHANGE_LABELS[change].text}</span>
                </span>
              )}
              {tag && !change && (
                <span className={`fit-tag ${fit.kind}${tension.level === 2 ? ' clash' : ''}`}>
                  <span className="fit-tag-text">{tag}</span>
                </span>
              )}
              <span className="symbol">{name}</span>
              <span className="roman">{fit.roman}</span>
              <span className="notes">{notes}</span>
              {selected && (
                <span className="invert" onPointerDown={(e) => e.stopPropagation()}>
                  <button
                    aria-label="Lower inversion"
                    title="Lower inversion (↓)"
                    disabled={!canInvert(chord, -1)}
                    onClick={() => props.onInvert(clip.id, -1)}
                  >
                    ▾
                  </button>
                  <button
                    aria-label="Higher inversion"
                    title="Higher inversion (↑)"
                    disabled={!canInvert(chord, 1)}
                    onClick={() => props.onInvert(clip.id, 1)}
                  >
                    ▴
                  </button>
                </span>
              )}
              <button
                className="remove"
                aria-label={`Remove ${name}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => props.onRemove(clip.id)}
              >
                ×
              </button>
              {handle('end')}
            </div>
          )
        })}

        <div className="playhead" />
      </div>
      {props.children}
    </div>
  )
}

/** An empty clip: a placeholder waiting for a chord (silent). Select it for ideas. */
function EmptyClip({ clip, handle, ...props }: Props & { clip: Clip; handle: (edge: 'start' | 'end') => ReactNode }) {
  const { totalTicks, selectedIds, trackRef } = props
  const selected = selectedIds.includes(clip.id)
  const ticksAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect()
    return Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * totalTicks
  }
  const change = props.changes?.get(clip.id)
  const classes = [
    'clip',
    'empty',
    selected && 'selected',
    !selected && clip.id === props.inspectedId && 'inspected',
    props.placingIds.includes(clip.id) && 'placing',
    props.liftedIds.includes(clip.id) && 'lifted',
  ]
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      data-diatonic="no"
      style={{ left: pct(clip.start, totalTicks), width: pct(clip.length, totalTicks) }}
      title="Empty clip: select it for chord ideas, or drop a chord on it"
      onPointerDown={(e) => {
        e.stopPropagation()
        props.onClipPointerDown(clip, e, ticksAt(e.clientX) - clip.start)
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {handle('start')}
      {change && (
        <span className={`change-badge ${change}`}>
          <span aria-hidden>{CHANGE_LABELS[change].icon}</span>
          <span className="change-text">{CHANGE_LABELS[change].text}</span>
        </span>
      )}
      <span className="symbol">?</span>
      <span className="notes">{selected ? 'pick a chord below' : 'empty'}</span>
      <button
        className="remove"
        aria-label="Remove empty clip"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => props.onRemove(clip.id)}
      >
        ×
      </button>
      {handle('end')}
    </div>
  )
}
