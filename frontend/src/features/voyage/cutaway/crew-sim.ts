// Crew behavior + live rendering for the ship cutaway. A small stateful sim
// drives nine characters: each is stationed in its agent's room (from
// rooms.ts), wanders the floor of that room, idles, and reacts to the agent
// message stream — when two crew in the same room exchange a message they walk
// together and raise a colored "speech" chip; cross-room messages raise the
// chip in place. The sim ticks off its own wall-clock and is only advanced
// while the cutaway is revealed (drawCrew is called from drawInspect), so it
// costs nothing at sea and never re-bakes the room. Movement is suppressed
// under prefers-reduced-motion (characters stand at their posts).

import { AGENTS, AGENT_ORDER, type AgentKey } from "@/lib/domain"
import type {
  AgentMessageVM,
  AgentRunStatus,
  AgentRuntime,
} from "@/lib/types"
import type { MessageType } from "@/lib/domain"
import { getHullProfile } from "./hull-profile"
import { ROOMS, type RoomDef } from "./rooms"
import { floorHeight, resolveCssColor } from "./interior-art"
import {
  CREW_FRAMES,
  CREW_H,
  CREW_W,
  drawCrewSprite,
} from "./crew-art"

const WALK_SPEED = 5 // model cells / second
const TALK_DUR = 3 // seconds a "speech" interaction holds

/** Message types that pull two crew together (the rest raise a solo chip). */
const PAIR_TYPES = new Set<MessageType>([
  "task_request",
  "handoff",
  "review",
  "decision",
  "blocker",
  "artifact_created",
])

/** Chip color per message type (kept close to the domain message tones). */
const TYPE_COLOR: Record<MessageType, string> = {
  finding: "#aef0d0",
  task_request: "#4f6bff",
  handoff: "#6fb3c9",
  review: "#74e0b0",
  decision: "#f2c14e",
  artifact_created: "#c6d0e6",
  blocker: "#c4574a",
}

interface CrewAgent {
  agent: AgentKey
  room: RoomDef
  minX: number
  maxX: number
  x: number
  targetX: number
  flip: boolean
  mode: "idle" | "walk" | "talk"
  timer: number
  frameT: number
  accent: string
  status: AgentRunStatus
  bubble: { color: string; until: number } | null
}

let agents: CrewAgent[] | null = null
const runtime = new Map<AgentKey, AgentRunStatus>()
const seenMsgIds = new Set<string>()
let primed = false
let lastClock = 0
let reducedMotion: MediaQueryList | null = null

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

function agentColorVar(agent: AgentKey): string {
  return AGENTS[agent].color.replace(/^var\(/, "").replace(/\)$/, "").trim()
}

function ensureInit(): CrewAgent[] {
  if (agents) return agents
  const built: CrewAgent[] = []
  for (const agent of AGENT_ORDER) {
    const room = ROOMS.find((r) => r.agents.includes(agent))
    if (!room) continue
    const minX = room.x0 + 1
    const maxX = Math.max(minX + 1, room.x1 - 1)
    built.push({
      agent,
      room,
      minX,
      maxX,
      x: rand(minX, maxX),
      targetX: rand(minX, maxX),
      flip: false,
      mode: "idle",
      timer: rand(0.3, 2),
      frameT: rand(0, 1),
      accent: resolveCssColor(agentColorVar(agent), "#4f6bff"),
      status: runtime.get(agent) ?? "idle",
      bubble: null,
    })
  }
  agents = built
  return built
}

function find(agent: AgentKey): CrewAgent | undefined {
  return agents?.find((a) => a.agent === agent)
}

function idleTime(status: AgentRunStatus): number {
  if (status === "active") return rand(0.5, 1.4)
  if (status === "blocked") return rand(0.8, 1.4)
  return rand(1.5, 4)
}

/** Step toward targetX; returns true once arrived. */
function moveToward(a: CrewAgent, dt: number): boolean {
  const speed = WALK_SPEED * (a.status === "active" ? 1.3 : 1)
  const dx = a.targetX - a.x
  if (Math.abs(dx) < 0.05) {
    a.x = a.targetX
    return true
  }
  const step = Math.sign(dx) * Math.min(Math.abs(dx), speed * dt)
  a.x += step
  // Model x grows toward the stern (screen-left), so a positive step faces
  // the character screen-left — mirror the sprite for that.
  a.flip = step > 0
  return false
}

// ---------------------------------------------------------------------------
// External feeds (called from React when run data changes)

/** Update each crew's status (drives pace + blocked fidget). */
export function setCrewRuntime(list: AgentRuntime[]) {
  for (const r of list) runtime.set(r.key, r.status)
  if (agents) for (const a of agents) a.status = runtime.get(a.agent) ?? a.status
}

/**
 * Feed the agent message stream. The first call primes the seen-set without
 * firing (so a backlog doesn't trigger a burst); later calls raise a chip /
 * meet-up for each genuinely new message.
 */
export function setCrewMessages(messages: AgentMessageVM[]) {
  ensureInit()
  if (!primed) {
    for (const m of messages) seenMsgIds.add(m.id)
    primed = true
    return
  }
  const now = performance.now() / 1000
  for (const m of messages) {
    if (seenMsgIds.has(m.id)) continue
    seenMsgIds.add(m.id)
    trigger(m, now)
  }
}

function trigger(m: AgentMessageVM, now: number) {
  const sender = find(m.agent)
  if (!sender) return
  const color = TYPE_COLOR[m.type]
  const recip = m.targetAgent ? find(m.targetAgent) : undefined

  if (recip && PAIR_TYPES.has(m.type) && recip.room === sender.room) {
    // Same room: the two walk together and face off.
    const mid = (sender.x + recip.x) / 2
    sender.targetX = Math.min(sender.maxX, Math.max(sender.minX, mid - 0.9))
    recip.targetX = Math.min(recip.maxX, Math.max(recip.minX, mid + 0.9))
    for (const a of [sender, recip]) {
      a.mode = "talk"
      a.timer = TALK_DUR
      a.bubble = { color, until: now + TALK_DUR }
    }
  } else {
    // Solo / cross-room: raise the chip in place.
    sender.mode = "talk"
    sender.timer = TALK_DUR
    sender.bubble = { color, until: now + TALK_DUR }
    if (recip) {
      recip.bubble = { color, until: now + TALK_DUR }
    }
  }
}

// ---------------------------------------------------------------------------
// Tick

function update(dt: number, now: number) {
  if (!agents) return
  for (const a of agents) {
    a.frameT += dt
    if (a.bubble && now >= a.bubble.until) a.bubble = null
    a.status = runtime.get(a.agent) ?? a.status

    switch (a.mode) {
      case "talk": {
        moveToward(a, dt)
        a.timer -= dt
        if (a.timer <= 0) {
          a.mode = "idle"
          a.timer = idleTime(a.status)
        }
        break
      }
      case "walk": {
        if (moveToward(a, dt)) {
          a.mode = "idle"
          a.timer = idleTime(a.status)
        }
        break
      }
      case "idle": {
        a.timer -= dt
        if (a.timer <= 0) {
          if (a.status === "blocked") {
            // Stay put and flag, mirroring a stalled agent.
            a.timer = rand(1, 1.8)
            a.bubble = { color: TYPE_COLOR.blocker, until: now + 1.4 }
          } else {
            a.targetX = rand(a.minX, a.maxX)
            a.mode = "walk"
          }
        }
        break
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Render

function frameFor(a: CrewAgent): string[] {
  if (a.mode === "walk" || (a.mode === "talk" && a.x !== a.targetX)) {
    return Math.floor(a.frameT * 6) % 2 === 0
      ? CREW_FRAMES.walkA
      : CREW_FRAMES.walkB
  }
  return CREW_FRAMES.idle
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  color: string,
  u: number
) {
  const pad = Math.max(1, Math.round(u))
  const dot = Math.max(2, Math.round(2.5 * u))
  const w = dot + pad * 2
  const h = dot + pad * 2
  const x = Math.round(cx - w / 2)
  const y = Math.round(baseY - h)
  ctx.fillStyle = "#33416e"
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2)
  ctx.fillStyle = "#0d142e"
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = color
  ctx.fillRect(x + pad, y + pad, dot, dot)
  // Little tail.
  ctx.fillStyle = "#0d142e"
  ctx.fillRect(Math.round(cx - 1), y + h, 2, Math.max(1, pad))
}

/**
 * Advance the sim and draw the crew over the interior. (ox, oy) is where the
 * interior canvas was blitted; `zoom` is px per voxel; `alpha` follows the
 * cutaway reveal. Mirrors the coordinate mapping in cutaway-render/interior-art
 * (bow on the left, z up).
 */
export function drawCrew(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  zoom: number,
  alpha: number
) {
  const crew = ensureInit()
  if (!reducedMotion)
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

  const now = performance.now() / 1000
  const dt = Math.min(now - (lastClock || now), 0.1)
  lastClock = now
  if (!reducedMotion.matches) update(dt, now)

  const p = getHullProfile()
  const u = zoom / 4
  const wPx = CREW_W * u
  const hPx = CREW_H * u

  ctx.save()
  ctx.globalAlpha = alpha
  for (const a of crew) {
    const feetZ = a.room.z0 + floorHeight(a.room) - 1
    const feetY = oy + (p.lz - 1 - feetZ) * zoom
    const centerX = ox + (p.lx - 1 - a.x) * zoom + zoom / 2
    const walking =
      a.mode === "walk" || (a.mode === "talk" && a.x !== a.targetX)
    const bob = walking && Math.floor(a.frameT * 6) % 2 === 0 ? -1 : 0
    const left = Math.round(centerX - wPx / 2)
    const top = Math.round(feetY - hPx) + bob

    // Contact shadow.
    ctx.fillStyle = "rgba(4, 6, 14, 0.32)"
    ctx.fillRect(
      Math.round(centerX - wPx / 2 + u),
      Math.round(feetY - Math.max(1, u)),
      Math.round(wPx - 2 * u),
      Math.max(1, Math.round(u))
    )

    drawCrewSprite(ctx, frameFor(a), left, top, u, a.accent, a.accent, a.flip)

    if (a.bubble && now < a.bubble.until) {
      drawBubble(ctx, centerX, top - Math.round(u), a.bubble.color, u)
    }
  }
  ctx.restore()
}
