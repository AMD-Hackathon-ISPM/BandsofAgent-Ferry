// Voxel crew characters for the ship cutaway. Authored at quarter-cell
// resolution (u = zoom / 4) like the furniture in interior-art.ts, so the
// little people snap to the same voxel grid. One shared body silhouette is
// tinted per agent with that agent's accent hue (the `A`/`a` cells), giving
// nine visually distinct crew without nine bespoke sprites. Three frames make
// a short walk cycle; the renderer also bobs the whole sprite while walking.

export const CREW_W = 8
export const CREW_H = 14

const PALETTE: Record<string, string> = {
  K: "#0a0f1f", // outline
  H: "#2a2118", // hair
  S: "#e6b07e", // skin
  s: "#c98a55", // skin shadow
  c: "#c6d0e6", // collar / cuffs
  d: "#1a2336", // boots
}

/** Shared upper body (rows 0–11); legs are appended per frame. */
const BODY: string[] = [
  "..KKKK..",
  ".KHHHHK.",
  ".KHHHHK.",
  ".KSSSSK.",
  ".KSKKSK.",
  ".KsSSsK.",
  "..KccK..",
  ".KAAAAK.",
  ".KAAAAK.",
  ".KaAAaK.",
  ".KAAAAK.",
  ".KAAAAK.",
]

const LEGS_IDLE = [".Kd..dK.", ".KK..KK."]
const LEGS_WALK_A = [".dK..Kd.", ".K....K."]
const LEGS_WALK_B = ["..KddK..", "..K..K.."]

export const CREW_FRAMES = {
  idle: [...BODY, ...LEGS_IDLE],
  walkA: [...BODY, ...LEGS_WALK_A],
  walkB: [...BODY, ...LEGS_WALK_B],
}

export type CrewFrameKey = keyof typeof CREW_FRAMES

/**
 * Draw one crew frame with its top-left at (x, y). `accent`/`accentDark` tint
 * the uniform; `flip` mirrors horizontally so the character can face either
 * way along the deck.
 */
export function drawCrewSprite(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  u: number,
  accent: string,
  accentDark: string,
  flip: boolean
) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const y0 = y + Math.round(r * u)
    const y1 = y + Math.round((r + 1) * u)
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch === ".") continue
      const color =
        ch === "A" ? accent : ch === "a" ? accentDark : PALETTE[ch]
      if (!color) continue
      const col = flip ? row.length - 1 - c : c
      const x0 = x + Math.round(col * u)
      const x1 = x + Math.round((col + 1) * u)
      ctx.fillStyle = color
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    }
  }
}
