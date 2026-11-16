import { useEffect, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  /** The window's own class (its layout); it also gets the shared `.modal` frame. */
  className: string
  /** Id of the window's title. */
  labelledBy: string
  onClose: () => void
  /** The window's own keys. Calling preventDefault keeps the default Esc/Tab handling out of it. */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void
  /** Focused on open with a mouse (e.g. the search box); on touch screens the window itself is, so no keyboard pops up. */
  initialFocus?: RefObject<HTMLElement | null>
  /** The window element, for callers that look things up inside it. */
  dialogRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}

const FOCUSABLE = 'button:not(:disabled), input:not([type="file"]), select'

/**
 * A modal window over the page (the sessions window, the progression browser): portalled to
 * `body`, a backdrop that closes it when clicked, Esc closes it, Tab stays inside, and focus
 * that falls out of it (the focused row went away, a click on nothing) is taken back, so keys
 * never reach the app's shortcuts while it's open (the app also checks for `.modal-backdrop`).
 */
export function Modal({ className, labelledBy, onClose, onKeyDown, onPointerDown, initialFocus, dialogRef, children }: Props) {
  useEffect(() => {
    if (initialFocus?.current && window.matchMedia('(pointer: fine)').matches) initialFocus.current.focus()
    else dialogRef.current?.focus()
  }, [initialFocus, dialogRef]) // refs: on open only

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog || dialog.contains(document.activeElement)) return
      dialog.focus()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Tab') {
      const focusable = [...dialogRef.current!.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const [first, last] = [focusable[0], focusable[focusable.length - 1]]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={keyDown}
        onPointerDown={onPointerDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
