import type { CSSProperties } from 'react'
import { Note } from 'tonal'
import { chordIntervals, noteAt, type Chord } from '../music/chord'
import { noteInKey, rootDegree, scaleNotes, type ModeName } from '../music/theory'
import { chordPartVoicing } from '../music/patterns'
import { chordClips, clipEnd, type Clip } from '../music/timeline'

type Props = {
  clips: Clip[]
  totalTicks: number
  tonic: string
  mode: ModeName
  selectedIds: string[]
  /** Whether the bass part plays (if not, slash chords show their low bass note here). */
  bassOn: boolean
}

/** Height of one semitone row, in px. */
const ROW = 7
/** Empty rows shown above the highest and below the lowest note. */
const PADDING_ROWS = 3
/** Space kept clear on the left for the octave labels (C3, C4, ...). */
const LABEL_GUTTER_PX = 26
const BLACK = new Set([1, 3, 6, 8, 10])

const pct = (ticks: number, total: number) => `${(ticks / total) * 100}%`
const chromaOf = (midi: number) => ((midi % 12) + 12) % 12

/** Name for a pitch class: the chord's spelling if it's in the chord, else the key's, else a flat. */
function spell(chroma: number, chord: Chord, tonic: string, mode: ModeName): string {
  const inChord = chordIntervals(chord)
    .map((i) => noteAt(chord.root, i))
    .find((n) => Note.chroma(n) === chroma)
  if (inChord) return inChord
  if (chord.bass && Note.chroma(chord.bass) === chroma) return chord.bass
  return scaleNotes(tonic, mode).find((n) => Note.chroma(n) === chroma) ?? Note.pitchClass(Note.fromMidi(chroma + 60))
}

/**
 * The chords' actual notes over time, like a piano roll: one row per semitone, each
 * clip's voicing as blocks, and lines from each note to the nearest note of the next
 * chord, so you can see which notes hold, which step, and which jump. Display only:
 * notes are edited in the inspector; inversion/octave/smoothing act on whole chords.
 */
export function NotesLane({ clips, totalTicks, tonic, mode, selectedIds, bassOn }: Props) {
  const sorted = chordClips(clips).sort((a, b) => a.start - b.start)
  const voiced = sorted.map((clip) => ({ clip, notes: chordPartVoicing(clip.chord, bassOn) }))
  if (voiced.length === 0) return null
  const all = voiced.flatMap((v) => v.notes)
  // The lane fits the notes: rows stay the same height and the lane grows or shrinks,
  // so one octave of chords is compact and chords far apart get the room they need.
  const lo = Math.min(...all) - PADDING_ROWS
  const hi = Math.max(...all) + PADDING_ROWS
  const rows = hi - lo + 1
  const top = (midi: number) => (hi - midi) * ROW
  const height = rows * ROW

  // Notes sit inset in their clip, so the connecting lines show in the gaps.
  const inset = (clip: Clip) => Math.min(clip.length * 0.12, totalTicks * 0.01)

  return (
    <div className="notes-lane" style={{ height }}>
      {Array.from({ length: rows }, (_, i) => {
        const midi = hi - i
        const c = chromaOf(midi)
        const classes = ['lane-row', BLACK.has(c) && 'black', c === 0 && 'c-row']
        return (
          <div key={midi} className={classes.filter(Boolean).join(' ')} style={{ top: i * ROW, height: ROW }}>
            {c === 0 && <span className="row-label">C{Math.floor(midi / 12) - 1}</span>}
          </div>
        )
      })}

      <svg className="lane-lines" viewBox={`0 0 ${totalTicks} ${height}`} preserveAspectRatio="none" aria-hidden>
        {voiced.slice(0, -1).map(({ clip, notes }, i) => {
          const next = voiced[i + 1]
          const x1 = clipEnd(clip) - inset(clip)
          const x2 = next.clip.start + inset(next.clip)
          return notes.map((n) => {
            const m = next.notes.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), next.notes[0])
            return (
              <line
                key={`${clip.id}-${n}`}
                x1={x1}
                x2={x2}
                y1={top(n) + ROW / 2}
                y2={top(m) + ROW / 2}
                className={m === n ? 'held' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            )
          })
        })}
      </svg>

      {voiced.map(({ clip, notes }) => {
        const degree = rootDegree(clip.chord, tonic, mode)
        const ins = inset(clip)
        const style = {
          // Never under the octave labels: a clip at the very left starts after them.
          left: `max(${pct(clip.start + ins, totalTicks)}, ${LABEL_GUTTER_PX}px)`,
          right: pct(totalTicks - (clipEnd(clip) - ins), totalTicks),
          '--hue': degree === null ? undefined : (degree * 360) / 7,
        } as CSSProperties
        return (
          <div
            key={clip.id}
            className={selectedIds.includes(clip.id) ? 'lane-clip selected' : 'lane-clip'}
            data-diatonic={degree === null ? 'no' : 'yes'}
            style={style}
          >
            {notes.map((m) => {
              const name = spell(chromaOf(m), clip.chord, tonic, mode)
              const out = !noteInKey(name, tonic, mode)
              return (
                <div
                  key={m}
                  className={out ? 'lane-note out' : 'lane-note'}
                  style={{ top: top(m), height: ROW }}
                  title={`${name}${out ? ' (not in the key)' : ''}`}
                >
                  <span className="lane-note-name">{name}</span>
                </div>
              )
            })}
          </div>
        )
      })}
      <div className="playhead" />
    </div>
  )
}
