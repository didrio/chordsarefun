/** A die (five pips), for the "random" buttons. */
export function DiceIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5" cy="5" r="1.2" />
      <circle cx="11" cy="5" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="5" cy="11" r="1.2" />
      <circle cx="11" cy="11" r="1.2" />
    </svg>
  )
}
