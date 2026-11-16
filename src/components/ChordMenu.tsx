import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { arrowNav } from './useDropdown'

/** One row of the chord menu. `shortcut` is shown right-aligned, like a DAW menu. */
export type ChordMenuItem = {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  /** Why it's disabled, or what it does: the tooltip. */
  title?: string
  danger?: boolean
  onSelect: () => void
}

/** Rows are grouped; a divider sits between groups. */
export type ChordMenuGroup = ChordMenuItem[]

type Props = {
  /** Where it opens: the pointer (right-click) or the ⋯ button's corner, in viewport pixels. */
  x: number
  y: number
  /** Names who it acts on: "Cm" or "3 chords". */
  title: string
  groups: ChordMenuGroup[]
  onClose: () => void
}

/**
 * The actions on chords, one right-click (or ⋯) away. It's a presentational popup: the app
 * decides the rows and what they do, so the chord details can open the same menu later.
 * Picking a row closes it; Esc, a click outside or scrolling closes it too.
 */
export function ChordMenu({ x, y, title, groups, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Opens at the pointer, then is pulled back inside the window once its size is known.
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const margin = 8
    setPos({
      left: Math.max(margin, Math.min(x, window.innerWidth - box.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - box.height - margin)),
    })
  }, [x, y])

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation() // Esc closes the menu, it doesn't also deselect
      onClose()
    }
    // Capture phase: clips stop pointerdown from bubbling, which would leave the menu open.
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="chord-menu"
      role="menu"
      aria-label={`Actions for ${title}`}
      style={pos}
      onKeyDown={arrowNav('button:not(:disabled)')}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="chord-menu-title">{title}</div>
      {groups.map((group, g) => (
        <div key={g} className="chord-menu-group" role="group">
          {group.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              className={item.danger ? 'chord-menu-item danger' : 'chord-menu-item'}
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                onClose()
                item.onSelect()
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
