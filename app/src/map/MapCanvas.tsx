import { useEffect, useRef, useState } from 'react'
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type StyleSpecification,
  setWorkerUrl,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/map/map.css'
import type { Feature, FeatureCollection } from 'geojson'

import { cn } from '@/lib/cn'
import { absoluteDataUrl } from '@/lib/dataUrl'
import type { EngineRoute, EngineRouteMode } from '@/lib/engineDataContext'
import { useEngineData } from '@/lib/useEngineData'
import { MODE_COLOR, formatDistance } from '@/map/format'
import { usePlan } from '@/map/usePlan'

/**
 * The MapLibre map of the ops area.
 *
 * Mars coordinates (planetocentric lon/lat, east-positive) are handed to
 * MapLibre as if they were Earth lon/lat. Near the equator Web Mercator barely
 * distorts, so shapes are right; only MapLibre's own distance tools would be
 * wrong (they assume Earth's radius), so the scale bar here is computed from
 * the Mars radius in meta.json's CRS string instead.
 */

// MapLibre looks for its worker file next to its own module, which a bundler
// moves. Hand it the bundled worker's real URL instead.
setWorkerUrl(workerUrl)

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }
const MODES: EngineRouteMode[] = ['fastest', 'safest']
const FIRST_VECTOR_LAYER = 'hazards-fill'
// The header strip covers the top of the map frame, so views are padded clear of it.
const BOX_PADDING = { top: 68, bottom: 28, left: 28, right: 28 }
const ROUTE_PADDING = { top: 104, bottom: 64, left: 64, right: 64 }
const SCALE_STEPS_M = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0a0e14' } }],
}

interface Box {
  west: number
  east: number
  south: number
  north: number
}

function boxPolygon(b: Box): Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [b.west, b.south],
          [b.east, b.south],
          [b.east, b.north],
          [b.west, b.north],
          [b.west, b.south],
        ],
      ],
    },
  }
}

function routeLine(route: EngineRoute | undefined): FeatureCollection {
  if (!route) return EMPTY
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coords } },
    ],
  }
}

function routeBounds(routes: (EngineRoute | undefined)[]): LngLatBoundsLike | null {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const r of routes) {
    for (const [lon, lat] of r?.coords ?? []) {
      w = Math.min(w, lon)
      e = Math.max(e, lon)
      s = Math.min(s, lat)
      n = Math.max(n, lat)
    }
  }
  return Number.isFinite(w) ? [[w, s], [e, n]] : null
}

function marsRadiusM(crs: string | undefined): number | null {
  const match = crs?.match(/\+R=([\d.]+)/)
  return match ? Number(match[1]) : null
}

function moveDuration(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500
}

export function MapCanvas({
  box,
  enabledLayers,
  showPreview,
  showHazards,
  showOpsBox,
}: {
  box: Box
  enabledLayers: Record<string, boolean>
  showPreview: boolean
  showHazards: boolean
  showOpsBox: boolean
}) {
  const engine = useEngineData()
  const { selectedStopId, selectStop, mode, routes, setMap } = usePlan()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [ready, setReady] = useState(false)
  const [scale, setScale] = useState<{ px: number; label: string } | null>(null)

  const radiusM = marsRadiusM(engine.meta?.crs)
  const { west, east, south, north } = box

  // Create the map once per ops box.
  useEffect(() => {
    if (!containerRef.current) return
    const padLon = (east - west) * 0.75
    const padLat = (north - south) * 0.75
    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE,
      bounds: [[west, south], [east, north]],
      fitBoundsOptions: { padding: BOX_PADDING },
      maxBounds: [[west - padLon, south - padLat], [east + padLon, north + padLat]],
      maxZoom: 18,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', () => {
      map.addSource('hazards', { type: 'geojson', data: EMPTY })
      map.addSource('ops-box', { type: 'geojson', data: boxPolygon({ west, east, south, north }) })
      map.addLayer({
        id: FIRST_VECTOR_LAYER,
        type: 'fill',
        source: 'hazards',
        paint: { 'fill-color': '#ff6d6d', 'fill-opacity': 0.22 },
      })
      map.addLayer({
        id: 'hazards-line',
        type: 'line',
        source: 'hazards',
        paint: { 'line-color': '#ff6d6d', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      })
      map.addLayer({
        id: 'ops-box-line',
        type: 'line',
        source: 'ops-box',
        paint: { 'line-color': '#56d8f4', 'line-width': 1.5, 'line-opacity': 0.6, 'line-dasharray': [4, 3] },
      })
      for (const m of MODES) {
        map.addSource(`route-${m}`, { type: 'geojson', data: EMPTY })
        map.addLayer({
          id: `route-${m}-casing`,
          type: 'line',
          source: `route-${m}`,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#06080b', 'line-width': 7, 'line-opacity': 0.85 },
        })
        map.addLayer({
          id: `route-${m}`,
          type: 'line',
          source: `route-${m}`,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': MODE_COLOR[m], 'line-width': 3 },
        })
      }
      mapRef.current = map
      setReady(true)
      setMap(map)
    })

    return () => {
      setMap(null)
      setReady(false)
      mapRef.current = null
      map.remove()
    }
  }, [west, east, south, north, setMap])

  // Scale bar in Mars metres.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !radiusM) return
    const update = () => {
      const centre = map.getCenter()
      const p = map.project(centre)
      const dLon = map.unproject([p.x + 100, p.y]).lng - centre.lng
      const per100px = dLon * ((Math.PI * radiusM) / 180) * Math.cos((centre.lat * Math.PI) / 180)
      const step = SCALE_STEPS_M.findLast((s) => s <= per100px) ?? SCALE_STEPS_M[0]
      setScale({ px: (100 * step) / per100px, label: formatDistance(step) })
    }
    update()
    map.on('move', update)
    return () => {
      map.off('move', update)
    }
  }, [ready, radiusM])

  // Raster layers from layers.json: only layers whose tiles exist are requested.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    for (const layer of engine.layers ?? []) {
      if (!layer.available) continue
      const id = `raster-${layer.id}`
      if (!map.getSource(id)) {
        map.addSource(id, {
          type: 'raster',
          tiles: [absoluteDataUrl(layer.tiles)],
          tileSize: 256,
          minzoom: layer.minzoom,
          maxzoom: layer.maxzoom,
          bounds: [west, south, east, north],
        })
        map.addLayer({ id, type: 'raster', source: id }, FIRST_VECTOR_LAYER)
      }
      map.setLayoutProperty(id, 'visibility', enabledLayers[layer.id] ? 'visible' : 'none')
    }
  }, [ready, engine.layers, enabledLayers, west, east, south, north])

  // Preview image: one picture pinned to its four corners, below every data layer.
  useEffect(() => {
    const map = mapRef.current
    const preview = engine.preview
    if (!ready || !map || !preview) return
    if (!map.getSource('preview')) {
      const b = preview.bounds
      map.addSource('preview', {
        type: 'image',
        url: preview.url,
        coordinates: [
          [b.west, b.north],
          [b.east, b.north],
          [b.east, b.south],
          [b.west, b.south],
        ],
      })
      const firstRaster = map.getStyle().layers.find((l) => l.id.startsWith('raster-'))?.id
      map.addLayer(
        { id: 'preview', type: 'raster', source: 'preview', paint: { 'raster-fade-duration': 0 } },
        firstRaster ?? FIRST_VECTOR_LAYER,
      )
    }
    map.setLayoutProperty('preview', 'visibility', showPreview ? 'visible' : 'none')
  }, [ready, engine.preview, showPreview])

  // Hazard areas and overlay visibility.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource<GeoJSONSource>('hazards')?.setData((engine.hazards ?? EMPTY) as FeatureCollection)
    for (const id of [FIRST_VECTOR_LAYER, 'hazards-line']) {
      map.setLayoutProperty(id, 'visibility', showHazards ? 'visible' : 'none')
    }
    map.setLayoutProperty('ops-box-line', 'visibility', showOpsBox ? 'visible' : 'none')
  }, [ready, engine.hazards, showHazards, showOpsBox])

  // Route lines: both modes drawn, the chosen one emphasised.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    for (const m of MODES) {
      const active = m === mode
      map.getSource<GeoJSONSource>(`route-${m}`)?.setData(routeLine(routes[m]))
      map.setPaintProperty(`route-${m}`, 'line-width', active ? 4 : 2.5)
      map.setPaintProperty(`route-${m}`, 'line-opacity', active ? 1 : 0.6)
      map.setPaintProperty(`route-${m}-casing`, 'line-opacity', active ? 0.85 : 0)
    }
    // Draw the chosen route on top.
    map.moveLayer(`route-${mode}-casing`)
    map.moveLayer(`route-${mode}`)
  }, [ready, routes, mode])

  // Frame the selected stop's routes, or the whole ops box when nothing is selected.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const bounds = routeBounds([routes.fastest, routes.safest])
    if (selectedStopId && bounds) {
      map.fitBounds(bounds, { padding: ROUTE_PADDING, maxZoom: 16.5, duration: moveDuration() })
    } else if (!selectedStopId) {
      map.fitBounds([[west, south], [east, north]], { padding: BOX_PADDING, duration: moveDuration() })
    }
  }, [ready, selectedStopId, routes, west, east, south, north])

  // Stop and habitat markers.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const markers: Marker[] = []

    for (const stop of engine.stops ?? []) {
      const selected = stop.id === selectedStopId
      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute('aria-label', `Stop ${stop.id}: ${stop.name}`)
      el.setAttribute('aria-pressed', String(selected))
      el.className = 'group flex cursor-pointer flex-col items-center gap-1 p-2'
      const chip = document.createElement('span')
      chip.textContent = stop.id
      chip.className = cn(
        'data-readout border px-1.5 py-0.5 text-[11px] font-medium leading-none',
        selected
          ? 'border-signal bg-signal text-void'
          : 'border-observed/60 bg-hull/90 text-observed group-hover:border-observed',
      )
      const dot = document.createElement('span')
      dot.className = cn(
        'size-2.5 rotate-45 border',
        selected ? 'border-void bg-signal' : 'border-void bg-observed',
      )
      el.append(chip, dot)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        selectStop(selected ? null : stop.id)
      })
      // The diamond's centre sits on the stop's coordinates.
      markers.push(
        new Marker({ element: el, anchor: 'bottom', offset: [0, 13] })
          .setLngLat([stop.lon, stop.lat])
          .addTo(map),
      )
    }

    const habitat = engine.meta?.habitat
    if (habitat) {
      const el = document.createElement('div')
      el.title = `Habitat (${habitat.badge})${habitat.note ? `: ${habitat.note}` : ''}`
      el.className = 'flex flex-col items-center gap-1'
      const chip = document.createElement('span')
      chip.textContent = 'HAB'
      chip.className =
        'data-readout border border-scenario/70 bg-hull/90 px-1.5 py-0.5 text-[11px] font-medium leading-none text-scenario'
      const dot = document.createElement('span')
      dot.className = 'size-3 border-2 border-scenario bg-void'
      el.append(chip, dot)
      markers.push(
        new Marker({ element: el, anchor: 'bottom', offset: [0, 6] }).setLngLat(habitat.lonlat).addTo(map),
      )
    }

    return () => {
      for (const marker of markers) marker.remove()
    }
  }, [ready, engine.stops, engine.meta, selectedStopId, selectStop])

  return (
    <div className="absolute inset-0">
      {/* MapLibre's stylesheet makes this element position: relative, so it is sized, not inset. */}
      <div ref={containerRef} className="h-full w-full" aria-label="Map of the operations area" />
      {scale && (
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1">
          <span className="data-readout text-[10px] leading-none text-ink-dim">{scale.label}</span>
          <span
            className="block h-1.5 border-x border-b border-ink-dim"
            style={{ width: `${scale.px}px` }}
          />
        </div>
      )}
    </div>
  )
}
