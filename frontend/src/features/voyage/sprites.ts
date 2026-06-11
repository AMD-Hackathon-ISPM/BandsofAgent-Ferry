// HD-2D pixel sprites for the voyage scene, authored in code and baked once
// to offscreen canvases. All shading and shadows are baked into the palettes
// (tone ramps + checkerboard dither) — nothing is lit at runtime, so drawing
// a "shaded" sprite costs the same as a flat one.

import { makeWaveTiles, makeWhitecaps } from "./sea"

export const COLORS = {
  sky: "#111a33",
  horizon: "#2e3f68",
  seaBase: "#15223f",
  shadow: "#0b1428",
  outline: "#0e1730",
  star: "#33446f",
  starBright: "#6a82b8",
}

export const HARBOR_KEYS = [
  "router",
  "source_analyzer",
  "business_logic",
  "code_generator",
  "db_migration",
  "test_generator",
  "reviewer",
  "commander",
  "github_connector",
] as const

export interface SpriteDef {
  palette: Record<string, string>
  rows: string[]
}

export function bakeSprite(def: SpriteDef): HTMLCanvasElement {
  const h = def.rows.length
  const w = Math.max(...def.rows.map((r) => r.length))
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")!
  for (let y = 0; y < h; y++) {
    const row = def.rows[y]
    for (let x = 0; x < row.length; x++) {
      const color = def.palette[row[x]]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
    }
  }
  return c
}

// ---------------------------------------------------------------------------
// Pixel grid + 2:1 isometric quad stamping (for the ferry, which is easier to
// keep geometrically coherent generated than hand-typed).
// Basis: u = (+2,-1) toward the bow (up-right), v = (+2,+1) toward starboard.
// ---------------------------------------------------------------------------

class PixelGrid {
  readonly w: number
  readonly h: number
  data: (string | null)[]
  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.data = new Array<string | null>(w * h).fill(null)
  }
  set(x: number, y: number, color: string) {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h)
      this.data[y * this.w + x] = color
  }
  get(x: number, y: number): string | null {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return null
    return this.data[y * this.w + x]
  }
  bake(): HTMLCanvasElement {
    const c = document.createElement("canvas")
    c.width = this.w
    c.height = this.h
    const ctx = c.getContext("2d")!
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const color = this.data[y * this.w + x]
        if (!color) continue
        ctx.fillStyle = color
        ctx.fillRect(x, y, 1, 1)
      }
    }
    return c
  }
}

function isoAB(x: number, y: number, ox: number, oy: number) {
  const dx = x - ox
  const dy = y - oy
  return { a: (dx - 2 * dy) / 4, b: (dx + 2 * dy) / 4 }
}

/**
 * Stamp an iso parallelogram. `drop` shifts the stamp down in screen space
 * (positive = extruded hull below the deck, negative = raised cabin level).
 * `pick` returns a color or null per pixel given iso coords (a along, b across).
 */
function stampQuad(
  g: PixelGrid,
  ox: number,
  oy: number,
  na: number,
  nb: number,
  drop: number,
  pick: (a: number, b: number, x: number, y: number) => string | null
) {
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const { a, b } = isoAB(x, y - drop, ox, oy)
      if (a < 0 || a >= na || b < 0 || b >= nb) continue
      const color = pick(a, b, x, y)
      if (color) g.set(x, y, color)
    }
  }
}

// --- Ferry ----------------------------------------------------------------

export const FERRY_W = 48
export const FERRY_H = 40
/** Sprite-local point that should sit at the scene's ship anchor. */
export const FERRY_ANCHOR = { x: 22, y: 18 }
/** Sprite-local stern waterline, where the wake spawns. */
export const FERRY_STERN = { x: 9, y: 30 }

const F = {
  hullDark: "#26365b",
  hullMid: "#33466f",
  indigo: "#4f6bff",
  indigoDark: "#3a50c4",
  deck: "#9aa8c6",
  deckHi: "#c6d0e6",
  deckShade: "#7e8cab",
  cabSide: "#aab6d2",
  cabStern: "#c3cde4",
  cabTop: "#e8edf8",
  cabTopHi: "#f4f7fd",
  glass: "#1b2747",
  funnel: "#e8edf8",
  funnelShade: "#aab6d2",
  mast: "#8e9cbd",
  warm: "#f2c14e",
  foam: "#dfe9fb",
}

/**
 * Draw the side faces hanging below a block's top face. For every pixel not
 * covered by the top face (at `baseDrop`), find how many rows it sits below
 * the top-face silhouette; `colorByDepth` turns that band index (1..height)
 * into a color, which is what makes horizontal stripes (waterline, hull
 * stripe, window rows) run cleanly along the staircase edges.
 */
function extrudeDown(
  g: PixelGrid,
  ox: number,
  oy: number,
  na: number,
  nb: number,
  baseDrop: number,
  height: number,
  colorByDepth: (
    depth: number,
    starboard: boolean,
    x: number,
    y: number
  ) => string | null
) {
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const top = isoAB(x, y - baseDrop, ox, oy)
      if (top.a >= 0 && top.a < na && top.b >= 0 && top.b < nb) continue
      for (let d = 1; d <= height; d++) {
        const { a, b } = isoAB(x, y - baseDrop - d, ox, oy)
        if (a < 0 || a >= na || b < 0 || b >= nb) continue
        const color = colorByDepth(d, b > nb - 1, x, y)
        if (color) g.set(x, y, color)
        break
      }
    }
  }
}

function buildFerry(frame: number): HTMLCanvasElement {
  const g = new PixelGrid(FERRY_W, FERRY_H)
  const ox = 4
  const oy = 20
  const NU = 13 // hull length, iso units
  const NV = 5 // beam, iso units
  const HULL = 8 // hull side height, px

  // Hull faces: dark starboard / mid stern ramp, indigo company stripe,
  // outline row at the waterline.
  extrudeDown(g, ox, oy, NU, NV, 0, HULL, (d, starboard) => {
    if (d === HULL) return COLORS.outline
    if (d === 3 || d === 4) return starboard ? F.indigoDark : F.indigo
    return starboard ? F.hullDark : F.hullMid
  })

  // Deck: light top ramp, highlight along the port/bow edges, shade + dither
  // toward starboard.
  stampQuad(g, ox, oy, NU, NV, 0, (a, b, x, y) => {
    if (b < 0.6 || a > NU - 0.6) return F.deckHi
    if (b > NV - 0.6) return F.deckShade
    if (b > NV - 1.6 && (x + y) % 2 === 0) return F.deckShade
    return F.deck
  })

  // Cabin block amidships, one level up; window row with mullions.
  const cox = 11
  const coy = 18
  const CNU = 7
  const CNV = 3
  const CABH = 7
  extrudeDown(g, cox, coy, CNU, CNV, -CABH, CABH, (d, starboard, x) => {
    if (d === 3 || d === 4) return x % 3 === 0 ? F.cabSide : F.glass
    return starboard ? F.cabSide : F.cabStern
  })
  stampQuad(g, cox, coy, CNU, CNV, -CABH, (_a, b) =>
    b < 0.6 ? F.cabTopHi : F.cabTop
  )

  // Bridge deck stacked on the bow end of the cabin, wrapped in glass.
  const box = 21
  const boy = 14
  const BNU = 2.5
  const BNV = 2
  const BRH = 4
  extrudeDown(g, box, boy, BNU, BNV, -(CABH + BRH), BRH, (d, starboard, x) => {
    if (d === 2 || d === 3) return x % 4 === 0 ? F.cabSide : F.glass
    return starboard ? F.cabSide : F.cabStern
  })
  stampQuad(g, box, boy, BNU, BNV, -(CABH + BRH), (_a, b) =>
    b < 0.6 ? F.cabTopHi : F.cabTop
  )

  // Funnel on the cabin roof, indigo band.
  for (let y = 3; y <= 11; y++) {
    for (let x = 16; x <= 19; x++) {
      if (y === 3) g.set(x, y, COLORS.outline)
      else if (y === 4 || y === 5)
        g.set(x, y, x === 19 ? F.indigoDark : F.indigo)
      else g.set(x, y, x === 19 ? F.funnelShade : F.funnel)
    }
  }

  // Silhouette outline pass: any filled pixel touching empty becomes the
  // dark line — classic pixel-art readability against sea and sky.
  const outlined: Array<[number, number]> = []
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!g.get(x, y)) continue
      if (
        !g.get(x - 1, y) ||
        !g.get(x + 1, y) ||
        !g.get(x, y - 1) ||
        !g.get(x, y + 1)
      ) {
        outlined.push([x, y])
      }
    }
  }
  for (const [x, y] of outlined) g.set(x, y, COLORS.outline)

  // Foredeck mast + masthead light (after outlining so the 1px pole survives).
  for (let y = 4; y <= 10; y++) g.set(32, y, F.mast)
  g.set(32, 3, F.warm)

  // Waterline foam, dithered, phase alternates between the two frames.
  stampQuad(g, ox, oy, NU, NV, HULL + 1, (a, b, x) => {
    const edge = b > NV - 1 || a < 1
    if (!edge) return null
    return (x + frame * 2) % 4 < 2 ? F.foam : null
  })

  return g.bake()
}

/** Flat dithered contact shadow on the water under the hull (does not bob). */
function buildFerryShadow(): HTMLCanvasElement {
  const g = new PixelGrid(FERRY_W + 4, FERRY_H + 4)
  stampQuad(g, 4, 20, 14.2, 5.6, 10, (a, _b, x, y) =>
    a > -0.6 && (x + y) % 2 === 0 ? COLORS.shadow : null
  )
  return g.bake()
}

// --- Hand-authored string sprites ------------------------------------------

const CLOUD_PAL = { c: "#2c3a63", h: "#3b4c7d" }

const CLOUD_A: SpriteDef = {
  palette: CLOUD_PAL,
  rows: [
    "......hhhhh.......",
    "...hhhccccchh.....",
    ".hhcccccccccchh...",
    "hccccccccccccccch.",
    ".ccccccccccccccc..",
    "...ccc..ccccc.....",
  ],
}

const CLOUD_B: SpriteDef = {
  palette: CLOUD_PAL,
  rows: ["...hhhh.....", ".hhcccchh...", "hcccccccch..", "..ccc.cc...."],
}

const CLOUD_C: SpriteDef = {
  palette: CLOUD_PAL,
  rows: [
    ".....hhhhhh........hh...",
    "..hhhcccccchhh...hhcch..",
    "hhcccccccccccchhhccccch.",
    ".cccccccccccccccccccc...",
    "...cccc..cccccc..ccc....",
  ],
}

const BIRD_PAL = { b: "#8e9cbd" }

const BIRD_FRAMES: SpriteDef[] = [
  { palette: BIRD_PAL, rows: ["b...b", ".b.b.", "..b.."] },
  { palette: BIRD_PAL, rows: [".....", "bb.bb", "..b.."] },
]

const FOAM_PAL = { f: "#dfe9fb", g: "#8fa3cf" }

const FOAM_FRAMES: SpriteDef[] = [
  { palette: FOAM_PAL, rows: [".ff.", "ffff", ".ff."] },
  { palette: FOAM_PAL, rows: [".ff.", "f..f"] },
  { palette: FOAM_PAL, rows: ["g.g", ".g."] },
]

const MOON: SpriteDef = {
  palette: { m: "#aab9dd", d: "#8294bd" },
  rows: [
    "...mmm...",
    ".mmmmmmm.",
    ".mmmmmdm.",
    "mmmdmmmmm",
    "mmmmmmmdm",
    "mmdmmmmmm",
    ".mmmmmmm.",
    ".mmmmdmm.",
    "...mmm...",
  ],
}

// Distant harbor skyline: lighthouse, cranes, warehouses; warm windows.
const HARBOR: SpriteDef = {
  palette: {
    S: "#233158",
    s: "#2c3d6b",
    Q: "#1b2747",
    W: "#f2c14e",
    B: "#ffd166",
    i: "#4f6bff",
  },
  rows: [
    "....B.......................................",
    "...sss......................................",
    "...sWs........................s.............",
    "...sss........................s.............",
    "....S.........ssssssss........s.............",
    "....S................s......sssss...........",
    "...SSS...............s......ssiss....ssssss.",
    "...SSS...............s......sssss....s.W..s.",
    "...SSS.....SS........s.....sssssss...s....s.",
    "..SSSSS....SS....ssssssss..sssssss...sW...s.",
    "..SSSSS....SS....s..s......sSWSsss...s..W.s.",
    ".SSSSSSS...SS....s..s......sssssss...ssssss.",
    ".SSSSSSS...SSSSSSSSSSS..SSSSSSSSSS..SSSSSSS.",
    ".SSWSSSS...SSSSSSSSSSS..SW.SSW.SSS..SS.W.SS.",
    "QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
    "QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  ],
}

// --- Agent harbors ----------------------------------------------------------

type HarborTheme = {
  wall: string
  roof: string
  trim: string
  glow: string
  dark: string
  accent: string
}

const HARBOR_THEMES: HarborTheme[] = [
  {
    wall: "#263a68",
    roof: "#4f6bff",
    trim: "#8fa3cf",
    glow: "#65d6ff",
    dark: "#15223f",
    accent: "#7b8cff",
  },
  {
    wall: "#24445f",
    roof: "#2d7791",
    trim: "#9ac6d5",
    glow: "#8ef0ff",
    dark: "#102437",
    accent: "#58bfd5",
  },
  {
    wall: "#4d3a62",
    roof: "#8b6ba8",
    trim: "#d0b7e6",
    glow: "#f2c14e",
    dark: "#24172e",
    accent: "#c38ed9",
  },
  {
    wall: "#2c4d48",
    roof: "#36a173",
    trim: "#a6dcc4",
    glow: "#9df7b7",
    dark: "#142d2a",
    accent: "#6ee7a8",
  },
  {
    wall: "#584d34",
    roof: "#c49a4b",
    trim: "#ead39a",
    glow: "#ffd166",
    dark: "#2d271b",
    accent: "#d8b45f",
  },
  {
    wall: "#3d4b67",
    roof: "#6c83b8",
    trim: "#d7e1f2",
    glow: "#bde7ff",
    dark: "#1b2435",
    accent: "#91b7ff",
  },
  {
    wall: "#4c3f52",
    roof: "#d08a9e",
    trim: "#f3c4d0",
    glow: "#f7a9be",
    dark: "#251d29",
    accent: "#e8729b",
  },
  {
    wall: "#4f3f2c",
    roof: "#b47a3c",
    trim: "#f0c08a",
    glow: "#ffc86e",
    dark: "#2a2118",
    accent: "#df9a4a",
  },
  {
    wall: "#344b45",
    roof: "#5c816f",
    trim: "#c0decf",
    glow: "#b5ffd6",
    dark: "#172722",
    accent: "#6ccf91",
  },
]

function makeArtCanvas(
  w: number,
  h: number
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  return [c, ctx]
}

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string
) {
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x1 + 0.5, y1 + 0.5)
  ctx.lineTo(x2 + 0.5, y2 + 0.5)
  ctx.stroke()
}

function drawPier(ctx: CanvasRenderingContext2D, t: HarborTheme) {
  rect(ctx, 4, 39, 84, 9, "#6d4d35")
  rect(ctx, 4, 48, 84, 3, "#2a2118")
  for (let x = 7; x < 86; x += 7) line(ctx, x, 39, x, 48, "#a16c43")
  for (const x of [8, 24, 44, 64, 82]) {
    rect(ctx, x, 34, 4, 18, "#4c382b")
    rect(ctx, x - 1, 33, 6, 2, "#9b6a42")
    rect(ctx, x, 51, 4, 3, "#1b2747")
  }
  line(ctx, 10, 37, 24, 35, "#d0b98c")
  line(ctx, 24, 35, 44, 37, "#d0b98c")
  line(ctx, 44, 37, 64, 35, "#d0b98c")
  line(ctx, 64, 35, 82, 37, "#d0b98c")
  rect(ctx, 12, 52, 12, 1, t.trim)
  rect(ctx, 58, 52, 18, 1, t.trim)
}

function drawHouse(
  ctx: CanvasRenderingContext2D,
  t: HarborTheme,
  x: number,
  y: number,
  w: number,
  h: number,
  roof: "gable" | "flat" | "tower" = "gable"
) {
  rect(ctx, x - 1, y + h, w + 2, 2, t.dark)
  rect(ctx, x, y, w, h, t.wall)
  rect(ctx, x, y, w, 1, t.trim)
  rect(ctx, x, y + h - 1, w, 1, t.dark)
  if (roof === "flat") {
    rect(ctx, x - 3, y - 5, w + 6, 5, t.roof)
    rect(ctx, x - 2, y - 6, w + 4, 1, t.trim)
  } else if (roof === "tower") {
    rect(ctx, x + 5, y - 12, w - 10, 12, t.roof)
    rect(ctx, x + 3, y - 14, w - 6, 2, t.trim)
  } else {
    for (let i = 0; i < Math.floor(w / 2) + 3; i++) {
      rect(ctx, x - 3 + i, y - i, w + 6 - i * 2, 1, t.roof)
    }
    rect(ctx, x - 2, y - 1, w + 4, 1, t.trim)
  }
  rect(ctx, x + 4, y + 7, 5, 6, t.glow)
  rect(ctx, x + w - 10, y + 6, 6, 5, t.glow)
  rect(ctx, x + 4, y + 7, 5, 1, "#f4f7fd")
  rect(ctx, x + w - 10, y + 6, 6, 1, "#f4f7fd")
  rect(ctx, x + Math.floor(w / 2) - 3, y + h - 9, 6, 9, t.dark)
  rect(ctx, x + Math.floor(w / 2) + 1, y + h - 5, 1, 1, t.glow)
}

function drawHarborIcon(
  ctx: CanvasRenderingContext2D,
  index: number,
  t: HarborTheme
) {
  const ox = 45
  const oy = 22
  rect(ctx, ox - 7, oy - 7, 14, 10, "#111a33")
  rect(ctx, ox - 6, oy - 6, 12, 8, t.dark)
  switch (index) {
    case 0:
      rect(ctx, ox - 1, oy - 6, 2, 8, t.glow)
      line(ctx, ox - 5, oy - 4, ox - 1, oy - 2, t.accent)
      line(ctx, ox + 1, oy - 2, ox + 5, oy - 5, t.accent)
      rect(ctx, ox - 6, oy - 5, 2, 2, t.trim)
      rect(ctx, ox + 4, oy - 6, 2, 2, t.trim)
      break
    case 1:
      rect(ctx, ox - 5, oy - 5, 7, 8, t.trim)
      rect(ctx, ox - 4, oy - 4, 5, 1, t.glow)
      line(ctx, ox + 2, oy - 1, ox + 6, oy + 3, t.glow)
      rect(ctx, ox + 1, oy - 3, 4, 4, t.accent)
      break
    case 2:
      rect(ctx, ox - 5, oy - 5, 10, 7, t.glow)
      rect(ctx, ox - 3, oy - 3, 6, 1, t.dark)
      rect(ctx, ox - 3, oy, 6, 1, t.dark)
      break
    case 3:
      line(ctx, ox - 5, oy - 3, ox - 2, oy - 6, t.glow)
      line(ctx, ox - 5, oy - 3, ox - 2, oy, t.glow)
      line(ctx, ox + 5, oy - 3, ox + 2, oy - 6, t.glow)
      line(ctx, ox + 5, oy - 3, ox + 2, oy, t.glow)
      rect(ctx, ox - 1, oy - 5, 2, 7, t.accent)
      break
    case 4:
      rect(ctx, ox - 5, oy - 5, 10, 2, t.glow)
      rect(ctx, ox - 5, oy - 3, 10, 6, t.accent)
      rect(ctx, ox - 5, oy + 2, 10, 2, t.glow)
      break
    case 5:
      rect(ctx, ox - 5, oy - 5, 3, 8, t.glow)
      rect(ctx, ox + 2, oy - 5, 3, 8, t.accent)
      rect(ctx, ox - 6, oy + 3, 12, 1, t.trim)
      break
    case 6:
      line(ctx, ox - 5, oy - 1, ox - 1, oy + 3, t.glow)
      line(ctx, ox - 1, oy + 3, ox + 6, oy - 6, t.glow)
      rect(ctx, ox - 5, oy - 6, 10, 1, t.trim)
      break
    case 7:
      rect(ctx, ox - 1, oy - 6, 2, 10, t.trim)
      rect(ctx, ox + 1, oy - 6, 5, 3, t.glow)
      rect(ctx, ox - 6, oy + 2, 12, 2, t.accent)
      break
    default:
      rect(ctx, ox - 5, oy - 5, 3, 3, t.glow)
      rect(ctx, ox + 2, oy - 5, 3, 3, t.glow)
      rect(ctx, ox - 1, oy + 1, 3, 3, t.glow)
      line(ctx, ox - 2, oy - 3, ox + 2, oy - 3, t.accent)
      line(ctx, ox, oy - 2, ox, oy + 1, t.accent)
      break
  }
}

function drawHarborDetail(
  ctx: CanvasRenderingContext2D,
  index: number,
  t: HarborTheme
) {
  switch (index) {
    case 0:
      rect(ctx, 68, 13, 2, 22, t.trim)
      line(ctx, 63, 18, 69, 12, t.accent)
      line(ctx, 69, 12, 75, 18, t.accent)
      rect(ctx, 68, 10, 2, 2, t.glow)
      break
    case 1:
      rect(ctx, 14, 28, 11, 8, "#7e8cab")
      rect(ctx, 16, 25, 7, 3, t.glow)
      line(ctx, 16, 31, 23, 31, t.dark)
      break
    case 2:
      rect(ctx, 66, 28, 10, 7, "#8a6a45")
      rect(ctx, 68, 30, 6, 1, t.glow)
      rect(ctx, 68, 33, 6, 1, t.glow)
      break
    case 3:
      rect(ctx, 14, 28, 14, 7, "#27344f")
      rect(ctx, 16, 30, 10, 2, t.glow)
      rect(ctx, 18, 32, 6, 1, t.accent)
      break
    case 4:
      rect(ctx, 13, 23, 9, 13, t.accent)
      rect(ctx, 13, 22, 9, 2, t.glow)
      rect(ctx, 13, 29, 9, 1, t.dark)
      break
    case 5:
      rect(ctx, 67, 25, 8, 10, "#d7e1f2")
      rect(ctx, 69, 27, 4, 5, t.glow)
      rect(ctx, 66, 34, 10, 1, t.accent)
      break
    case 6:
      rect(ctx, 16, 16, 7, 20, t.trim)
      rect(ctx, 14, 13, 11, 3, t.glow)
      rect(ctx, 17, 21, 5, 2, t.accent)
      break
    case 7:
      rect(ctx, 68, 18, 2, 18, t.trim)
      rect(ctx, 68, 18, 11, 5, t.glow)
      rect(ctx, 66, 35, 12, 1, t.accent)
      break
    default:
      rect(ctx, 15, 17, 2, 18, t.trim)
      line(ctx, 16, 18, 30, 20, t.trim)
      line(ctx, 30, 20, 25, 26, t.accent)
      rect(ctx, 24, 26, 3, 2, t.glow)
      break
  }
}

function buildAgentHarbor(index: number): HTMLCanvasElement {
  const t = HARBOR_THEMES[index]
  const [c, ctx] = makeArtCanvas(92, 56)
  drawPier(ctx, t)
  drawHouse(
    ctx,
    t,
    30,
    18,
    30,
    21,
    index === 3 || index === 8 ? "flat" : index === 6 ? "tower" : "gable"
  )
  drawHarborIcon(ctx, index, t)
  drawHarborDetail(ctx, index, t)
  rect(ctx, 30, 39, 30, 1, "#d0b98c")
  for (let i = 0; i < 4; i++) {
    rect(ctx, 33 + i * 6, 41, 2, 1, t.glow)
  }
  return c
}

// --- Bake everything --------------------------------------------------------

export interface Sprites {
  ferry: HTMLCanvasElement[]
  ferryShadow: HTMLCanvasElement
  harbors: HTMLCanvasElement[]
  clouds: HTMLCanvasElement[]
  birds: HTMLCanvasElement[]
  foam: HTMLCanvasElement[]
  moon: HTMLCanvasElement
  harbor: HTMLCanvasElement
  waves: HTMLCanvasElement[][]
  whitecaps: HTMLCanvasElement[]
}

export function bakeSprites(): Sprites {
  return {
    ferry: [buildFerry(0), buildFerry(1)],
    ferryShadow: buildFerryShadow(),
    harbors: HARBOR_KEYS.map((_, index) => buildAgentHarbor(index)),
    clouds: [CLOUD_A, CLOUD_B, CLOUD_C].map(bakeSprite),
    birds: BIRD_FRAMES.map(bakeSprite),
    foam: FOAM_FRAMES.map(bakeSprite),
    moon: bakeSprite(MOON),
    harbor: bakeSprite(HARBOR),
    waves: makeWaveTiles(),
    whitecaps: makeWhitecaps(),
  }
}
