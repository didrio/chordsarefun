import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { uniqueName } from '../names'
import { OTHER_SECTION, SECTION_LABELS, sectionHue, sectionName, type Section } from '../song'
import { ChordMenu, type ChordMenuGroup } from './ChordMenu'
import { PlusIcon } from './Icons'
import { tint } from './tint'
import { NameInput } from './SessionBrowser'
import { arrowNav, useDropdown } from './useDropdown'

type Props = {
  sections: Section[]
  /** The section being edited. */
  current: string
  onSwitch: (id: string) => void
  /** Add an empty section named `label` (numbered if taken) and edit it; returns its id. */
  onAdd: (label: string) => string
  onRename: (id: string, name: string) => void
  /** "Make a new section from this": an independent copy. */
  onFork: (id: string) => void
  onDelete: (id: string) => void
  /** Pointer down on a chip: it may become a drag onto the song timeline. */
  onChipPointerDown?: (id: string, e: PointerEvent) => void
  /** True when a click is the end of a drag (ignored). */
  ignoreClick?: () => boolean
}


/**
 * The song's sections, one chip each: click one to edit it (its chords show on the track),
 * ▾ or right-click for Rename, Make a new section from this, Delete. "+ Section" adds one.
 * Drag a chip onto the song timeline to put it in the song. A session from before songs shows
 * a single "Progression" chip. They sit in the Song panel's bar (SongPanel).
 */
export function SectionBar({ sections, current, onSwitch, onAdd, onRename, onFork, onDelete, onChipPointerDown, ignoreClick }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const menuSection = menu ? sections.find((s) => s.id === menu.id) : undefined
  const lastOne = sections.length <= 1

  // When the chips scroll sideways (narrow screens), keep the edited one in view. Only the
  // chips row scrolls, never the page (undo can switch sections while you're further down).
  const chipsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = chipsRef.current
    const chip = row?.querySelector<HTMLElement>('.section-chip.current')
    if (!row || !chip) return
    const r = row.getBoundingClientRect()
    const c = chip.getBoundingClientRect()
    if (c.left < r.left) row.scrollLeft -= r.left - c.left + 8
    else if (c.right > r.right) row.scrollLeft += c.right - r.right + 8
  }, [current, sections.length])

  const menuGroups = (s: Section): ChordMenuGroup[] => [
    [
      { id: 'rename', label: 'Rename', onSelect: () => setRenaming(s.id) },
      {
        id: 'fork',
        label: 'Make a new section from this',
        title: 'An independent copy (same chords, length and instruments) you can change without changing this one',
        onSelect: () => onFork(s.id),
      },
    ],
    [
      {
        id: 'delete',
        label: 'Delete section',
        danger: true,
        disabled: lastOne,
        title: lastOne ? 'A song always has at least one section' : 'Undo with ⌘Z / Ctrl+Z',
        onSelect: () => onDelete(s.id),
      },
    ],
  ]

  return (
    <div className="sections-bar" role="group" aria-label="Song sections">
      <div className="section-chips" ref={chipsRef}>
        {sections.map((s) => {
          const name = sectionName(s)
          const isCurrent = s.id === current
          return (
            <div key={s.id} className={isCurrent ? 'section-chip current' : 'section-chip'} style={tint(sectionHue(s))}>
              {renaming === s.id ? (
                <NameInput
                  initial={name}
                  placeholder="Section name"
                  label="Section name"
                  className="section-name-input"
                  onDone={(next) => {
                    if (next) onRename(s.id, next)
                    setRenaming(null)
                  }}
                />
              ) : (
                <button
                  className="section-chip-name"
                  aria-pressed={isCurrent}
                  title={`${isCurrent ? `Editing ${name}` : `Edit ${name}`} (drag it onto the song to add it)`}
                  onPointerDown={(e) => onChipPointerDown?.(s.id, e)}
                  onClick={() => !ignoreClick?.() && onSwitch(s.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ id: s.id, x: e.clientX, y: e.clientY })
                  }}
                >
                  <span className="section-dot" aria-hidden />
                  {name}
                </button>
              )}
              <button
                className="section-chip-menu"
                aria-label={`${name}: rename, copy or delete`}
                title="Rename, make a new section from this, delete"
                onClick={(e) => {
                  const box = e.currentTarget.getBoundingClientRect()
                  setMenu({ id: s.id, x: box.left, y: box.bottom + 4 })
                }}
              >
                ▾
              </button>
            </div>
          )
        })}
      </div>
      <AddSection
        names={sections.map(sectionName)}
        onPick={(label, other) => {
          const id = onAdd(label)
          // "Other…": name it right away.
          if (other) setRenaming(id)
        }}
      />
      {menu && menuSection && (
        <ChordMenu x={menu.x} y={menu.y} title={sectionName(menuSection)} groups={menuGroups(menuSection)} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}

/** "+ Section ▾": the usual song parts, each with what it's for, showing the name it will get ("Verse 2"). */
function AddSection({ names, onPick }: { names: string[]; onPick: (label: string, other: boolean) => void }) {
  const { open, setOpen, rootRef } = useDropdown()
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('.menu-item')?.focus()
  }, [open])
  const pick = (label: string, other = false) => {
    setOpen(false)
    onPick(label, other)
  }
  return (
    <div className="dropdown add-section" ref={rootRef}>
      <button
        className="dropdown-trigger tinted small"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Add a section: an empty progression with these instruments and length"
        onClick={() => setOpen((o) => !o)}
      >
        <PlusIcon />
        Section
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown-panel add-section-panel" role="menu" ref={panelRef} onKeyDown={arrowNav('.menu-item')}>
          {SECTION_LABELS.map((l) => (
            <button key={l.kind} className="menu-item" role="menuitem" style={tint(l.hue)} onClick={() => pick(l.label)}>
              <span className="menu-title">
                <span className="section-dot" aria-hidden />
                {uniqueName(l.label, names)}
              </span>
              <span className="menu-desc">{l.hint}</span>
            </button>
          ))}
          <button className="menu-item" role="menuitem" style={tint(null)} onClick={() => pick(OTHER_SECTION, true)}>
            <span className="menu-title">
              <span className="section-dot" aria-hidden />
              Other…
            </span>
            <span className="menu-desc">Name it yourself</span>
          </button>
        </div>
      )}
    </div>
  )
}
