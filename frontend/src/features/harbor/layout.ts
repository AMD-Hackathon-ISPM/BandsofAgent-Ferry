import type { AgentKey } from "@/lib/domain"
import { HH, HW, isoToScreen, type Pt } from "./iso"

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

const GATEWAY = ANCHORS.github_connector
const HARBOR_MASTER = ANCHORS.commander

export const ARRIVAL_POINT: Pt = { x: GATEWAY.x - 210, y: GATEWAY.y - 70 }
export const DEPARTURE_POINT: Pt = { x: HARBOR_MASTER.x + 230, y: HARBOR_MASTER.y + 96 }

export interface SceneBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  w: number
  h: number
}

export function sceneBounds(): SceneBounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const f of FACILITIES) {
    const a = facilityAnchor(f)
    minX = Math.min(minX, a.x - HW * f.footprint)
    maxX = Math.max(maxX, a.x + HW * f.footprint)
    minY = Math.min(minY, a.y - HH - f.height)
    maxY = Math.max(maxY, a.y + HH)
  }

  for (const p of [ARRIVAL_POINT, DEPARTURE_POINT]) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }

  const padX = 120
  const padTop = 90
  const padBottom = 120
  minX -= padX
  maxX += padX
  minY -= padTop
  maxY += padBottom

  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}
