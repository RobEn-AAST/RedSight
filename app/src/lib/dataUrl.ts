/**
 * Every engine file lives under app/public/data/ (§15). Paths inside the
 * contract files (route `file`, layer `tiles`) are relative to that folder.
 * BASE_URL keeps this working when the app is deployed under a sub-path.
 */
export function dataUrl(path: string): string {
  if (/^(https?:)?\/\//.test(path)) return path
  return `${import.meta.env.BASE_URL}data/${path.replace(/^\/+/, '')}`
}

/**
 * Same, as an absolute URL. MapLibre loads tiles from a worker, where a
 * root-relative URL has no page to resolve against.
 */
export function absoluteDataUrl(path: string): string {
  // `new URL` percent-encodes `{` `}`, which breaks MapLibre tile templates ({z}/{x}/{y}): restore them.
  return new URL(dataUrl(path), window.location.href).href.replace(/%7B/gi, '{').replace(/%7D/gi, '}')
}

/** URL of a file under app/public/preview/ (temporary assets, not engine output). */
export function previewUrl(path: string): string {
  return `${import.meta.env.BASE_URL}preview/${path.replace(/^\/+/, '')}`
}

/** Fetch one contract file. A missing or unreadable file is `null`, never a throw. */
export async function fetchData<T>(path: string): Promise<T | null> {
  return fetchJsonUrl<T>(dataUrl(path))
}

export async function fetchJsonUrl<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    // A dev server answers unknown paths with index.html: treat that as absent.
    if (!(res.headers.get('content-type') ?? '').includes('json')) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}
