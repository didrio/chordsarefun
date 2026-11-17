import type { CSSProperties } from 'react'

/** A section kind's color as a `--tint` (gray for unnamed and other sections): chips, song blocks, the drag ghost. */
export const tint = (hue: number | null) => ({ '--tint': hue === null ? 'var(--muted)' : `hsl(${hue} 55% 60%)` }) as CSSProperties
