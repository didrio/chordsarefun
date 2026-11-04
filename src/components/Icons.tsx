import type { ReactNode } from 'react'

/** Small stroke/fill icons for the timeline's side buttons (all 18px, currentColor). */
const Svg = ({ children }: { children: ReactNode }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    aria-hidden
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

export const PlayIcon = () => (
  <Svg>
    <path d="M5 3.2v11.6L14.5 9z" fill="currentColor" />
  </Svg>
)
export const PauseIcon = () => (
  <Svg>
    <path d="M6 3.5v11M12 3.5v11" strokeWidth="2.6" />
  </Svg>
)
export const StopIcon = () => (
  <Svg>
    <rect x="4" y="4" width="10" height="10" rx="1.5" fill="currentColor" />
  </Svg>
)
export const LoopIcon = () => (
  <Svg>
    <path d="M3 8.5V8a3 3 0 0 1 3-3h8.5M12 2.5 14.5 5 12 7.5M15 9.5V10a3 3 0 0 1-3 3H3.5M6 15.5 3.5 13 6 10.5" />
  </Svg>
)
export const PlusIcon = () => (
  <Svg>
    <path d="M9 3.5v11M3.5 9h11" />
  </Svg>
)
export const UndoIcon = () => (
  <Svg>
    <path d="M6.5 3.5 3 7l3.5 3.5M3.5 7H11a3.5 3.5 0 0 1 0 7H8" />
  </Svg>
)
export const RedoIcon = () => (
  <Svg>
    <path d="M11.5 3.5 15 7l-3.5 3.5M14.5 7H7a3.5 3.5 0 0 0 0 7h3" />
  </Svg>
)
