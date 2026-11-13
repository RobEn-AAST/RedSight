import { useEffect, useState, type ReactNode } from 'react'

import { fetchData, fetchJsonUrl, previewUrl } from '@/lib/dataUrl'
import {
  EngineDataContext,
  emptyEngineData,
  type EngineCard,
  type EngineConstant,
  type EngineConstants,
  type EngineDataState,
  type EngineHazards,
  type EngineLayer,
  type EngineMeta,
  type EngineRouteIndexEntry,
  type EngineStop,
  type PreviewBasemap,
} from '@/lib/engineDataContext'

/**
 * Loads the §15 contract files from app/public/data/ once at startup.
 *
 * Each file is checked for the shape the app relies on before it is accepted.
 * A missing or malformed file stays `null`, so the UI shows an honest "not
 * loaded" state for that part instead of crashing or inventing values.
 */

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isMock = (v: unknown) => isObject(v) && v._mock === true

function parseMeta(raw: unknown): EngineMeta | null {
  if (!isObject(raw) || !isObject(raw.ops_box) || !isObject(raw.habitat)) return null
  const box = raw.ops_box
  const lonlat = raw.habitat.lonlat
  if (![box.west, box.east, box.south, box.north].every(isNumber)) return null
  if (!Array.isArray(lonlat) || !lonlat.every(isNumber) || lonlat.length !== 2) return null
  return raw as unknown as EngineMeta
}

function parseLayers(raw: unknown): EngineLayer[] | null {
  if (!isObject(raw) || !Array.isArray(raw.layers)) return null
  return raw.layers.filter(
    (l): l is EngineLayer =>
      isObject(l) && typeof l.id === 'string' && typeof l.name === 'string' && typeof l.tiles === 'string',
  )
}

/** stops.json is GeoJSON; the app works with flat stop records. */
function parseStops(raw: unknown): EngineStop[] | null {
  if (!isObject(raw) || !Array.isArray(raw.features)) return null
  const stops: EngineStop[] = []
  for (const f of raw.features) {
    if (!isObject(f) || !isObject(f.geometry) || !isObject(f.properties)) continue
    const c = f.geometry.coordinates
    const p = f.properties
    if (!Array.isArray(c) || !isNumber(c[0]) || !isNumber(c[1]) || typeof p.id !== 'string') continue
    stops.push({
      id: p.id,
      name: typeof p.name === 'string' ? p.name : p.id,
      kind: typeof p.kind === 'string' ? p.kind : 'stop',
      lon: c[0],
      lat: c[1],
      sols: Array.isArray(p.sols) ? p.sols.filter(isNumber) : [],
      evidence: typeof p.evidence === 'string' ? p.evidence : undefined,
      approx: p.approx === true,
      photos: Array.isArray(p.photos) ? p.photos.filter((x): x is string => typeof x === 'string') : [],
      panorama: typeof p.panorama === 'string' ? p.panorama : null,
      science: typeof p.science === 'string' ? p.science : undefined,
      badge: (p.badge as EngineStop['badge']) ?? 'Observed',
    })
  }
  return stops
}

function parseConstants(raw: unknown): EngineConstants | null {
  if (!isObject(raw)) return null
  const out: EngineConstants = {}
  for (const [key, v] of Object.entries(raw)) {
    if (isObject(v) && isNumber(v.value)) out[key] = v as unknown as EngineConstant
  }
  return Object.keys(out).length > 0 ? out : null
}

function parseRouteIndex(raw: unknown): EngineRouteIndexEntry[] | null {
  if (!isObject(raw) || !Array.isArray(raw.routes)) return null
  return raw.routes.filter(
    (r): r is EngineRouteIndexEntry =>
      isObject(r) && typeof r.stop === 'string' && typeof r.mode === 'string' && typeof r.file === 'string',
  )
}

function parseHazards(raw: unknown): EngineHazards | null {
  return isObject(raw) && Array.isArray(raw.features) ? (raw as unknown as EngineHazards) : null
}

function parseCard(raw: unknown): EngineCard | null {
  return isObject(raw) && typeof raw.title === 'string' && Array.isArray(raw.values)
    ? (raw as unknown as EngineCard)
    : null
}

function parsePreview(raw: unknown): PreviewBasemap | null {
  if (!isObject(raw) || typeof raw.image !== 'string' || !isObject(raw.bounds)) return null
  const b = raw.bounds
  if (![b.west, b.east, b.south, b.north].every(isNumber)) return null
  return { ...(raw as unknown as PreviewBasemap), url: previewUrl(raw.image) }
}

export function EngineDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EngineDataState>(emptyEngineData)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      fetchData<unknown>('meta.json'),
      fetchData<unknown>('layers.json'),
      fetchData<unknown>('stops.json'),
      fetchData<unknown>('constants.json'),
      fetchData<unknown>('routes/index.json'),
      fetchData<unknown>('hazards.geojson'),
      fetchData<unknown>('cards/rad.json'),
      fetchData<unknown>('cards/rems.json'),
      fetchJsonUrl<unknown>(previewUrl('basemap.json')),
    ]).then((results) => {
      if (cancelled) return
      const raw = results.slice(0, 8)
      const [meta, layers, stops, constants, routeIndex, hazards, rad, rems] = raw
      const preview = results[8]
      setState({
        meta: parseMeta(meta),
        layers: parseLayers(layers),
        stops: parseStops(stops),
        constants: parseConstants(constants),
        routeIndex: parseRouteIndex(routeIndex),
        hazards: parseHazards(hazards),
        cards: { rad: parseCard(rad), rems: parseCard(rems) },
        preview: parsePreview(preview),
        mock: raw.some(isMock),
        probed: true,
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return <EngineDataContext.Provider value={state}>{children}</EngineDataContext.Provider>
}
