/** Tiny className joiner (clsx-lite) — avoids a dependency for one function. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
