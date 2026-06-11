// Room layout for the ship's 2D side cutaway. Coordinates are voxel/model
// space (x stern→bow, z up from the waterline), inclusive; rendering clips
// every room to the hull silhouette, so the bow taper and cabin set-backs
// shape the walls automatically. Adjacent rooms on a deck are separated by a
// single voxel of structure — the thin divider wall read. Crew/furniture come
// in a later phase via the `props` hook.

import type { AgentKey } from "@/lib/domain"
import { DECKS } from "../voxel/ferry-model"

export type RoomId =
  | "bridge"
  | "chart_room"
  | "review_lounge"
  | "mess_hall"
  | "crew_quarters"
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
  /** CSS var of the lead agent's hue; omitted = neutral indigo accent. */
  accentVar?: string
  props?: PropPlacement[]
}

/**
 * Eight rooms over the ferry's real decks (extents come from DECKS in
 * voxel/ferry-model.ts): wheelhouse, tier-2 chart room, three tier-1 rooms
 * (lounge + unmanned flavor rooms), and three hull rooms under the main deck.
 * Interiors sit one voxel inside each cabin band so a structural floor/
 * ceiling line separates the decks.
 */
export const ROOMS: RoomDef[] = [
  {
    id: "bridge",
    label: "BRIDGE",
    agents: ["commander", "github_connector"],
    x0: DECKS.wheel.x0 + 1,
    x1: DECKS.wheel.x1 - 1,
    z0: DECKS.wheel.z0 + 1,
    z1: DECKS.wheel.z1 - 1,
    accentVar: "--agent-commander",
  },
  {
    id: "chart_room",
    label: "CHART ROOM",
    agents: ["router", "source_analyzer"],
    x0: DECKS.tier2.x0 + 1,
    x1: DECKS.tier2.x1 - 1,
    z0: DECKS.tier2.z0 + 1,
    z1: DECKS.tier2.z1 - 1,
    accentVar: "--agent-router",
  },
  {
    id: "review_lounge",
    label: "REVIEW LOUNGE",
    agents: ["reviewer"],
    x0: DECKS.tier1.x0 + 1,
    x1: 44,
    z0: DECKS.tier1.z0 + 1,
    z1: DECKS.tier1.z1 - 1,
    accentVar: "--agent-review",
  },
  {
    id: "mess_hall",
    label: "MESS HALL",
    agents: [],
    x0: 46,
    x1: 66,
    z0: DECKS.tier1.z0 + 1,
    z1: DECKS.tier1.z1 - 1,
  },
  {
    id: "crew_quarters",
    label: "CREW QUARTERS",
    agents: [],
    x0: 68,
    x1: DECKS.tier1.x1 - 1,
    z0: DECKS.tier1.z0 + 1,
    z1: DECKS.tier1.z1 - 1,
  },
  {
    id: "engine_room",
    label: "ENGINE ROOM",
    agents: ["db_migration"],
    x0: 6,
    x1: 34,
    z0: 3,
    z1: 14,
    accentVar: "--agent-dbmig",
  },
  {
    id: "workshop",
    label: "WORKSHOP",
    agents: ["code_generator", "business_logic"],
    x0: 36,
    x1: 72,
    z0: 3,
    z1: 14,
    accentVar: "--agent-codegen",
  },
  {
    id: "test_bay",
    label: "TEST BAY",
    agents: ["test_generator"],
    x0: 74,
    x1: 106,
    z0: 3,
    z1: 14,
    accentVar: "--agent-test",
  },
]

/** Future roster→cutaway focus hook. */
export function roomsForAgent(agent: AgentKey): RoomDef[] {
  return ROOMS.filter((room) => room.agents.includes(agent))
}
