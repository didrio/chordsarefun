import { PlayIcon } from './Icons'

/** What happened to a shared song's link (share.ts): shown once, in the floating notices. */
export type ShareOutcome =
  | { kind: 'opened'; name: string }
  | { kind: 'invalid' }
  /** Made by a newer version of the app; the link stays in the URL, so a reload (getting that version) opens it. */
  | { kind: 'too-new' }
  | { kind: 'unsupported' }
  | { kind: 'full' }

type Props = {
  outcome: ShareOutcome
  /** Play what was opened (the song if it's arranged, else its section). */
  onPlay: () => void
  onDismiss: () => void
}

/**
 * Says what opening a shared link did, in plain words: the song is now one of your sessions (with a
 * way to hear it), or why it couldn't be opened. Floats with the other notices, so the page never moves.
 */
export function ShareNotice({ outcome, onPlay, onDismiss }: Props) {
  const gotIt = (
    <button className="small" onClick={onDismiss}>
      Got it
    </button>
  )
  if (outcome.kind === 'opened') {
    return (
      <div className="home-notice share-notice" role="status">
        <span>
          <strong>Opened “{outcome.name}” from a link.</strong> It's one of your sessions now, saved in this browser.
        </span>
        <span className="group">
          <button className="small primary" onClick={onPlay}>
            <PlayIcon /> Play
          </button>
          {gotIt}
        </span>
      </div>
    )
  }
  if (outcome.kind === 'too-new') {
    return (
      <div className="home-notice share-notice" role="alert">
        <span>
          <strong>This song was shared from a newer version of chords are fun.</strong> Reload to update, and it opens.
        </span>
        <span className="group">
          <button className="small primary" onClick={() => location.reload()}>
            Reload
          </button>
          {gotIt}
        </span>
      </div>
    )
  }
  const message = {
    invalid: [
      "This link doesn't open a song.",
      'It may have been cut off when it was copied: ask for it again, or copy all of it.',
    ],
    unsupported: ["This browser can't open shared songs.", 'Update it, or open the link in another browser.'],
    full: ["Couldn't open the shared song:", "this browser's storage is full. Delete sessions you don't need, then open the link again."],
  }[outcome.kind]
  return (
    <div className="home-notice share-notice" role="alert">
      <span>
        <strong>{message[0]}</strong> {message[1]}
      </span>
      {gotIt}
    </div>
  )
}
