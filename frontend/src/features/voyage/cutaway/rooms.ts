// Room layout for the ship's 2D side cutaway. Coordinates are voxel/model
// space (x stern→bow, z up from the waterline), inclusive; rendering clips
// every room to the hull silhouette, so the bow taper and cabin set-backs
// shape the walls automatically. Crew/furniture come in a later phase via
// the `props` hook.

import type { AgentKey } from "@/lib/domain"

export type RoomId =
  | "bridge"
  | "chart_room"
  | "review_lounge"
  | "engine_room"
  | "workshop"
  | "test_bay"

export interface PropPlacement {
  kind: string
  /** Model space, relative to the room's x0/z0. */
  x: number
  z: number
}

export interface RoomDef {
  id: RoomId
  /** Pixel-font caption. */
  label: string
  /** Crew stationed here, lead agent first (its hue accents the room). */
  agents: AgentKey[]
  x0: number
  x1: number
  z0: number
  z1: number
  /** CSS var of the lead agent's hue. */
  accentVar: string
  props?: PropPlacement[]
}

/**
 * Six rooms over the ferry's real structure (see voxel/ferry-model.ts):
 * hull interior z1–4 under the deck at z5, tier-1 cabin x5–28 z6–10 (left as
 * an unlabeled promenade this phase), tier-2 cabin x8–24 z12–15 with the
 * funnel over its aft half, wheelhouse x17–24 z17–19.
 */
export const ROOMS: RoomDef[] = [
  {
    id: "bridge",
    label: "BRIDGE",
    agents: ["commander", "github_connector"],
    x0: 17,
    x1: 24,
    z0: 17,
    z1: 19,
    accentVar: "--agent-commander",
  },
  {
    id: "chart_room",
    label: "CHART ROOM",
    agents: ["router", "source_analyzer"],
    x0: 16,
    x1: 24,
    z0: 12,
    z1: 15,
    accentVar: "--agent-router",
  },
  {
    id: "review_lounge",
    label: "REVIEW LOUNGE",
    agents: ["reviewer"],
    x0: 8,
    x1: 15,
    z0: 12,
    z1: 15,
    accentVar: "--agent-review",
  },
  {
    id: "engine_room",
    label: "ENGINE ROOM",
    agents: ["db_migration"],
    x0: 2,
    x1: 12,
    z0: 1,
    z1: 4,
    accentVar: "--agent-dbmig",
  },
  {
    id: "workshop",
    label: "WORKSHOP",
    agents: ["code_generator", "business_logic"],
    x0: 13,
    x1: 24,
    z0: 1,
    z1: 4,
    accentVar: "--agent-codegen",
  },
  {
    id: "test_bay",
    label: "TEST BAY",
    agents: ["test_generator"],
    x0: 25,
    x1: 36,
    z0: 1,
    z1: 4,
    accentVar: "--agent-test",
  },
]

/** Future roster→cutaway focus hook. */
export function roomsForAgent(agent: AgentKey): RoomDef[] {
  return ROOMS.filter((room) => room.agents.includes(agent))
}
