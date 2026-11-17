/** `base`, or "base 2", "base 3", … whichever isn't taken yet (session names, section names). */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken)
  let n = 1
  while (names.has(n === 1 ? base : `${base} ${n}`)) n++
  return n === 1 ? base : `${base} ${n}`
}
