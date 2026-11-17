/** `base`, or "base 2", "base 3", … whichever isn't taken yet (session names, section names). */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken)
  let n = 1
  while (names.has(n === 1 ? base : `${base} ${n}`)) n++
  return n === 1 ? base : `${base} ${n}`
}

/** Characters file systems refuse (or treat as folders) in a file name, plus control characters. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g

/**
 * The name of an exported file (audio or MIDI), after the session: "My song.wav", "My song -
 * Chorus.wav" for one section of an arranged song, "My song - Bass.wav" for one part alone.
 * Characters a file name can't hold are dropped.
 */
export function exportFileName({ session, section, part, ext }: { session: string; section?: string; part?: string; ext: string }): string {
  const clean = (s: string) => s.replace(UNSAFE, '').replace(/\s+/g, ' ').trim()
  const name = [clean(session) || 'chords', section && clean(section), part && clean(part)].filter(Boolean).join(' - ')
  return `${name.replace(/^\.+/, '') || 'chords'}.${ext}`
}
