import { useState } from 'react'
import { sessionSummary, type Sessions } from '../session'
import { useDropdown } from './useDropdown'

type Props = {
  sessions: Sessions
  /** Save the current work under a name (flushes pending saves first). */
  onSaveAs: (name: string) => void
  /** Switch to a session (null = the unsaved one). */
  onOpen: (id: string | null) => void
}

/** "3 min ago", "yesterday", or a date. */
function ago(time: number): string {
  const min = Math.round((Date.now() - time) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  if (h < 48) return 'yesterday'
  return new Date(time).toLocaleDateString()
}

/**
 * Sessions, like DAW projects but always saved: you're in one session and every change
 * goes into it. Save as names the current work; the list switches between sessions.
 */
export function SessionMenu({ sessions, onSaveAs, onOpen }: Props) {
  const { open, setOpen, rootRef } = useDropdown()
  const [name, setName] = useState('')
  const { current, currentName } = sessions
  const scratchSummary = open ? sessionSummary(null) : null
  const sorted = [...sessions.sessions].sort((a, b) => b.updated - a.updated)
  const choose = (id: string | null) => {
    setOpen(false)
    if (id !== current) onOpen(id)
  }

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        className="dropdown-trigger session-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Sessions: save and open your work"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={currentName ? 'session-name' : 'session-name muted'}>{currentName ?? 'Unsaved session'}</span>
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown-panel session-panel" role="dialog" aria-label="Sessions">
          <form
            className="session-save"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              onSaveAs(name.trim())
              setName('')
              setOpen(false)
            }}
          >
            <input
              type="text"
              value={name}
              placeholder={currentName ? 'Name for a copy' : 'Name this session'}
              aria-label="Session name"
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="primary" disabled={!name.trim()}>
              {currentName ? 'Save copy' : 'Save'}
            </button>
          </form>
          <p className="session-note muted">
            {currentName
              ? `Changes to “${currentName}” save automatically. Save copy keeps this version under a new name.`
              : 'Your work saves automatically. Name it to keep it as a session and start fresh.'}
          </p>

          <ul className="session-list">
            <li>
              <button className="session-item" aria-current={current === null} onClick={() => choose(null)}>
                <span>{scratchSummary || current === null ? 'Unsaved session' : '+ New session'}</span>
                <span className="muted">{scratchSummary ?? 'empty'}</span>
              </button>
            </li>
            {sorted.map((s) => (
              <li key={s.id}>
                <button className="session-item" aria-current={current === s.id} onClick={() => choose(s.id)}>
                  <span>{s.name}</span>
                  <span className="muted">
                    {[sessionSummary(s.id), ago(s.updated)].filter(Boolean).join(' · ')}
                  </span>
                </button>
                <button
                  className="small session-action"
                  title="Rename"
                  aria-label={`Rename ${s.name}`}
                  onClick={() => {
                    const next = window.prompt('Rename session', s.name)?.trim()
                    if (next) sessions.rename(s.id, next)
                  }}
                >
                  ✎
                </button>
                <button
                  className="small session-action"
                  title="Delete"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete “${s.name}”? This can't be undone.`)) {
                      if (s.id === current) onOpen(null)
                      sessions.remove(s.id)
                    }
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
