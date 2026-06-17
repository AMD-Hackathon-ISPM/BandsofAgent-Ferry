// Roleplay crew layer over the nine system agents. Each agent keeps its real
// AgentKey, name, role and description (see @/lib/domain AGENTS) for the
// system; this map only adds a fun nautical persona for the ship cutaway and
// the crew-roster side panel. The roleplay title is chosen to mirror the
// agent's actual job (Commander → Captain, Router → Navigator, DB Migration →
// Chief Engineer, …), so the flavor never hides what the agent does.

import { AGENT_ORDER, type AgentKey } from "@/lib/domain"
import { ROOMS, type RoomId } from "./cutaway/rooms"

export interface CrewMeta {
  agent: AgentKey
  /** Roleplay name shown on the character and in the roster. */
  name: string
  /** Roleplay crew title (mirrors the agent's real job). */
  title: string
}

export const CREW: Record<AgentKey, CrewMeta> = {
  commander: { agent: "commander", name: "Captain Ray", title: "Captain" },
  router: { agent: "router", name: "Navigator Kim", title: "Navigator" },
  source_analyzer: {
    agent: "source_analyzer",
    name: "Surveyor Lee",
    title: "Surveyor",
  },
  business_logic: {
    agent: "business_logic",
    name: "Quartermaster Jane",
    title: "Quartermaster",
  },
  code_generator: {
    agent: "code_generator",
    name: "Shipwright Max",
    title: "Shipwright",
  },
  db_migration: {
    agent: "db_migration",
    name: "Chief Engineer Reed",
    title: "Chief Engineer",
  },
  test_generator: {
    agent: "test_generator",
    name: "Technician Joe",
    title: "Technician",
  },
  reviewer: { agent: "reviewer", name: "Inspector Tom", title: "Inspector" },
  github_connector: {
    agent: "github_connector",
    name: "Signal Officer Sam",
    title: "Signal Officer",
  },
}

/** Roster order follows the system agent order. */
export const CREW_ORDER: AgentKey[] = AGENT_ORDER

/** The room an agent is stationed in (its post in the cutaway), if any. */
export function crewStation(
  agent: AgentKey
): { roomId: RoomId; label: string } | null {
  const room = ROOMS.find((r) => r.agents.includes(agent))
  return room ? { roomId: room.id, label: room.label } : null
}