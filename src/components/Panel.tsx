import type { ReactNode } from 'react'

type Props = {
  title: ReactNode
  /** A short description next to the title (what's in here). */
  hint?: ReactNode
  open: boolean
  onToggle: () => void
  /** Controls on the right of the bar; they work while the panel is collapsed. */
  actions?: ReactNode
  className?: string
  children?: ReactNode
}

/**
 * A collapsible section: a bar (chevron, title, description) that expands and collapses
 * the content below it, like a DAW's detail view. Every section of the page uses it.
 */
export function Panel({ title, hint, open, onToggle, actions, className = '', children }: Props) {
  return (
    <div className={`panel${open ? '' : ' collapsed'} ${className}`.trim()}>
      <div className="panel-head">
        <button className="panel-bar" aria-expanded={open} onClick={onToggle} title={open ? `Collapse ${title}` : `Expand ${title}`}>
          <span className="chevron" aria-hidden />
          <span>{title}</span>
          {hint && <span className="muted">· {hint}</span>}
        </button>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
      {open && children}
    </div>
  )
}
