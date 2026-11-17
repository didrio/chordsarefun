import { useRef, useState } from 'react'
import { Modal } from './Modal'

type Props = {
  /** Imports a backup file's text: an error to show, or null once it's imported (and opened). */
  onImport: (text: string) => Promise<string | null>
  onClose: () => void
}

/**
 * The installed app's first launch on empty storage (T33). On iPhone, iPad and Safari's Add to Dock, an
 * installed app gets its own storage, apart from the browser's, so someone who used the site first finds no
 * sessions here. This says why, how to bring them over (a backup file), and lets them start fresh.
 */
export function InstalledWelcome({ onImport, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal className="welcome-window" labelledBy="welcome-title" dialogRef={dialogRef} initialFocus={importRef} onClose={onClose}>
      <h2 id="welcome-title">Welcome to chords are fun</h2>
      <p>
        Made sessions in your browser before? They aren't here yet: on iPhone and iPad (and Safari's Add to Dock on
        a Mac) the installed app keeps its own sessions, apart from the browser's.
      </p>
      <p>
        To bring them over, open {location.host || 'the site'} in your browser, open the sessions window and choose{' '}
        <strong>Back up all sessions</strong>. Then come back here and import that file.
      </p>
      <p className="welcome-note">It works offline, and your sessions stay on this device.</p>
      {error && (
        <p className="welcome-error" role="alert">
          {error}
        </p>
      )}
      <div className="welcome-actions">
        <button ref={importRef} className="primary" onClick={() => fileRef.current?.click()}>
          Import backup…
        </button>
        <button onClick={onClose}>Start fresh</button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void file.text().then(onImport).then(setError)
        }}
      />
    </Modal>
  )
}
