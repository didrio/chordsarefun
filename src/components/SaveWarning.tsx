import { useState } from 'react'
import { type SaveStatus, useSaveStatus } from '../persist'

type Props = { onBackup: () => void }

/**
 * Floats with the other notices when the browser refuses to save (see SaveStatus in persist.ts), so work
 * never stops saving silently. It leaves by itself once a save works again; "Got it" hides it until the
 * next new failure.
 */
export function SaveWarning({ onBackup }: Props) {
  const status = useSaveStatus()
  const [dismissed, setDismissed] = useState<SaveStatus | null>(null)
  // Saving works again: forget the dismissal, so a later failure shows again (adjusting state while rendering).
  if (status === 'ok' && dismissed !== null) setDismissed(null)
  if (status === 'ok' || status === dismissed) return null
  return (
    <div className="home-notice save-warning" role="alert">
      <span>
        {status === 'full' ? (
          <>
            <strong>Couldn't save your latest changes:</strong> this browser's storage is full. Back up your
            sessions, then delete ones you don't need.
          </>
        ) : (
          <>
            <strong>Your work isn't being saved:</strong> this browser is blocking storage for this site. Back up
            before you leave, or allow site data in your browser's settings.
          </>
        )}
      </span>
      <span className="group">
        <button className="small" onClick={onBackup}>
          Back up all sessions
        </button>
        <button className="small" onClick={() => setDismissed(status)}>
          Got it
        </button>
      </span>
    </div>
  )
}
