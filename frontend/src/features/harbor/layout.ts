import type { AgentKey } from "@/lib/domain"
import { isoToScreen, type Pt } from "./iso"

export type FacilityKind =
  | "gateway"
  | "inspection"
  | "customs"
  | "shipyard"
  | "terminal"
  | "quality"
  | "audit"
  | "harbormaster"
  | "tower"

export interface FacilityDef {
  key: AgentKey
  kind: FacilityKind
  title: string
  gx: number
  gy: number
  height: number
  footprint: number
  hasCrane?: boolean
}

export const FACILITIES: FacilityDef[] = [
  { key: "github_connector", kind: "gateway", title: "Port Gateway", gx: 0, gy: 2, height: 38, footprint: 1, hasCrane: true },
  { key: "source_analyzer", kind: "inspection", title: "Inspection Dock", gx: 1, gy: 2, height: 26, footprint: 1 },
  { key: "business_logic", kind: "customs", title: "Customs Office", gx: 2, gy: 2, height: 34, footprint: 1 },
  { key: "code_generator", kind: "shipyard", title: "Shipyard", gx: 3, gy: 2, height: 30, footprint: 1, hasCrane: true },
  { key: "db_migration", kind: "terminal", title: "Conversion Terminal", gx: 4, gy: 2, height: 28, footprint: 1 },
  { key: "test_generator", kind: "quality", title: "Quality Inspection", gx: 5, gy: 2, height: 30, footprint: 1 },
  { key: "reviewer", kind: "audit", title: "Audit Office", gx: 6, gy: 2, height: 34, footprint: 1 },
  { key: "commander", kind: "harbormaster", title: "Harbor Master", gx: 7, gy: 2, height: 46, footprint: 1 },
  { key: "router", kind: "tower", title: "Control Tower", gx: 2.5, gy: -0.4, height: 72, footprint: 0.82 },
]

export const FACILITY_BY_KEY = Object.fromEntries(
  FACILITIES.map((f) => [f.key, f]),
) as Record<AgentKey, FacilityDef>

export function facilityAnchor(f: FacilityDef): Pt {
  return isoToScreen(f.gx, f.gy)
}

export const ANCHORS = Object.fromEntries(
  FACILITIES.map((f) => [f.key, facilityAnchor(f)]),
) as Record<AgentKey, Pt>

export const CARGO_LANE: AgentKey[] = [
  "github_connector",
  "source_analyzer",
  "business_logic",
  "code_generator",
  "db_migration",
  "test_generator",
  "reviewer",
  "commander",
]

export interface LaneSegment {
  from: AgentKey
  to: AgentKey
  a: Pt
  b: Pt
}

export const LANE_SEGMENTS: LaneSegment[] = CARGO_LANE.slice(0, -1).map(
  (from, i) => {
    const to = CARGO_LANE[i + 1]
    return { from, to, a: ANCHORS[from], b: ANCHORS[to] }
  },
)

const HARBOR_MASTER = ANCHORS.commander

export const ISLAND = { gx0: -2.4, gy0: -1.7, gx1: 9.2, gy1: 4.3 }
export const ISLAND_DEPTH = 54

// Quay landmass (tan) the facilities stand on.
export const QUAY = { gx0: -1, gy0: 0.85, gx1: 8, gy1: 3.5, h: 13 }
// Offshore pad for the control tower.
export const TOWER_PAD = { gx0: 1.5, gy0: -1.15, gx1: 3.5, gy1: 0.3, h: 15 }

export const FERRY_AT: Pt = isoToScreen(0.4, -0.05)
export const BARGE_AT: Pt = isoToScreen(5.6, -0.55)
export const TUG_ATS: Pt[] = [isoToScreen(-1.5, 1.9), isoToScreen(3.4, -1.3)]
export const DEPARTURE_POINT: Pt = { x: HARBOR_MASTER.x + 250, y: HARBOR_MASTER.y + 110 }

export interface SceneBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  w: number
  h: number
}

export function sceneBounds(): SceneBounds {
  const corners = [
    isoToScreen(ISLAND.gx0, ISLAND.gy0),
    isoToScreen(ISLAND.gx1, ISLAND.gy0),
    isoToScreen(ISLAND.gx1, ISLAND.gy1),
    isoToScreen(ISLAND.gx0, ISLAND.gy1),
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of corners) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }

  // Tower rises above the top edge; the slab adds depth below.
  minY -= 80
  maxY += ISLAND_DEPTH

  const pad = 28
  minX -= pad
  maxX += pad
  minY -= pad
  maxY += pad

  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}
