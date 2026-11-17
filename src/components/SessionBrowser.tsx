import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { planImport, readBackup } from '../backup'
import { previewSession, stopPreview } from '../music/audio'
import { PlayIcon, StopIcon } from './Icons'
import { Modal } from './Modal'
import {
  filterSessions,
  SESSION_SORTS,
  sessionMusic,
  sessionKey,
  sortSessions,
  type SessionMeta,
  type Sessions,
  type SessionSort,
  type SessionView,
} from '../session'

type Props = {
  sessions: Sessions
  /** Save what's on screen, so summaries and backups have the latest edits. */
  onFlush: () => void
  /** Switch to a session (the caller saves the current one first). */
  onOpen: (id: string) => void
  /** Start a new, empty session in a folder (or none). No confirm: everything is already saved. */
  onNew: (folder: string | null) => void
  /** "<name> copy", without switching to it; returns its id. */
  onDuplicate: (id: string) => string | null
  /** Download every session as one backup file. */
  onBackup: () => void
  /** Before hearing a session: pause the song if it's playing, so they never play over each other. */
  onBeforePreview: () => void
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The sessions trigger in the song bar (reads like the document's name) and the sessions
 * window it opens. Sessions always autosave, like DAW projects that never lose work.
 */
export function SessionMenu(props: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { currentName } = props.sessions
  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }
  return (
    <div className="session-menu">
      <button
        ref={triggerRef}
        className="dropdown-trigger session-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Your sessions: ${currentName}`}
        title="Your sessions: open, organize and back up. Everything saves automatically."
        onClick={() => {
          props.onFlush()
          setOpen(true)
        }}
      >
        <span className="session-name">{currentName}</span>
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && <SessionBrowser {...props} onClose={close} />}
    </div>
  )
}

/** A popup menu's place on screen (fixed), under or above what opened it. */
type MenuAt = { id: string; top?: number; bottom?: number; left: number }

const MENU_WIDTH = 210
const MENU_ROOM = 300

/** Where to show a menu for a button or a right-click point, kept on screen. */
function menuAt(id: string, x: number, top: number, bottom: number): MenuAt {
  const left = Math.max(8, Math.min(x - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
  return window.innerHeight - bottom > MENU_ROOM || top < MENU_ROOM
    ? { id, top: bottom + 4, left }
    : { id, bottom: window.innerHeight - top + 4, left }
}

/** A text box for naming something: Enter or leaving it saves, Esc cancels (null). */
export function NameInput({
  initial = '',
  placeholder,
  label,
  className = 'session-name-input',
  onDone,
}: {
  initial?: string
  placeholder: string
  label: string
  className?: string
  onDone: (name: string | null) => void
}) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (name: string | null) => {
    if (done.current) return
    done.current = true
    onDone(name)
  }
  return (
    <input
      type="text"
      className={className}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      autoFocus
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(value.trim() || null)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          finish(null)
        }
      }}
      onBlur={() => finish(value.trim() || null)}
    />
  )
}

/**
 * The sessions window: views on the left (All, Favorites, folders), the list on the right
 * (search, sort), backup and import at the bottom. Opening a session closes it.
 */
function SessionBrowser({ sessions: s, onOpen, onNew, onDuplicate, onBackup, onBeforePreview, onClose }: Props & { onClose: () => void }) {
  const [view, setView] = useState<SessionView>('all')
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<MenuAt | null>(null)
  const [folderMenu, setFolderMenu] = useState<MenuAt | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  /** A folder being renamed, or 'new' while naming a new one. */
  const [folderNaming, setFolderNaming] = useState<string | null>(null)
  const [folderConfirming, setFolderConfirming] = useState<string | null>(null)
  /** The session whose menu is naming a new folder to move it into. */
  const [newFolderFor, setNewFolderFor] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** The session being heard (its ▶ shows ■), and which of its chords is sounding. */
  const [hearing, setHearing] = useState<{ id: string; at: number } | null>(null)
  const hearingRef = useRef(false)
  useEffect(() => {
    hearingRef.current = hearing !== null
  })
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const folderName = new Map(s.folders.map((f) => [f.id, f.name]))
  // A folder deleted while viewed: back to all.
  const shownView = view === 'all' || view === 'favorites' || folderName.has(view) ? view : 'all'
  const keys = useMemo(() => new Map(s.sessions.map((m) => [m.id, sessionKey(m.id)])), [s.sessions])
  const music = useMemo(() => new Map(s.sessions.map((m) => [m.id, sessionMusic(m.id)])), [s.sessions])
  const rows = sortSessions(filterSessions(s.sessions, shownView, query), s.sort)
  const count = (v: SessionView) => filterSessions(s.sessions, v).length
  const viewTitle = shownView === 'all' ? 'All sessions' : shownView === 'favorites' ? 'Favorites' : folderName.get(shownView)!

  // Closing the window stops a session being heard.
  useEffect(
    () => () => {
      if (hearingRef.current) stopPreview(true)
    },
    [],
  )

  /** ▶: hear a session on a loop exactly as its Play plays it: its tempo, groove and sounds (■ stops it). */
  const hear = (id: string) => {
    if (hearing?.id === id) return stopPreview(true)
    const m = music.get(id)
    if (!m) return
    onBeforePreview()
    void previewSession(m, {
      onChord: (at) => setHearing((h) => (h?.id === id ? { ...h, at } : h)),
      onEnd: () => setHearing((h) => (h?.id === id ? null : h)),
    })
    setHearing({ id, at: -1 })
  }

  // A new copy or import: show it and briefly highlight it.
  useEffect(() => {
    if (!flash) return
    dialogRef.current?.querySelector(`[data-id="${flash}"]`)?.scrollIntoView({ block: 'nearest' })
    const t = window.setTimeout(() => setFlash(null), 1600)
    return () => window.clearTimeout(t)
  }, [flash])

  const closeMenus = () => {
    setMenu(null)
    setFolderMenu(null)
    setNewFolderFor(null)
  }
  const focusRow = (id: string) =>
    window.requestAnimationFrame(() =>
      dialogRef.current?.querySelector<HTMLElement>(`[data-id="${id}"] .session-open`)?.focus(),
    )
  const open = (id: string) => {
    if (id === s.current) return onClose()
    onOpen(id)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    // Esc closes a menu or a confirm first (Modal closes the window otherwise).
    if (e.key === 'Escape' && (menu || folderMenu || confirming || folderConfirming)) {
      e.preventDefault()
      closeMenus()
      setConfirming(null)
      setFolderConfirming(null)
      return
    }
    // ↑/↓ between sessions (from the search box too), F2 renames.
    const rowButtons = [...dialogRef.current!.querySelectorAll<HTMLElement>('.session-open')]
    const at = rowButtons.indexOf(target)
    if (e.key === 'ArrowDown' && (at >= 0 || target === searchRef.current)) {
      e.preventDefault()
      rowButtons[Math.min(at + 1, rowButtons.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp' && at >= 0) {
      e.preventDefault()
      if (at === 0) searchRef.current?.focus()
      else rowButtons[at - 1].focus()
    } else if (e.key === 'F2' && at >= 0) {
      e.preventDefault()
      setRenaming(target.closest<HTMLElement>('[data-id]')!.dataset.id!)
    }
  }

  const importFile = async (file: File) => {
    const storage = readBackup(await file.text())
    if (!storage) return setNotice("That file isn't a sessions backup.")
    const plan = planImport(storage, s.sessions, s.folders)
    if (plan.sessions.length === 0) return setNotice('No sessions in that backup.')
    if (!s.importSessions(plan)) return setNotice("Not enough room in this browser's storage to import it.")
    setView('all')
    setQuery('')
    setFlash(plan.sessions[0].id)
    setNotice(
      `Imported ${plural(plan.sessions.length, 'session')}` +
        (plan.renamed ? ` (${plan.renamed} renamed "(imported)": the name was taken).` : '.'),
    )
  }

  const rowMenu = (m: SessionMeta, at: MenuAt) => (
    <div className="session-popup" role="menu" aria-label={`${m.name} options`} style={{ top: at.top, bottom: at.bottom, left: at.left }}>
      <button
        role="menuitem"
        onClick={() => {
          closeMenus()
          setRenaming(m.id)
        }}
      >
        Rename
      </button>
      <button
        role="menuitem"
        onClick={() => {
          closeMenus()
          const id = onDuplicate(m.id)
          if (id) setFlash(id)
        }}
      >
        Duplicate
      </button>
      <div className="session-popup-label">Move to</div>
      {[{ id: null, name: 'No folder' }, ...s.folders].map((f) => (
        <button
          key={f.id ?? 'none'}
          role="menuitemradio"
          aria-checked={m.folder === f.id}
          onClick={() => {
            closeMenus()
            if (m.folder !== f.id) s.moveToFolder(m.id, f.id)
          }}
        >
          {f.name}
        </button>
      ))}
      {newFolderFor === m.id ? (
        <NameInput
          placeholder="Folder name"
          label="New folder name"
          onDone={(name) => {
            if (name) s.moveToFolder(m.id, s.createFolder(name))
            closeMenus()
          }}
        />
      ) : (
        <button role="menuitem" onClick={() => setNewFolderFor(m.id)}>
          New folder…
        </button>
      )}
      <hr />
      <button
        role="menuitem"
        className="danger"
        onClick={() => {
          closeMenus()
          setConfirming(m.id)
        }}
      >
        Delete…
      </button>
    </div>
  )

  const row = (m: SessionMeta) => {
    const isCurrent = m.id === s.current
    const heard = hearing?.id === m.id ? hearing : null
    const names = music.get(m.id)?.names
    // Its chords (lit one by one while heard), then key · folder · edited, always on the right.
    const chords = names ? (
      <span className="session-chords" aria-live="off">
        {names.map((n, i) => (
          <span key={i} className={i === heard?.at ? 'now' : undefined}>
            {n}
          </span>
        ))}
      </span>
    ) : (
      <span className="session-chords empty">No chords yet</span>
    )
    const info = [
      keys.get(m.id),
      shownView !== m.folder && m.folder ? folderName.get(m.folder) : null,
      `edited ${ago(m.updated)}`,
    ]
      .filter(Boolean)
      .join(' · ')
    const meta = (
      <span className="session-meta">
        {chords}
        <span className="session-info">{info}</span>
      </span>
    )
    const openMenu = (x: number, top: number, bottom: number) => {
      setFolderMenu(null)
      setNewFolderFor(null)
      setMenu(menuAt(m.id, x, top, bottom))
    }
    if (confirming === m.id) {
      return (
        <li key={m.id} data-id={m.id} className="session-row confirming">
          <span className="session-confirm-text">
            Delete “{m.name}”? This can't be undone.
          </span>
          <button className="small" autoFocus onClick={() => (setConfirming(null), focusRow(m.id))}>
            Cancel
          </button>
          <button
            className="small danger-fill"
            onClick={() => {
              setConfirming(null)
              s.remove(m.id)
              dialogRef.current?.focus()
            }}
          >
            Delete
          </button>
        </li>
      )
    }
    return (
      <li key={m.id} data-id={m.id} className={flash === m.id ? 'session-row flash' : 'session-row'}>
        <button
          className="session-star"
          aria-pressed={m.favorite}
          aria-label={m.favorite ? `Remove ${m.name} from favorites` : `Add ${m.name} to favorites`}
          title={m.favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => s.toggleFavorite(m.id)}
        >
          {m.favorite ? '★' : '☆'}
        </button>
        <button
          className={hearing?.id === m.id ? 'session-hear playing' : 'session-hear'}
          aria-label={hearing?.id === m.id ? `Stop hearing ${m.name}` : `Hear ${m.name}`}
          title={
            hearing?.id === m.id ? 'Stop' : music.get(m.id) ? 'Hear it on a loop, with its own tempo and sounds' : 'No chords to hear yet'
          }
          disabled={!music.get(m.id)}
          onClick={() => hear(m.id)}
        >
          {hearing?.id === m.id ? <StopIcon /> : <PlayIcon />}
        </button>
        {renaming === m.id ? (
          <div className="session-open renaming">
            <NameInput
              initial={m.name}
              placeholder="Session name"
              label="Session name"
              onDone={(name) => {
                if (name && name !== m.name) s.rename(m.id, name)
                setRenaming(null)
                focusRow(m.id)
              }}
            />
            {meta}
          </div>
        ) : (
          <button
            className="session-open"
            aria-current={isCurrent}
            title={isCurrent ? 'Open now' : `Open ${m.name}`}
            onClick={() => open(m.id)}
            onContextMenu={(e: MouseEvent) => {
              e.preventDefault()
              openMenu(e.clientX + MENU_WIDTH / 2, e.clientY, e.clientY)
            }}
          >
            <span className="session-title-line">
              <span className="session-title">{m.name}</span>
              {isCurrent && <span className="session-badge">Open</span>}
            </span>
            {meta}
          </button>
        )}
        <button
          className="session-more"
          aria-haspopup="menu"
          aria-expanded={menu?.id === m.id}
          aria-label={`More options for ${m.name}`}
          title="Rename, duplicate, move, delete"
          onClick={(e) => {
            if (menu?.id === m.id) return closeMenus()
            const r = e.currentTarget.getBoundingClientRect()
            openMenu(r.right, r.top, r.bottom)
          }}
        >
          ⋯
        </button>
        {menu?.id === m.id && rowMenu(m, menu)}
      </li>
    )
  }

  const folderItem = (f: { id: string; name: string }) => {
    const n = count(f.id)
    if (folderConfirming === f.id) {
      return (
        <div key={f.id} className="session-folder-confirm">
          <span>
            Delete folder “{f.name}”?{n > 0 && ` Its ${plural(n, 'session')} stay in All sessions.`}
          </span>
          <span className="session-folder-confirm-buttons">
            <button className="small" autoFocus onClick={() => setFolderConfirming(null)}>
              Cancel
            </button>
            <button
              className="small danger-fill"
              onClick={() => {
                setFolderConfirming(null)
                s.removeFolder(f.id)
                dialogRef.current?.focus()
              }}
            >
              Delete
            </button>
          </span>
        </div>
      )
    }
    if (folderNaming === f.id) {
      return (
        <NameInput
          key={f.id}
          initial={f.name}
          placeholder="Folder name"
          label="Folder name"
          onDone={(name) => {
            if (name) s.renameFolder(f.id, name)
            setFolderNaming(null)
          }}
        />
      )
    }
    return (
      <div key={f.id} className="session-folder">
        <button className="session-view" aria-current={shownView === f.id} onClick={() => setView(f.id)}>
          <span className="session-view-name">{f.name}</span>
          <span className="session-count">{n}</span>
        </button>
        <button
          className="session-more"
          aria-haspopup="menu"
          aria-expanded={folderMenu?.id === f.id}
          aria-label={`More options for folder ${f.name}`}
          title="Rename or delete this folder"
          onClick={(e) => {
            if (folderMenu?.id === f.id) return closeMenus()
            const r = e.currentTarget.getBoundingClientRect()
            setMenu(null)
            setFolderMenu(menuAt(f.id, r.right + MENU_WIDTH - r.width, r.top, r.bottom))
          }}
        >
          ⋯
        </button>
        {folderMenu?.id === f.id && (
          <div
            className="session-popup"
            role="menu"
            aria-label={`Folder ${f.name} options`}
            style={{ top: folderMenu.top, bottom: folderMenu.bottom, left: folderMenu.left }}
          >
            <button
              role="menuitem"
              onClick={() => {
                closeMenus()
                setFolderNaming(f.id)
              }}
            >
              Rename
            </button>
            <button
              role="menuitem"
              className="danger"
              onClick={() => {
                closeMenus()
                setFolderConfirming(f.id)
              }}
            >
              Delete…
            </button>
          </div>
        )}
      </div>
    )
  }

  const empty =
    query.trim() !== ''
      ? `No sessions match “${query.trim()}”.`
      : shownView === 'favorites'
        ? 'No favorites yet. Click ☆ next to a session to add it here.'
        : 'This folder is empty. Move sessions here from their ⋯ menu, or start a + New session here.'

  return (
    <Modal
      className="session-browser"
      labelledBy="session-browser-title"
      dialogRef={dialogRef}
      initialFocus={searchRef}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (!(e.target as Element).closest('.session-popup, .session-more')) closeMenus()
      }}
    >
      <header className="session-browser-head">
        <h2 id="session-browser-title">Sessions</h2>
        <input
          ref={searchRef}
          type="search"
          className="session-search"
          placeholder="Search sessions"
          aria-label="Search sessions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="tinted session-new"
          title={`Start a new, empty session${folderName.has(shownView) ? ` in ${viewTitle}` : ''}. This one is already saved.`}
          onClick={() => onNew(folderName.has(shownView) ? shownView : null)}
        >
          + New session
        </button>
        <button className="session-close" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          ×
        </button>
      </header>

      <nav className="session-sidebar" aria-label="Session views">
        <button className="session-view" aria-current={shownView === 'all'} onClick={() => setView('all')}>
          <span className="session-view-name">All sessions</span>
          <span className="session-count">{s.sessions.length}</span>
        </button>
        <button className="session-view" aria-current={shownView === 'favorites'} onClick={() => setView('favorites')}>
          <span className="session-view-name">★ Favorites</span>
          <span className="session-count">{count('favorites')}</span>
        </button>
        <div className="session-folders-head">
          <span>Folders</span>
          <button
            className="session-more"
            aria-label="New folder"
            title="New folder"
            onClick={() => setFolderNaming('new')}
          >
            +
          </button>
        </div>
        {s.folders.map(folderItem)}
        {folderNaming === 'new' && (
          <NameInput
            placeholder="Folder name"
            label="New folder name"
            onDone={(name) => {
              if (name) s.createFolder(name)
              setFolderNaming(null)
            }}
          />
        )}
        {s.folders.length === 0 && folderNaming !== 'new' && <p className="session-sidebar-note">No folders yet.</p>}
      </nav>

      <section className="session-main" aria-label={viewTitle}>
        <div className="session-list-head">
          <span className="session-view-title">
            {viewTitle} <span className="muted">· {plural(rows.length, 'session')}</span>
          </span>
          <label className="session-sort">
            <span className="muted">Sort</span>
            <select value={s.sort} onChange={(e) => s.setSort(e.target.value as SessionSort)} aria-label="Sort sessions">
              {SESSION_SORTS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {rows.length === 0 ? <p className="session-empty">{empty}</p> : <ul className="session-rows">{rows.map(row)}</ul>}
      </section>

      <footer className="session-browser-foot">
        <span className="muted" role="status">
          {notice ?? 'Everything saves automatically in this browser.'}
        </span>
        <span className="session-backup">
          <button
            className="small"
            title="Download every session (chords, undo history, groove, folders) as one file"
            onClick={() => {
              onBackup()
              setNotice('Backup downloaded. Import it here any time to get these sessions back.')
            }}
          >
            Back up all sessions
          </button>
          <button
            className="small"
            title="Add the sessions from a backup file. Nothing here is replaced."
            onClick={() => fileRef.current?.click()}
          >
            Import backup…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importFile(file)
            }}
          />
        </span>
      </footer>
    </Modal>
  )
}
