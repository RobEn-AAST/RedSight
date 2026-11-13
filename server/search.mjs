/**
 * Mission-knowledge search tool — read-only retrieval over the app's own data
 * contract (app/public/data, plan §15) plus the evidence-label taxonomy.
 *
 * This is the copilot's ONE wired tool (voice-copilot-plan §7 rules: results
 * only from engine files; never synthesize coordinates). It executes
 * server-side: the LLM proposes a query, we run it, results go back as tool
 * output. The model may quote these records; it may not invent siblings.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/public/data')

/** Flat searchable records: { name, kind, text, value?, unit?, badge?, source? } */
const records = []

function push(rec) {
  if (rec && rec.name) records.push(rec)
}

function fmtValue(v) {
  if (v == null) return undefined
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

function indexConstants() {
  try {
    const c = JSON.parse(readFileSync(path.join(dataDir, 'constants.json'), 'utf8'))
    for (const [key, entry] of Object.entries(c)) {
      if (key.startsWith('_') || typeof entry !== 'object' || entry === null) continue
      push({
        name: `${key}${entry.unit ? ` (${entry.unit})` : ''}`,
        kind: 'model constant',
        text: `${key} ${entry.source ?? ''}`,
        value: fmtValue(entry.value),
        unit: entry.unit,
        badge: entry.badge,
        source: entry.source,
      })
    }
  } catch { /* file absent — honest empty index */ }
}

function indexCards() {
  const cardsDir = path.join(dataDir, 'cards')
  if (!existsSync(cardsDir)) return
  for (const f of readdirSync(cardsDir)) {
    if (!f.endsWith('.json')) continue
    try {
      const card = JSON.parse(readFileSync(path.join(cardsDir, f), 'utf8'))
      const head = `Provenance card: ${card.title ?? f} (${card.badge ?? '—'})`
      const lines = Array.isArray(card.values)
        ? card.values.map((v) => `${v.label}: ${fmtValue(v.value)}${v.unit ? ' ' + v.unit : ''}`)
        : []
      push({
        name: card.title ?? f,
        kind: 'provenance card',
        text: `${head} ${lines.join('; ')} ${card.source ?? ''}`,
        badge: card.badge,
        source: card.source,
      })
      if (lines.length) {
        for (const v of card.values ?? []) {
          push({
            name: `${v.label} — ${card.title ?? f}`,
            kind: 'provenance card value',
            text: `${v.label} ${fmtValue(v.value)} ${v.unit ?? ''} ${card.title ?? ''}`,
            value: fmtValue(v.value),
            unit: v.unit,
            badge: v.badge ?? card.badge,
            source: card.source,
          })
        }
      }
    } catch { /* skip unreadable card */ }
  }
}

function indexStops() {
  try {
    const s = JSON.parse(readFileSync(path.join(dataDir, 'stops.json'), 'utf8'))
    for (const f of s.features ?? []) {
      const p = f.properties ?? {}
      push({
        name: `Stop ${p.id ?? p.name ?? '?'}${p.name && p.id ? ` — ${p.name}` : ''}`,
        kind: 'route stop',
        text: `${p.id ?? ''} ${p.name ?? ''} ${p.note ?? p.description ?? ''} ${p.goal ?? ''}`,
        badge: p.badge,
        source: s.source,
        note: p.note ?? p.description,
      })
    }
  } catch { /* absent — fine */ }
}

function indexLayers() {
  try {
    const l = JSON.parse(readFileSync(path.join(dataDir, 'layers.json'), 'utf8'))
    for (const layer of l.layers ?? []) {
      if (layer.available === false) {
        push({
          name: `${layer.name} layer — UNAVAILABLE`,
          kind: 'map layer',
          text: `${layer.id} ${layer.name} unavailable ${layer.note ?? ''}`,
          badge: 'Unavailable',
        })
        continue
      }
      push({
        name: `${layer.name} layer`,
        kind: 'map layer',
        text: `${layer.id} ${layer.name} ${layer.note ?? ''}`,
        badge: layer.badge,
        source: layer.source,
      })
    }
  } catch { /* absent — fine */ }
}

function indexMeta() {
  try {
    const m = JSON.parse(readFileSync(path.join(dataDir, 'meta.json'), 'utf8'))
    const b = m.ops_box
    if (b) {
      push({
        name: 'Operations box (study area)',
        kind: 'site definition',
        text: `ops box Gale crater lon ${b.west}–${b.eest ?? b.east}E lat ${b.south}–${b.north}`,
        value: `${b.west}–${b.east}°E, ${b.south}–${b.north}°`,
        badge: 'Team choice',
        source: 'demo-focus-plan §6 (D11)',
      })
    }
    const h = m.habitat
    if (h) {
      push({
        name: 'Habitat position',
        kind: 'site definition',
        text: `habitat ${h.lonlat?.[0]} ${h.lonlat?.[1]} ${h.note ?? ''}`,
        value: h.lonlat ? `${h.lonlat[0]}°E, ${h.lonlat[1]}°` : undefined,
        badge: h.badge,
        note: h.note,
      })
    }
  } catch { /* absent — fine */ }
}

/** Static team knowledge the copilot must explain correctly (labels, limits). */
function indexTaxonomy() {
  const labels = [
    ['Observed', 'measured by an instrument or mission (e.g., RAD dose rate, REMS weather)'],
    ['Derived', 'computed from observed data (e.g., slopes from the 1 m DEM, route costs)'],
    ['Scenario', 'a team assumption or modeled estimate (e.g., O2 reserve fraction, load defaults)'],
    ['Unavailable', 'no public data exists at this scale; RedSight shows the gap, never a fake'],
  ]
  for (const [name, text] of labels) {
    push({ name: `Evidence label: ${name}`, kind: 'taxonomy', text: `label ${name} ${text}` })
  }
  push({
    name: 'Mission parameter limits (team model, plan §8)',
    kind: 'taxonomy',
    text: 'crew 1-2, body mass 43-110 kg, load 0-40 kg per astronaut in buckets 5/15/30, samples 0-10 kg per stop',
    badge: 'Scenario',
  })
}

export function buildIndex() {
  records.length = 0
  indexConstants()
  indexCards()
  indexStops()
  indexLayers()
  indexMeta()
  indexTaxonomy()
  return records.length
}

buildIndex()

const STOPWORDS = new Set(
  'the a an of in on at to for and or is are what how why when where does do did this that it its with from about tell show me you your i we'.split(' '),
)

function tokenize(q) {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9°.\-\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/**
 * Score = weighted term frequency across name/text. Exact key match wins.
 * Returns the top records, ready to embed as tool output (badges included).
 */
export function searchMissionKnowledge(query, limit = 5) {
  const terms = tokenize(query)
  if (terms.length === 0) return []
  const scored = []
  for (const r of records) {
    const name = r.name.toLowerCase()
    const text = (r.text ?? '').toLowerCase()
    let score = 0
    for (const t of terms) {
      if (name === t || name.replace(/[^a-z0-9]/g, '') === t) score += 12
      if (name.includes(t)) score += 6
      const hits = text.split(t).length - 1
      score += Math.min(hits, 3) * 2
    }
    if (score > 0) scored.push({ r, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(({ r }) => ({
    name: r.name,
    kind: r.kind,
    ...(r.value !== undefined && { value: r.value }),
    ...(r.unit && { unit: r.unit }),
    ...(r.badge && { badge: r.badge }),
    ...(r.source && { source: r.source }),
    ...(r.note && { note: r.note }),
  }))
}

/** OpenAI/Gemini-compatible function schema for the tool. */
export const searchToolSchema = {
  name: 'search_mission_knowledge',
  description:
    'Search the RedSight mission console data: model constants, provenance cards (RAD, REMS), route stops, map layers, site definitions, and evidence-label definitions. Use for ANY question about numbers, data, stops, layers, or labels in this console. Returns records with values, units, evidence badges (Observed/Derived/Scenario), and sources. If nothing matches, returns an empty list — say so; never invent records.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search terms, e.g. "o2 reserve fraction", "RAD dose", "boxwork stop", "slope limit"',
      },
    },
    required: ['query'],
  },
}
