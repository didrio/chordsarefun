import type { ReactNode } from 'react'

type Props = {
  title: ReactNode
  /** A short description next to the title (what's in here). */
  hint?: ReactNode
  open: boolean
  onToggle: () => void
  className?: string
  children?: ReactNode
}

/**
 * A collapsible section: a bar (chevron, title, description) that expands and collapses
 * the content below it, like a DAW's detail view. Every section of the page uses it.
 */
export function Panel({ title, hint, open, onToggle, className = '', children }: Props) {
  return (
    <div className={`panel${open ? '' : ' collapsed'} ${className}`.trim()}>
      <button className="panel-bar" aria-expanded={open} onClick={onToggle} title={open ? `Collapse ${title}` : `Expand ${title}`}>
        <span className="chevron" aria-hidden />
        <span>{title}</span>
        {hint && <span className="muted">· {hint}</span>}
      </button>
      {open && children}
    </div>
  )
}

type DismissProps = {
  title: ReactNode
  hint?: ReactNode
  onDismiss: () => void
  className?: string
  children?: ReactNode
}

/**
 * A section that shows up when it's relevant and goes away with the X in its top right
 * corner (the chord details: they appear when you pick a chord).
 */
export function DismissPanel({ title, hint, onDismiss, className = '', children }: DismissProps) {
  return (
    <div className={`panel ${className}`.trim()}>
      <div className="panel-bar static">
        <span>{title}</span>
        {hint && <span className="muted">· {hint}</span>}
        <button className="panel-close" aria-label={`Close ${title}`} title="Close" onClick={onDismiss}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  )
}
