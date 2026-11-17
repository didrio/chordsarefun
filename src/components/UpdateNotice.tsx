import { useState } from 'react'
import { usePwa } from '../pwa'

type Props = {
  /** Save what's on screen; called before reloading. */
  onFlush: () => void
}

/**
 * Floats with the other notices when a new version of the app took over this tab (a deploy while it was open,
 * T33). Nothing reloads by itself, so a song never stops mid-play; Reload saves first, then loads the new one.
 */
export function UpdateNotice({ onFlush }: Props) {
  const { updateReady } = usePwa()
  const [later, setLater] = useState(false)
  if (!updateReady || later) return null
  return (
    <div className="home-notice update-notice" role="status">
      <span>A new version of the app is ready.</span>
      <span className="group">
        <button
          className="small primary"
          onClick={() => {
            onFlush()
            location.reload()
          }}
        >
          Reload
        </button>
        <button className="small" onClick={() => setLater(true)}>
          Later
        </button>
      </span>
    </div>
  )
}
