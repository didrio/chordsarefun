/** An arrow with a shaft (↑ / ↓), clearer at small sizes than a bare triangle. */
export function ArrowIcon({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'up' ? <path d="M6 10.5V1.5M2.5 5 6 1.5 9.5 5" /> : <path d="M6 1.5v9M2.5 7 6 10.5 9.5 7" />}
    </svg>
  )
}
