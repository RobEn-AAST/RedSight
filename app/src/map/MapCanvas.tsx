import { useEffect, useRef, useState } from 'react'
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type StyleSpecification,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Feature, FeatureCollection } from 'geojson'

import '@/map/map.css'
import { cn } from '@/lib/cn'
import { absoluteDataUrl, markerSprite, type MapFigure } from '@/lib/dataUrl'
import type { EngineRouteMode, PlanMember } from '@/lib/engineDataContext'
import { useEngineData } from '@/lib/useEngineData'
import { curiosityLineCollection, curiosityWaypointCollection } from '@/map/curiosityPath'
import { HAZARD_COLOR, MEMBER_B_COLOR, UNKNOWN_GROUND_COLOR, MODE_COLOR, NO_RETURN_COLOR, formatDistance, hazardLabel } from '@/map/format'
import { usePlan } from '@/map/usePlan'

/**
 * The map of the operations area.
 *
 * Mars coordinates (planetocentric lon/lat, east-positive) are handed to
 * MapLibre as if they were Earth lon/lat. Near the equator Web Mercator barely
 * distorts, so shapes are right; MapLibre's own distance tools would be wrong
 * (they assume Earth's radius), so the scale bar uses the Mars radius from
 * meta.json's CRS string instead.
 */

// MapLibre looks for its worker file next to its own module, which a bundler
// moves. Hand it the bundled worker's real URL instead.
setWorkerUrl(workerUrl)

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }
const MODES: EngineRouteMode[] = ['fastest', 'safest']
const FIRST_VECTOR_LAYER = 'mask'
const SCALE_STEPS_M = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
// Views are padded clear of the legend strip at the top of the map.
const BOX_PADDING = { top: 56, bottom: 24, left: 24, right: 24 }
/** Routes fit into the map area left clear by the floating "Your walk" card and the plan sheet. */
const routePadding = () =>
  window.matchMedia('(min-width: 1024px)').matches
    ? { top: 96, bottom: 56, left: 448, right: 72 } // sheet docked left, 26rem + gap
    : { top: 210, bottom: Math.round(window.innerHeight * 0.5) + 16, left: 40, right: 56 } // card on top, half sheet

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

type Corners = [[number, number], [number, number], [number, number], [number, number]]

const corners = (b: Box): Corners => [
  [b.west, b.north],
  [b.east, b.north],
  [b.east, b.south],
  [b.west, b.south],
]

/** Everything outside the ops box, dimmed so the box reads as the work area. */
function maskPolygon(box: Box, outer: Box): Feature {
  const ring = (b: Box) => [...corners(b), corners(b)[0]]
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring(outer), ring(box).reverse()] },
  }
}

function boxLine(b: Box): Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [...corners(b), corners(b)[0]] },
  }
}

/** Each member's route, split into drive and walk legs so they can be styled apart. */
function legFeatures(members: PlanMember[], color: (i: number) => string): FeatureCollection {
  const features: Feature[] = []
  const first = members[0]
  members.forEach((m, i) => {
    for (const leg of m.legs) {
      const coords = m.coords.slice(leg.from, leg.to + 1)
      if (coords.length < 2) continue
      // A drive the pair shares is drawn once, in the first member's colour.
      const shared =
        i > 0 &&
        leg.kind === 'drive' &&
        first.legs.some((l) => l.kind === 'drive' && l.from === leg.from && l.to === leg.to) &&
        first.park_index === m.park_index
      if (shared) continue
      features.push({
        type: 'Feature',
        properties: { kind: leg.kind, color: color(i) },
        geometry: { type: 'LineString', coordinates: coords },
      })
    }
  })
  return { type: 'FeatureCollection', features }
}

function membersLine(members: PlanMember[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: members.map((m) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: m.coords },
    })),
  }
}

function boundsOf(points: [number, number][]): LngLatBoundsLike | null {
  if (points.length === 0) return null
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [lon, lat] of points) {
    w = Math.min(w, lon)
    e = Math.max(e, lon)
    s = Math.min(s, lat)
    n = Math.max(n, lat)
  }
  return [[w, s], [e, n]]
}

function marsRadiusM(crs: string | undefined): number | null {
  const match = crs?.match(/\+R=([\d.]+)/)
  return match ? Number(match[1]) : null
}

function moveDuration(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500
}

/** A map figure sprite; its ground point is the image centre, so the marker anchors at the centre. */
function figure(name: MapFigure, sizePx: number, alt: string): HTMLImageElement {
  const img = document.createElement('img')
  img.src = markerSprite(name).url
  img.alt = alt
  img.width = img.height = sizePx
  img.draggable = false
  img.className = 'pointer-events-none select-none'
  return img
}

function chip(text: string, className: string): HTMLSpanElement {
  const el = document.createElement('span')
  el.textContent = text
  el.className = cn(
    'data-readout whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-medium leading-none',
    className,
  )
  return el
}

export function MapCanvas({
  box,
  enabledLayers,
  showImagery,
}: {
  box: Box
  enabledLayers: Record<string, boolean>
  showImagery: boolean
}) {
  const engine = useEngineData()
  const plan = usePlan()
  const {
    selectedTargetId,
    selectTarget,
    mode,
    plans,
    activeMembers,
    crewMode,
    noReturnLine,
    showCuriosityPath,
    setMap,
  } = plan
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [ready, setReady] = useState(false)
  const [scale, setScale] = useState<{ px: number; label: string } | null>(null)
  const [hoveredWaypoint, setHoveredWaypoint] = useState<{
    sol: number
    rmc: string
    elevM: number | null
    distKm: number | null
  } | null>(null)
  // Hiding the path clears any hovered waypoint. Adjusted during render (not in an effect) so the
  // tooltip never flashes stale data: https://react.dev/learn/you-might-not-need-an-effect
  const waypointsShown = Boolean(engine.curiosityPath && showCuriosityPath)
  const [prevWaypointsShown, setPrevWaypointsShown] = useState(waypointsShown)
  if (prevWaypointsShown !== waypointsShown) {
    setPrevWaypointsShown(waypointsShown)
    if (!waypointsShown) setHoveredWaypoint(null)
  }

  const radiusM = marsRadiusM(engine.meta?.crs)
  const context = engine.preview?.context?.bounds ?? null
  const { west, east, south, north } = box

  // Create the map once per ops box.
  useEffect(() => {
    if (!containerRef.current) return
    const outer: Box = context ?? {
      west: west - (east - west),
      east: east + (east - west),
      south: south - (north - south),
      north: north + (north - south),
    }
    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE,
      bounds: [[west, south], [east, north]],
      fitBoundsOptions: { padding: BOX_PADDING },
      maxBounds: [[outer.west, outer.south], [outer.east, outer.north]],
      maxZoom: 18,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    // The container changes size with the layout (phone vs desktop, panel scroll):
    // keep the canvas matched to it, or MapLibre draws into a stale size.
    const resize = new ResizeObserver(() => map.resize())
    resize.observe(containerRef.current)

    map.on('load', () => {
      const opsBox: Box = { west, east, south, north }
      map.addSource('mask', { type: 'geojson', data: maskPolygon(opsBox, outer) })
      map.addSource('ops-box', { type: 'geojson', data: boxLine(opsBox) })
      map.addSource('hazards', { type: 'geojson', data: EMPTY })
      map.addSource('targets', { type: 'geojson', data: EMPTY })
      map.addSource('curiosity-path', { type: 'geojson', data: EMPTY })
      map.addSource('curiosity-waypoints', { type: 'geojson', data: EMPTY })
      map.addSource('no-return', { type: 'geojson', data: EMPTY })
      map.addSource('route-other', { type: 'geojson', data: EMPTY })
      map.addSource('route-legs', { type: 'geojson', data: EMPTY })

      map.addLayer({
        id: 'mask',
        type: 'fill',
        source: 'mask',
        paint: { 'fill-color': '#06080b', 'fill-opacity': 0.28 },
      })
      map.addLayer({
        id: 'ops-box',
        type: 'line',
        source: 'ops-box',
        paint: { 'line-color': '#e9edf3', 'line-width': 1, 'line-opacity': 0.25 },
      })
      // Blocked ground, coloured by reason: steep = violet, unknown ground (no elevation data,
      // map edge) = grey. A light tint, because real slope areas cover km² of the box.
      const hazardColor: ExpressionSpecification = [
        'match',
        ['get', 'reason'],
        ['nodata', 'edge'],
        UNKNOWN_GROUND_COLOR,
        HAZARD_COLOR,
      ]
      map.addLayer({
        id: 'hazards-fill',
        type: 'fill',
        source: 'hazards',
        paint: { 'fill-color': hazardColor, 'fill-opacity': 0.2 },
      })
      map.addLayer({
        id: 'hazards-line',
        type: 'line',
        source: 'hazards',
        paint: {
          'line-color': hazardColor,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 16, 1.2],
          'line-opacity': 0.6,
        },
      })
      // The engine ships thousands of blocked cells: their reason shows on tap, not as a label each.
      map.on('click', 'hazards-fill', (e) => {
        const p = e.features?.[0]?.properties
        if (!p) return
        const box = document.createElement('div')
        box.className = 'text-xs'
        const title = document.createElement('strong')
        title.textContent = hazardLabel(p.reason)
        const note = document.createElement('p')
        note.className = 'mt-0.5 text-ink-dim'
        note.textContent = String(p.label ?? '')
        box.append(title, note)
        new Popup({ closeButton: false, maxWidth: '240px', className: 'rs-popup' }).setLngLat(e.lngLat).setDOMContent(box).addTo(map)
      })
      map.on('mouseenter', 'hazards-fill', () => (map.getCanvas().style.cursor = 'help'))
      map.on('mouseleave', 'hazards-fill', () => (map.getCanvas().style.cursor = ''))
      map.addLayer({
        id: 'targets-fill',
        type: 'fill',
        source: 'targets',
        paint: {
          'fill-color': '#56d8f4',
          'fill-opacity': ['case', ['get', 'selected'], 0.32, 0.14],
        },
      })
      map.addLayer({
        id: 'targets-line',
        type: 'line',
        source: 'targets',
        paint: {
          'line-color': '#56d8f4',
          'line-width': ['case', ['get', 'selected'], 2.5, 1.2],
          'line-opacity': ['case', ['get', 'selected'], 1, 0.7],
        },
      })
      map.addLayer({
        id: 'curiosity-path-casing',
        type: 'line',
        source: 'curiosity-path',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#06080b', 'line-width': 4.5, 'line-opacity': 0.78 },
      })
      map.addLayer({
        id: 'curiosity-path-line',
        type: 'line',
        source: 'curiosity-path',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#56d8f4',
          'line-width': 2.2,
          'line-dasharray': [2.2, 1.8],
          'line-opacity': 0.92,
        },
      })
      map.addLayer({
        id: 'curiosity-waypoints',
        type: 'circle',
        source: 'curiosity-waypoints',
        minzoom: 12,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.6, 15, 3.4, 17, 4.5],
          'circle-color': '#56d8f4',
          'circle-stroke-color': '#06080b',
          'circle-stroke-width': 1,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 14, 0.9],
        },
      })
      map.addLayer({
        id: 'no-return',
        type: 'line',
        source: 'no-return',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': NO_RETURN_COLOR, 'line-width': 2.5, 'line-dasharray': [3, 2] },
      })
      map.addLayer({
        id: 'route-other',
        type: 'line',
        source: 'route-other',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#e9edf3',
          'line-width': 2,
          'line-opacity': 0.35,
          'line-dasharray': [1, 1.5],
        },
      })
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route-legs',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#06080b', 'line-width': 8, 'line-opacity': 0.8 },
      })
      map.addLayer({
        id: 'route-walk',
        type: 'line',
        source: 'route-legs',
        filter: ['==', ['get', 'kind'], 'walk'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 4 },
      })
      map.addLayer({
        id: 'route-drive',
        type: 'line',
        source: 'route-legs',
        filter: ['==', ['get', 'kind'], 'drive'],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [1.2, 0.9] },
      })
      mapRef.current = map
      setReady(true)
      setMap(map)
    })

    return () => {
      resize.disconnect()
      setMap(null)
      setReady(false)
      mapRef.current = null
      map.remove()
    }
  }, [west, east, south, north, context, setMap])

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

  // Imagery: the wide context picture, then the sharp ops-box picture, then real tiles.
  useEffect(() => {
    const map = mapRef.current
    const preview = engine.preview
    if (!ready || !map || !preview) return
    if (preview.context && !map.getSource('context')) {
      map.addSource('context', {
        type: 'image',
        url: preview.context.url,
        coordinates: corners(preview.context.bounds),
      })
      map.addLayer(
        {
          id: 'context',
          type: 'raster',
          source: 'context',
          paint: { 'raster-fade-duration': 0 },
        },
        FIRST_VECTOR_LAYER,
      )
    }
    if (!map.getSource('preview')) {
      map.addSource('preview', { type: 'image', url: preview.url, coordinates: corners(preview.bounds) })
      map.addLayer(
        { id: 'preview', type: 'raster', source: 'preview', paint: { 'raster-fade-duration': 0 } },
        FIRST_VECTOR_LAYER,
      )
    }
    for (const id of ['context', 'preview']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showImagery ? 'visible' : 'none')
    }
  }, [ready, engine.preview, showImagery])

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

  // Blocked ground, target areas, the no-return line.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource<GeoJSONSource>('hazards')?.setData((engine.hazards ?? EMPTY) as FeatureCollection)
    map.getSource<GeoJSONSource>('targets')?.setData({
      type: 'FeatureCollection',
      features: plan.goalTargets.map((t) => ({
        type: 'Feature',
        properties: { id: t.id, selected: t.id === selectedTargetId },
        geometry: { type: 'Polygon', coordinates: [t.ring] },
      })),
    })
    map.getSource<GeoJSONSource>('no-return')?.setData(noReturnLine ?? EMPTY)
  }, [ready, engine.hazards, plan.goalTargets, selectedTargetId, noReturnLine])

  // Curiosity's Observed MMGIS traverse overlay and hover waypoint telemetry.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const path = engine.curiosityPath
    map.getSource<GeoJSONSource>('curiosity-path')?.setData(path ? curiosityLineCollection(path) : EMPTY)
    map.getSource<GeoJSONSource>('curiosity-waypoints')?.setData(path ? curiosityWaypointCollection(path) : EMPTY)
    const vis = path && showCuriosityPath ? 'visible' : 'none'
    for (const id of ['curiosity-path-casing', 'curiosity-path-line', 'curiosity-waypoints']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    }
  }, [ready, engine.curiosityPath, showCuriosityPath])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const onMove = (e: { features?: { properties?: Record<string, unknown> }[] }) => {
      const props = e.features?.[0]?.properties
      if (!props) return
      map.getCanvas().style.cursor = 'pointer'
      const sol = typeof props.sol === 'number' ? props.sol : Number(props.sol)
      if (!Number.isFinite(sol)) return
      const elevRaw = props.elev_m
      const distRaw = props.dist_km
      setHoveredWaypoint({
        sol,
        rmc: typeof props.rmc === 'string' ? props.rmc : `${sol}`,
        elevM: typeof elevRaw === 'number' && Number.isFinite(elevRaw) ? elevRaw : null,
        distKm: typeof distRaw === 'number' && Number.isFinite(distRaw) ? distRaw : null,
      })
    }
    const onLeave = () => {
      map.getCanvas().style.cursor = ''
      setHoveredWaypoint(null)
    }
    map.on('mousemove', 'curiosity-waypoints', onMove)
    map.on('mouseleave', 'curiosity-waypoints', onLeave)
    return () => {
      map.off('mousemove', 'curiosity-waypoints', onMove)
      map.off('mouseleave', 'curiosity-waypoints', onLeave)
    }
  }, [ready])

  // Routes: the chosen route by member and leg, the other mode as a faint guide.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const color = (i: number) => (crewMode === 'split' && i === 1 ? MEMBER_B_COLOR : MODE_COLOR[mode])
    map.getSource<GeoJSONSource>('route-legs')?.setData(legFeatures(activeMembers, color))
    const other = MODES.find((m) => m !== mode)!
    map
      .getSource<GeoJSONSource>('route-other')
      ?.setData(plans[other] ? membersLine(plans[other].together) : EMPTY)
  }, [ready, activeMembers, plans, mode, crewMode])

  // Frame the selected target's routes, or the ops box before anything is loaded.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const points = activeMembers.flatMap((m) => m.coords)
    const target = plan.goalTargets.find((t) => t.id === selectedTargetId)
    if (target) points.push(...target.ring)
    const bounds = boundsOf(points)
    if (bounds) map.fitBounds(bounds, { padding: routePadding(), maxZoom: 16.5, duration: moveDuration() })
    else map.fitBounds([[west, south], [east, north]], { padding: BOX_PADDING, duration: moveDuration() })
  }, [ready, activeMembers, selectedTargetId, plan.goalTargets, west, east, south, north])

  // Markers: habitat, target labels, rover park points, no-return points, A/B ends.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const markers: Marker[] = []
    const add = (el: HTMLElement, at: [number, number]) =>
      markers.push(new Marker({ element: el }).setLngLat(at).addTo(map))

    for (const t of plan.goalTargets) {
      const selected = t.id === selectedTargetId
      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute('aria-label', `Target ${t.id}: ${t.name}`)
      el.setAttribute('aria-pressed', String(selected))
      el.className = 'cursor-pointer p-2'
      el.append(
        chip(
          selected ? `${t.id} · ${t.name}` : t.id,
          selected ? 'border-observed bg-observed text-void' : 'border-observed/70 bg-hull/90 text-observed',
        ),
      )
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        selectTarget(t.id)
      })
      add(el, t.site)
    }

    const habitat = engine.meta?.habitat
    if (habitat) {
      const el = document.createElement('div')
      el.title = `Habitat (${habitat.badge})`
      el.className = 'relative'
      const label = chip('HAB', 'border-scenario/70 bg-hull/90 text-scenario')
      label.classList.add('absolute', 'bottom-full', 'left-1/2', '-translate-x-1/2')
      el.append(figure('habitat', 72, 'Habitat'), label)
      markers.push(new Marker({ element: el, anchor: 'center' }).setLngLat(habitat.lonlat).addTo(map))
    }

    activeMembers.forEach((m, i) => {
      if (m.park_index !== null && m.coords[m.park_index]) {
        const el = document.createElement('div')
        // The rover itself is drawn by the replay (it drives with the crew and waits here).
        el.title = 'Rover parks here; walk from here'
        el.append(chip('P', 'border-ink bg-ink text-void'))
        // Beside the point, not on it, so the parked rover stays visible.
        markers.push(
          new Marker({ element: el, anchor: 'bottom-left', offset: [14, -14] }).setLngLat(m.coords[m.park_index]).addTo(map),
        )
      }
      // The turn-back marker is drawn by the turn-back slider (it moves with the O₂ budget).
      const last = m.coords.length - 1
      if (crewMode === 'split') {
        const el = document.createElement('div')
        el.append(
          chip(i === 0 ? 'A' : 'B', i === 0 ? 'border-void bg-signal text-void' : 'border-void bg-ink text-void'),
        )
        markers.push(
          new Marker({ element: el, anchor: 'top', offset: [0, 12] }).setLngLat(m.coords[last]).addTo(map),
        )
      }
    })

    return () => {
      for (const marker of markers) marker.remove()
    }
  }, [ready, engine.meta, plan.goalTargets, selectedTargetId, selectTarget, activeMembers, crewMode])

  const hasDrive = activeMembers.some((m) => m.legs.some((l) => l.kind === 'drive'))
  const hazardReasons = {
    steep: engine.hazards?.features.some((f) => !['nodata', 'edge'].includes(String(f.properties?.reason))) ?? false,
    unknown: engine.hazards?.features.some((f) => ['nodata', 'edge'].includes(String(f.properties?.reason))) ?? false,
  }

  return (
    <div className="absolute inset-0">
      {/* MapLibre's stylesheet makes this element position: relative, so it is sized, not inset. */}
      <div ref={containerRef} className="h-full w-full" aria-label="Map of the operations area" />

      {/* Legend: only what is on the map right now. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-gradient-to-b from-void/90 to-void/0 px-3 pb-5 pt-2.5 text-[11px] text-ink">
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-5" style={{ backgroundColor: MODE_COLOR[mode] }} /> Walk
        </span>
        {hasDrive && (
          <span className="flex items-center gap-1.5">
            <span
              className="h-[3px] w-5"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, ${MODE_COLOR[mode]} 0 5px, transparent 5px 9px)`,
              }}
            />
            Drive
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="size-3 border border-observed bg-observed/30" /> Sample area
        </span>
        {hazardReasons.steep && (
          <span className="flex items-center gap-1.5">
            <span className="size-3 border border-hazard bg-hazard/30" /> Too steep
          </span>
        )}
        {hazardReasons.unknown && (
          <span className="flex items-center gap-1.5">
            <span className="size-3 border" style={{ borderColor: UNKNOWN_GROUND_COLOR, backgroundColor: `${UNKNOWN_GROUND_COLOR}4d` }} />{' '}
            No elevation data
          </span>
        )}
        {noReturnLine && (
          <span className="flex items-center gap-1.5">
            <span
              className="h-[3px] w-5"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, ${NO_RETURN_COLOR} 0 6px, transparent 6px 10px)`,
              }}
            />
            No-return line
          </span>
        )}
        {showCuriosityPath && engine.curiosityPath && (
          <span className="flex items-center gap-1.5">
            <span
              className="h-[2px] w-5"
              style={{
                backgroundImage: 'repeating-linear-gradient(90deg, #56d8f4 0 4px, transparent 4px 7px)',
              }}
            />
            Curiosity path (Observed)
          </span>
        )}
      </div>

      {hoveredWaypoint && showCuriosityPath && (
        <div className="data-readout pointer-events-none absolute right-3 top-10 border border-observed/60 bg-hull/95 px-2.5 py-1.5 text-[11px] text-ink shadow-sm">
          <span className="text-observed">Curiosity · Sol {hoveredWaypoint.sol}</span>{' '}
          <span className="text-ink-dim">· RMC {hoveredWaypoint.rmc}</span>
          {hoveredWaypoint.elevM != null && (
            <span className="text-ink-dim"> · {hoveredWaypoint.elevM.toFixed(1)} m</span>
          )}
          {hoveredWaypoint.distKm != null && (
            <span className="text-ink-dim"> · {hoveredWaypoint.distKm.toFixed(2)} km odom</span>
          )}
          <span className="ml-1.5 text-observed">· Observed</span>
        </div>
      )}

      {scale && (
        <div className="pointer-events-none absolute bottom-[104px] left-3 flex flex-col gap-1 lg:bottom-3 lg:left-[calc(26rem+1.5rem)]">
          <span className="data-readout text-[10px] leading-none text-ink">{scale.label}</span>
          <span className="block h-1.5 border-x border-b border-ink" style={{ width: `${scale.px}px` }} />
        </div>
      )}
    </div>
  )
}
