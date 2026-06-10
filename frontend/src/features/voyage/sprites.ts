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
  data: (string | null)[]
  constructor(
    readonly w: number,
    readonly h: number
  ) {
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
  stampQuad(g, cox, coy, CNU, CNV, -CABH, (a, b) =>
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
  stampQuad(g, box, boy, BNU, BNV, -(CABH + BRH), (a, b) =>
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
  stampQuad(g, 4, 20, 14.2, 5.6, 10, (a, b, x, y) =>
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

// --- Bake everything --------------------------------------------------------

export interface Sprites {
  ferry: HTMLCanvasElement[]
  ferryShadow: HTMLCanvasElement
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
    clouds: [CLOUD_A, CLOUD_B, CLOUD_C].map(bakeSprite),
    birds: BIRD_FRAMES.map(bakeSprite),
    foam: FOAM_FRAMES.map(bakeSprite),
    moon: bakeSprite(MOON),
    harbor: bakeSprite(HARBOR),
    waves: makeWaveTiles(),
    whitecaps: makeWhitecaps(),
  }
}
