// Tiny 3×5 pixel caps/digits for in-canvas labels (dock signs, room names).
// Glyphs are 5 rows of 3 bits, msb = left pixel. Unknown chars render blank.

const GLYPHS: Record<string, number[]> = {
  A: [2, 5, 7, 5, 5],
  B: [6, 5, 6, 5, 6],
  C: [3, 4, 4, 4, 3],
  D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3],
  H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7],
  J: [1, 1, 1, 5, 2],
  K: [5, 6, 4, 6, 5],
  L: [4, 4, 4, 4, 7],
  M: [5, 7, 5, 5, 5],
  N: [6, 5, 5, 5, 5],
  O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3],
  R: [6, 5, 6, 6, 5],
  S: [3, 4, 2, 1, 6],
  T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2],
  W: [5, 5, 5, 7, 5],
  X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  "0": [7, 5, 5, 5, 7],
  "1": [2, 6, 2, 2, 7],
  "2": [6, 1, 2, 4, 7],
  "3": [6, 1, 2, 1, 6],
  "4": [5, 5, 7, 1, 1],
  "5": [7, 4, 6, 1, 6],
  "6": [3, 4, 6, 5, 2],
  "7": [7, 1, 2, 2, 2],
  "8": [2, 5, 2, 5, 2],
  "9": [2, 5, 3, 1, 6],
  "#": [5, 7, 5, 7, 5],
  "-": [0, 0, 7, 0, 0],
  ".": [0, 0, 0, 0, 2],
  "/": [1, 1, 2, 4, 4],
}

export const PIXEL_FONT_H = 5
const ADVANCE = 4

export function pixelTextWidth(text: string, scale = 1): number {
  return text.length === 0 ? 0 : (text.length * ADVANCE - 1) * scale
}

export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale = 1
) {
  ctx.fillStyle = color
  let cx = Math.floor(x)
  const cy = Math.floor(y)
  const s = scale
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch]
    if (g) {
      for (let r = 0; r < 5; r++) {
        const bits = g[r]
        if (bits & 4) ctx.fillRect(cx, cy + r * s, s, s)
        if (bits & 2) ctx.fillRect(cx + s, cy + r * s, s, s)
        if (bits & 1) ctx.fillRect(cx + 2 * s, cy + r * s, s, s)
      }
    }
    cx += ADVANCE * s
  }
}
