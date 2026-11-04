import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

/**
 * Open/close state for a custom dropdown: closes on a click outside it or on Esc (and
 * Esc then doesn't also reach the app's shortcuts, e.g. deselect).
 */
export function useDropdown() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      rootRef.current?.querySelector<HTMLElement>('.dropdown-trigger')?.focus()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])
  return { open, setOpen, rootRef }
}

/** ↑/↓ move focus between the `selector` items inside the element handling the key. */
export function arrowNav(selector: string) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(selector)]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = items[Math.min(Math.max(i + (e.key === 'ArrowDown' ? 1 : -1), 0), items.length - 1)]
    next?.focus()
  }
}
