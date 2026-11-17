import { Component, type ReactNode } from 'react'
import { downloadBackup } from '../backup'
import { openBlankOnNextLoad } from '../session'

type State = { error: Error | null }

/**
 * The last line of defense: if rendering crashes, show a way out instead of a blank page. The sessions
 * are still in storage, so the backup reads them straight from there (no React state needed), and a
 * session that crashes as it opens can be skipped by opening a blank one.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>Your sessions are still saved in this browser. Reloading usually fixes it.</p>
        <p className="crash-actions">
          <button className="primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button onClick={downloadBackup} title="Download every session as one file you can import later">
            Download a backup
          </button>
          <button
            onClick={() => {
              openBlankOnNextLoad()
              location.reload()
            }}
            title="If the same session keeps crashing: open a new blank one instead (nothing is deleted)"
          >
            Open a blank session
          </button>
        </p>
        <p className="muted crash-detail">{this.state.error.message}</p>
      </main>
    )
  }
}
