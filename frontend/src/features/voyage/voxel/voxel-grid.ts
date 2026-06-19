// Uint8Array-backed 3D voxel grid + surface extraction for the ferry model.
// Cells hold palette indices (0 = empty). `extract` keeps only voxels with at
// least one face the camera could ever see, so the renderer never pays for
// interior cells.

export const FACE_PX = 1
export const FACE_NX = 2
export const FACE_PY = 4
export const FACE_NY = 8
export const FACE_PZ = 16

export interface VoxelModel {
  count: number
  xs: Int16Array
  ys: Int16Array
  zs: Int16Array
  color: Uint8Array
  /** Per-voxel exposed faces (FACE_* bits). -z faces are never visible. */
  faces: Uint8Array
  /** CSS hex colors; index 0 is "empty" and never drawn. */
  palette: string[]
  lx: number
  ly: number
  lz: number
}

type Paint = number | ((x: number, y: number, z: number) => number)

export class VoxelGrid {
  readonly lx: number
  readonly ly: number
  readonly lz: number
  readonly data: Uint8Array

  constructor(lx: number, ly: number, lz: number) {
    this.lx = lx
    this.ly = ly
    this.lz = lz
    this.data = new Uint8Array(lx * ly * lz)
  }

  get(x: number, y: number, z: number): number {
    if (
      x < 0 || x >= this.lx ||
      y < 0 || y >= this.ly ||
      z < 0 || z >= this.lz
    ) {
      return 0
    }
    return this.data[(z * this.ly + y) * this.lx + x]
  }

  set(x: number, y: number, z: number, c: number) {
    if (
      x < 0 || x >= this.lx ||
      y < 0 || y >= this.ly ||
      z < 0 || z >= this.lz
    ) {
      return
    }
    this.data[(z * this.ly + y) * this.lx + x] = c
  }

  /** Fill an inclusive box; a `paint` callback may return 0 to skip a cell. */
  box(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    paint: Paint
  ) {
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const c = typeof paint === "number" ? paint : paint(x, y, z)
          if (c) this.set(x, y, z, c)
        }
      }
    }
  }

  extract(palette: string[]): VoxelModel {
    const xs: number[] = []
    const ys: number[] = []
    const zs: number[] = []
    const color: number[] = []
    const faces: number[] = []
    for (let z = 0; z < this.lz; z++) {
      for (let y = 0; y < this.ly; y++) {
        for (let x = 0; x < this.lx; x++) {
          const c = this.get(x, y, z)
          if (!c) continue
          let f = 0
          if (!this.get(x + 1, y, z)) f |= FACE_PX
          if (!this.get(x - 1, y, z)) f |= FACE_NX
          if (!this.get(x, y + 1, z)) f |= FACE_PY
          if (!this.get(x, y - 1, z)) f |= FACE_NY
          if (!this.get(x, y, z + 1)) f |= FACE_PZ
          if (!f) continue
          xs.push(x)
          ys.push(y)
          zs.push(z)
          color.push(c)
          faces.push(f)
        }
      }
    }
    return {
      count: xs.length,
      xs: Int16Array.from(xs),
      ys: Int16Array.from(ys),
      zs: Int16Array.from(zs),
      color: Uint8Array.from(color),
      faces: Uint8Array.from(faces),
      palette,
      lx: this.lx,
      ly: this.ly,
      lz: this.lz,
    }
  }
}
