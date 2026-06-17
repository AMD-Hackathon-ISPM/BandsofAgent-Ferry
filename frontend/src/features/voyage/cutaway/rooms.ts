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
  /** Sprite key in interior-art.ts SPRITES. */
  kind: string
  /** Cells from the room's screen-left (bow-side) edge. */
  x: number
  /**
   * Cells above the room's z0 where the sprite's bottom rests: the floor
   * surface is 2 (1 in shallow rooms like the bridge); larger values mount
   * the sprite on the wall or stack it on furniture.
   */
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
    props: [
      { kind: "bridgescreens", x: 1.5, z: 3.9 },
      { kind: "console", x: 1.5, z: 1 },
      { kind: "throttle", x: 9.2, z: 1 },
      { kind: "wheel", x: 11.8, z: 1 },
      { kind: "captainchair", x: 15, z: 1 },
      { kind: "radarscope", x: 17.8, z: 1 },
      { kind: "switchpanel", x: 15.5, z: 5.1 },
    ],
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
    props: [
      { kind: "chartwall", x: 4, z: 4.5 },
      { kind: "wallclock", x: 21.5, z: 6 },
      { kind: "maptable", x: 13, z: 2 },
      { kind: "desk", x: 24, z: 2 },
      { kind: "bookshelf", x: 32, z: 2 },
      { kind: "globe", x: 38, z: 2 },
      { kind: "plant", x: 42, z: 2 },
    ],
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
    props: [
      { kind: "rug", x: 12, z: 2 },
      { kind: "bookshelf", x: 1.5, z: 2 },
      { kind: "sofa", x: 7.5, z: 2 },
      { kind: "coffeetable", x: 15.5, z: 2 },
      { kind: "armchair", x: 20, z: 2 },
      { kind: "floorlamp", x: 24, z: 2 },
      { kind: "plant", x: 26.5, z: 2 },
      { kind: "picture", x: 12.5, z: 7.5 },
    ],
  },
  {
    id: "mess_hall",
    label: "MESS HALL",
    agents: [],
    x0: 46,
    x1: 66,
    z0: DECKS.tier1.z0 + 1,
    z1: DECKS.tier1.z1 - 1,
    props: [
      { kind: "shelfbottles", x: 1.5, z: 7.5 },
      { kind: "counter", x: 1, z: 2 },
      { kind: "diningset", x: 8, z: 2 },
      { kind: "vending", x: 16.5, z: 2 },
      { kind: "menuboard", x: 9.5, z: 8 },
      { kind: "extinguisher", x: 15, z: 4 },
    ],
  },
  {
    id: "crew_quarters",
    label: "CREW QUARTERS",
    agents: [],
    x0: 68,
    x1: DECKS.tier1.x1 - 1,
    z0: DECKS.tier1.z0 + 1,
    z1: DECKS.tier1.z1 - 1,
    props: [
      { kind: "bunk", x: 1, z: 2 },
      { kind: "locker", x: 8.5, z: 2 },
      { kind: "bunk", x: 11.5, z: 2 },
    ],
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
    props: [
      { kind: "pipesrun", x: 3, z: 8.5 },
      { kind: "pipesrun", x: 14, z: 8.5 },
      { kind: "engine", x: 3, z: 2 },
      { kind: "gaugewall", x: 16, z: 5.5 },
      { kind: "ventduct", x: 24, z: 8.5 },
      { kind: "tank", x: 20.5, z: 2 },
      { kind: "barrel", x: 24.5, z: 2 },
      { kind: "barrel", x: 26.8, z: 2 },
      { kind: "extinguisher", x: 16.5, z: 2 },
    ],
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
    props: [
      { kind: "toolwall", x: 3.5, z: 6 },
      { kind: "workbench", x: 2, z: 2 },
      { kind: "lathe", x: 13, z: 2 },
      { kind: "cratestack", x: 19.5, z: 2 },
      { kind: "crate", x: 25.5, z: 2 },
      { kind: "barrel", x: 29.5, z: 2 },
      { kind: "gaugewall", x: 25, z: 6.5 },
      { kind: "ventduct", x: 31, z: 8.5 },
      { kind: "extinguisher", x: 33.5, z: 2 },
    ],
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
    props: [
      { kind: "monitorwall", x: 4, z: 2 },
      { kind: "testpod", x: 13.5, z: 2 },
      { kind: "serverrack", x: 20, z: 2 },
      { kind: "ventduct", x: 14, z: 8.5 },
      { kind: "crate", x: 25, z: 2 },
      { kind: "barrel", x: 29, z: 2 },
    ],
  },
]

/** Future roster→cutaway focus hook. */
export function roomsForAgent(agent: AgentKey): RoomDef[] {
  return ROOMS.filter((room) => room.agents.includes(agent))
}
