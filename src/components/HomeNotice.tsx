import { homeMove, type Home } from '../music/home'
import { keyName, MODE_LABELS } from '../music/theory'

type Props = {
  /** The home the chords were written in. */
  from: Home
  to: Home
  /** How many chords are outside the new home. */
  outside: number
  onMove: () => void
  onDismiss: () => void
}

/**
 * Shown right after changing home: the chords stayed put, and here's the one-click way
 * to move them (transpose, or reshape for the new mood), worded for what it'll do.
 */
export function HomeNotice({ from, to, outside, onMove, onDismiss }: Props) {
  const move = homeMove(from, to)
  if (move === 'none') return null
  const toName = keyName(to.tonic, to.mode)
  if (move === 'same-notes') {
    return (
      <div className="home-notice" role="status">
        <span>
          <strong>{toName}</strong> uses the same notes as {keyName(from.tonic, from.mode)}, so your chords still fit. Only
          the labels changed.
        </span>
        <button className="small" onClick={onDismiss}>
          Got it
        </button>
      </div>
    )
  }
  const action = {
    transpose: { label: `Transpose chords to ${toName}`, why: 'Moves every chord by the same distance.' },
    reshape: {
      label: `Reshape chords for ${MODE_LABELS[to.mode]}`,
      why: 'Chords in the old key keep their role (V stays V) with the new mood\'s notes; others stay put.',
    },
    move: {
      label: `Move chords to ${toName}`,
      why: 'Chords in the old key keep their role (V stays V); others move by the distance between the keys.',
    },
  }[move]
  return (
    <div className="home-notice" role="status">
      <span>
        Home is now <strong>{toName}</strong>. Your chords stayed put
        {outside > 0 ? ` (${outside} ${outside === 1 ? 'is' : 'are'} now outside the key)` : ''}.
      </span>
      <span className="group">
        <button className="small primary" onClick={onMove} title={`${action.why} Undo with ⌘Z.`}>
          {action.label}
        </button>
        <button className="small" onClick={onDismiss} title="Keep the chords as they are">
          Keep them
        </button>
      </span>
    </div>
  )
}
