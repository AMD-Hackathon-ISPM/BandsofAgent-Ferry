// Furnished room interiors for the ship cutaway — the Fallout-Shelter /
// Stardew read: themed back walls (warm wood-paneled cabins above deck,
// steel compartments in the hull) with grime dithering and rivets, windows
// congruent with the ship's real exterior glass bands spilling cool light
// beams onto the floor, plank floors with a lit surface edge, hanging warm
// lights with stepped glow cones, contact shadows under every piece of
// furniture, corner/ceiling shading for the semi-3D depth, detailed voxel
// furniture per room and a label chip on the ceiling.
//
// Two passes:
//   paintRoom            — baked once per zoom into the interior canvas.
//   drawInteriorAnimations — live overlay per frame (screen flicker and
//     scanlines, server LEDs, engine vent glow, steam, lamp flicker, sea
//     glints in the windows), driven by wall-clock time, stateless.
//
// One voxel cell = `zoom` px; furniture is authored at quarter-cell
// resolution (u = zoom / 4) — high-detail pixel art that still snaps to the
// ship's voxel grid.

import type { HullProfile } from "./hull-profile"
import { getHullProfile } from "./hull-profile"
import { ROOMS, type RoomDef } from "./rooms"
import { drawPixelText, pixelTextWidth, PIXEL_FONT_H } from "./pixel-font"

const CHIP_BG = "#0d142e"
const CHIP_BORDER = "#33416e"
const LABEL = "#d6deef"
const SKY = "#0d1834"
const SKY_HI = "#14254c"
const STAR = "#c6d0e6"
const STAR_DIM = "#5a6b94"
const GLOW = "232, 163, 61" // warm lamp light (#e8a33d), rgb for alpha fills
const MOON = "140, 180, 255" // cool window light
const BLOOM_SCREEN = "116, 224, 176" // soft bloom behind lit screens
const BLOOM_RED = "196, 87, 74" // vending / warning bloom

/** Rooms this short get a single-cell floor so furniture still fits. */
const SHALLOW_ROOM_H = 8

// ---------------------------------------------------------------------------
// Colors

const cssCache = new Map<string, string>()

export function resolveCssColor(varName: string, fallback: string): string {
  const hit = cssCache.get(varName)
  if (hit) return hit
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  const color = v || fallback
  cssCache.set(varName, color)
  return color
}

function hexChannel(hex: string, i: number): number {
  return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
}

/** Linear mix of two #rrggbb colors; non-hex inputs fall back to `a`. */
function mixHex(a: string, b: string, t: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(a) || !/^#[0-9a-fA-F]{6}$/.test(b)) return a
  const ch = (i: number) =>
    Math.round(hexChannel(a, i) + (hexChannel(b, i) - hexChannel(a, i)) * t)
  return `#${[0, 1, 2].map((i) => ch(i).toString(16).padStart(2, "0")).join("")}`
}

/** Deterministic 2D hash for grime/star placement. */
function hash2(x: number, z: number): number {
  let h = (x * 73856093) ^ (z * 19349663)
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

// ---------------------------------------------------------------------------
// Room material themes — warm wood cabins vs steel compartments, matching
// the reference shelter art where living spaces glow and machine spaces
// stay cold.

interface Theme {
  wallTop: string
  wallDado: string
  dadoTrim: string
  wallSeam: string
  grime: string
  rivet: string | null
  floorHi: string
  floor: string
  floorDark: string
  floorSeam: string
}

const WARM: Theme = {
  wallTop: "#5b4938",
  wallDado: "#463629",
  dadoTrim: "#6f5a44",
  wallSeam: "#4d3d2e",
  grime: "#3c2f22",
  rivet: null,
  floorHi: "#5a4430",
  floor: "#3e2f21",
  floorDark: "#281d12",
  floorSeam: "#2e2215",
}

const STEEL: Theme = {
  wallTop: "#3c4866",
  wallDado: "#2f3a54",
  dadoTrim: "#4c5c82",
  wallSeam: "#34405c",
  grime: "#2a3450",
  rivet: "#566797",
  floorHi: "#46547e",
  floor: "#2b3554",
  floorDark: "#1b2340",
  floorSeam: "#202a48",
}

function roomTheme(room: RoomDef): Theme {
  // Hull compartments and the instrument-packed bridge read as steel; the
  // cabin decks read as warm wood.
  if (room.z0 < 18 || room.z0 >= 51) return STEEL
  return WARM
}

// ---------------------------------------------------------------------------
// Sprites — quarter-cell voxel art. Legend (shared palette):
//   K outline   d dark      m steel     M steel lt  h steel hi  c light
//   e near-white
//   w wood      W wood lt   v wood dk   u wood hi   n linen
//   g screen    G screen dk f screen hi
//   y warm      Y warm hi   o orange    O orange dk r red       R red dk
//   b indigo    B indigo dk p plant     P plant dk  t teal      T teal dk
//   A room accent           a room accent, dark

const SPRITE_PALETTE: Record<string, string> = {
  K: "#0a0f1f",
  d: "#1a2336",
  m: "#2e3c5e",
  M: "#4a5b85",
  h: "#7e8cab",
  c: "#c6d0e6",
  e: "#e8edf8",
  w: "#6a4a2f",
  W: "#8a6342",
  v: "#46301d",
  u: "#a87b50",
  n: "#d9c9a8",
  g: "#74e0b0",
  G: "#143830",
  f: "#aef0d0",
  y: "#f2c14e",
  Y: "#f7da8c",
  o: "#d98c4a",
  O: "#b06530",
  r: "#c4574a",
  R: "#8a3a30",
  b: "#4f6bff",
  B: "#31407c",
  p: "#5fae6e",
  P: "#356e44",
  t: "#6fb3c9",
  T: "#2f6275",
  S: "#0d1834", // night sky through glass
}

const SPRITES: Record<string, string[]> = {
  // --- Bridge ---------------------------------------------------------------
  bridgescreens: [
    "KKKKKKKKKK.KKKKKKKKKK.KKKKKKKKKK",
    "KfgggggggK.KfgggggggK.KfgggggggK",
    "KggGGGgggK.KgggggGGgK.KgGGgggggK",
    "KgGgggGggK.KgGGGggggK.KggggGGggK",
    "KgggggggGK.KggggggggK.KgggGgggGK",
    "KGGGGGGGGK.KGGGGGGGGK.KGGGGGGGGK",
    "KKKKKKKKKK.KKKKKKKKKK.KKKKKKKKKK",
  ],
  console: [
    "..KKKKKK..........KKKKKK......",
    "..KfgggK..........KfgggK......",
    "..KgGGgK..........KggGgK......",
    "..KKKKKK..........KKKKKK......",
    "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
    "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm",
    "mdyddbddgddrddyddbddgddrddyddm",
    "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm",
    "KddddddddddddddddddddddddddddK",
    ".KKd......................dKK.",
    ".KKd......................dKK.",
  ],
  wheel: [
    ".....KK.....",
    "...KKWWKK...",
    "..KWw..wWK..",
    ".KW..ww..WK.",
    ".KW.wwww.WK.",
    "KW..wWWw..WK",
    "KW..wWWw..WK",
    ".KW.wwww.WK.",
    ".KW..ww..WK.",
    "..KWw..wWK..",
    "...KKWWKK...",
    ".....KK.....",
    "....KddK....",
    "..KKKKKKKK..",
  ],
  captainchair: [
    "..KAAAK...",
    ".KAaaaAK..",
    ".KAaaaAK..",
    ".KAaaaAK..",
    ".KAaaaAK..",
    ".KAAAAAK..",
    ".KaaaaaKK.",
    ".KAAAAAAK.",
    "..KKdKK...",
    "...KdK....",
    "..KdddK...",
    ".KKKKKKK..",
  ],
  radarscope: [
    ".KKKKKKKK.",
    ".KGGGGGGK.",
    ".KGggGGGK.",
    ".KGgfgGGK.",
    ".KGGgGgGK.",
    ".KGGGGgGK.",
    ".KKKKKKKK.",
    "....KK....",
    "....KK....",
    "...KddK...",
    "..KKKKKK..",
  ],
  throttle: [
    "..Ky..Kr..",
    "..Kh..Kh..",
    "..Kh..Kh..",
    ".KKKKKKKK.",
    ".KmmmmmmK.",
    ".KmMmmMmK.",
    ".KKKKKKKK.",
    "..KddddK..",
  ],
  switchpanel: [
    "KKKKKKKKKKKKKKKKKK",
    "KmymbmgmrmymbmgmrK",
    "KhmhmhmhmhmhmhmhmK",
    "KKKKKKKKKKKKKKKKKK",
  ],
  porthole: [
    "...KKKKKK...",
    "..KMhhhhMK..",
    ".KMKKKKKKMK.",
    ".KhKSSSSKhK.",
    "KMKSSSScSKMK",
    "KMKSSSSSSKMK",
    "KMKScSSSSKMK",
    ".KhKSSSSKhK.",
    ".KMKKKKKKMK.",
    "..KMhhhhMK..",
    "...KKKKKK...",
  ],

  // --- Chart room -------------------------------------------------------------
  maptable: [
    ".KKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
    "KunnnnnnnnnnnnnnnnnnnnnnnnnnuK",
    "KunbbbnnpPnnbbbbnnAAnnbbnnonuK",
    "KunnnbbnnnnbbnnbbnnnAnnnnnnnuK",
    "KuWWWWWWWWWWWWWWWWWWWWWWWWWWuK",
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    "..KwwK................KwwK....",
    "..KwwK................KwwK....",
    "..KvvK................KvvK....",
    ".KKKKK...............KKKKK....",
  ],
  chartwall: [
    "KKKKKKKKKKKKKKKKKKKKKKKK",
    "KwwwwwwwwwwwwwwwwwwwwwwK",
    "KwnnnnnnnnnnnnnnnnnnnnwK",
    "KwnbbbnnpPnnbbnnAAnbbnwK",
    "KwnnbbbnnnnbbnnnbbnnnnwK",
    "KwnpPnnbbbnnnnnbbbnnonwK",
    "KwnnnnnnnnnnnnnnnnnnnnwK",
    "KwwwwwwwwwwwwwwwwwwwwwwK",
    "KKKKKKKKKKKKKKKKKKKKKKKK",
  ],
  desk: [
    ".KyY................",
    ".KdK................",
    ".KdK.......KccK.....",
    "uuuuuuuuuuuuuuuuuuuu",
    "WWWWWWWWWWWWWWWWWWWW",
    "KKKKKKKKKKKKKKKKKKKK",
    ".KwwwwKK....KKwwwwK.",
    ".KwddwKK....KKwddwK.",
    ".KwwwwKK....KKwwwwK.",
    ".KvvvvKK....KKvvvvK.",
    ".KKKKKKK....KKKKKKK.",
  ],
  globe: [
    "...KKKK...",
    "..KbBBbK..",
    ".KbpbbBbK.",
    ".KBbpbbBK.",
    ".KbbBpbbK.",
    "..KbBBbK..",
    "...KKKK...",
    "....KK....",
    "...KwwK...",
    "..KwwwwK..",
    ".KKKKKKKK.",
  ],
  wallclock: [
    "..KKKK..",
    ".KccccK.",
    "KcccKccK",
    "KccKKccK",
    "KccccccK",
    ".KccccK.",
    "..KKKK..",
  ],

  // --- Lounge / shared ---------------------------------------------------------
  bookshelf: [
    "KKKKKKKKKKKKKKKK",
    "KwwwwwwwwwwwwwwK",
    "KwbrAcbBorcAbpwK",
    "KwbrAcbBorcAbpwK",
    "KwbrAcbBorcAbpwK",
    "KwwwwwwwwwwwwwwK",
    "KwcAbobrBcpAbrwK",
    "KwcAbobrBcpAbrwK",
    "KwcAbobrBcpAbrwK",
    "KwwwwwwwwwwwwwwK",
    "KwoBcbAbrcbApbwK",
    "KwoBcbAbrcbApbwK",
    "KwoBcbAbrcbApbwK",
    "KwwwwwwwwwwwwwwK",
    "KwAbrcpbBobcrAwK",
    "KwAbrcpbBobcrAwK",
    "KwAbrcpbBobcrAwK",
    "KwwwwwwwwwwwwwwK",
    "KvvvvvvvvvvvvvvK",
    "KKKKKKKKKKKKKKKK",
  ],
  sofa: [
    ".KAAAAAAAAAAAAAAAAAAAAAAAAK.",
    "KAaAAAAAAAAAAAAAAAAAAAAAAaAK",
    "KAaAAAAAAAAaAAAAAAAAaAAAAaAK",
    "KAaAAAAAAAAaAAAAAAAAaAAAAaAK",
    "KAAaaaaaaaaaaaaaaaaaaaaaaAAK",
    "KAAaaaaaaaaaaaaaaaaaaaaaaAAK",
    "KAAAAAAAAAAAAAAAAAAAAAAAAAAK",
    "KAAAAAAAAAAAAAAAAAAAAAAAAAAK",
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    ".KvvK..................KvvK.",
    ".KKKK..................KKKK.",
  ],
  armchair: [
    ".KAAAAAAAK..",
    "KAaAAAAAaAK.",
    "KAaAAAAAaAK.",
    "KAAaaaaaAAK.",
    "KAAaaaaaAAK.",
    "KAAAAAAAAAK.",
    "KKKKKKKKKKK.",
    ".KvK....KvK.",
    ".KKK....KKK.",
  ],
  coffeetable: [
    "....KcyK......",
    "KKKKKKKKKKKKKK",
    "KuuuuuuuuuuuuK",
    "KKKKKKKKKKKKKK",
    ".Kw........wK.",
    ".Kw........wK.",
    ".KK........KK.",
  ],
  floorlamp: [
    ".KKKKKK.",
    "KyYYYYyK",
    "KyYYYYyK",
    ".KyyyyK.",
    "..KKKK..",
    "...Kd...",
    "...Kd...",
    "...Kd...",
    "...Kd...",
    "...Kd...",
    "...Kd...",
    "...Kd...",
    "...Kd...",
    "...Kd...",
    "..KddK..",
    ".KKKKKK.",
  ],
  rug: [
    "OooooooooooooooooooooooooooO",
    "oAAooaaooAAooaaooAAooaaooAAo",
    "OooooooooooooooooooooooooooO",
  ],
  picture: [
    "KKKKKKKKKKKK",
    "KuuuuuuuuuuK",
    "KuttttbbttuK",
    "KunnnbbnnnuK",
    "KuTttttttTuK",
    "KuTTttTTtTuK",
    "KuuuuuuuuuuK",
    "KKKKKKKKKKKK",
  ],
  plant: [
    "....pp....",
    "..pPppPp..",
    ".pPpppppP.",
    "..ppPppp..",
    ".Pp.pp.pP.",
    "....pp....",
    "...KooK...",
    "..KooooK..",
    "..KooooK..",
    "..KOooOK..",
    "...KKKK...",
  ],

  // --- Mess hall ----------------------------------------------------------------
  counter: [
    ".KKKK......KccK.........",
    ".KmmK......KccK.........",
    ".KmyK...................",
    "hhhhhhhhhhhhhhhhhhhhhhhh",
    "MMMMMMMMMMMMMMMMMMMMMMMM",
    "mmmmmmmmmmmmmmmmmmmmmmmm",
    "mKmmmmKmmKmmmmKmmKmmmmKm",
    "mKmmmmKmmKmmmmKmmKmmmmKm",
    "mKmddmKmmKmddmKmmKmddmKm",
    "mKmmmmKmmKmmmmKmmKmmmmKm",
    "mmmmmmmmmmmmmmmmmmmmmmmm",
    "KKKKKKKKKKKKKKKKKKKKKKKK",
  ],
  shelfbottles: [
    "KKKKKKKKKKKKKKKKKKKK",
    "Kw.bK.gK.rK.yK.tK.wK",
    "Kw.bK.gK.rK.yK.tK.wK",
    "KwwwwwwwwwwwwwwwwwwK",
    "Kw.oK.tK.bK.gK.rK.wK",
    "Kw.oK.tK.bK.gK.rK.wK",
    "KwwwwwwwwwwwwwwwwwwK",
    "KKKKKKKKKKKKKKKKKKKK",
  ],
  diningset: [
    "......KccK....KyyK..........",
    "....KKKKKKKKKKKKKKKKKKKK....",
    "....KuuuuuuuuuuuuuuuuuuK....",
    "....KWWWWWWWWWWWWWWWWWWK....",
    "....KKKKKKKKKKKKKKKKKKKK....",
    "......KwwK........KwwK......",
    "KKKKK.KwwK........KwwK.KKKKK",
    "KuuuK.KwwK........KwwK.KuuuK",
    "KKKKK.KvvK........KvvK.KKKKK",
    ".KwK..KKKK........KKKK..KwK.",
    ".KwK....................KwK.",
    ".KKK....................KKK.",
  ],
  vending: [
    "KKKKKKKKKKKK",
    "KrrrrrrrrrrK",
    "KrcccrrcccrK",
    "KrrrrrrrrrrK",
    "KdddddddKrrK",
    "KdyKbKgdKrrK",
    "KdddddddKrbK",
    "KdoKcKydKrrK",
    "KdddddddKrbK",
    "KdbKgKodKrrK",
    "KdddddddKrrK",
    "KdyKoKbdKrbK",
    "KdddddddKrrK",
    "KKKKKKKKKrrK",
    "KrrrrrrrrrrK",
    "KrKKKKKrrrrK",
    "KrKdddKrrrrK",
    "KrKKKKKrrrrK",
    "KrrrrrrrrrrK",
    "KRRRRRRRRRRK",
    "KKKKKKKKKKKK",
    ".KK......KK.",
  ],
  menuboard: [
    "KKKKKKKKKKKKKKKK",
    "KwwwwwwwwwwwwwwK",
    "KwddddddddddddwK",
    "KwdccdcdccdcddwK",
    "KwddddddddddddwK",
    "KwdcdccdcdccddwK",
    "KwddddddddddddwK",
    "KwwwwwwwwwwwwwwK",
    "KKKKKKKKKKKKKKKK",
  ],

  // --- Crew quarters ---------------------------------------------------------------
  bunk: [
    "Kv......................vK",
    "Kv......................vK",
    "KvccnAAAAAAAAAAAAAAAAAAAvK",
    "KvWWWWWWWWWWWWWWWWWWWWWWvK",
    "Kv....................hhvK",
    "Kv....................hhvK",
    "Kv....................hhvK",
    "Kv....................hhvK",
    "Kv....................hhvK",
    "KvccnAAAAAAAAAAAAAAAAAhhvK",
    "KvWWWWWWWWWWWWWWWWWWWWhhvK",
    "Kv....................hhvK",
    "Kv....................hhvK",
    "Kv......................vK",
    "KKKKKKKKKKKKKKKKKKKKKKKKKK",
  ],
  locker: [
    "KKKKKKKKKK",
    "KMmmmmmmMK",
    "KmhhhhhhmK",
    "KmhhhhhhmK",
    "KmmmmmmmmK",
    "KmmmKdmmmK",
    "KmmmmmmmmK",
    "KmmmmmmmmK",
    "KmmmmmmmmK",
    "KmmmmmmmmK",
    "KmmmmmmmmK",
    "KmmmmmmmmK",
    "KMmmmmmmMK",
    "KKKKKKKKKK",
    ".KK....KK.",
  ],

  // --- Engine room ----------------------------------------------------------------
  engine: [
    "....KMMK......KMMK......KMMK......KMMK......",
    "....KMMK......KMMK......KMMK......KMMK......",
    "....KMMK......KMMK......KMMK......KMMK......",
    "..KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK...",
    ".KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMK..",
    ".KmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmK..",
    ".KmyYymmhhmmyYymmhhmmyYymmhhmmyYymmhhmmmmK..",
    ".KmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmK..",
    ".KmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmK..",
    ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK..",
    ".KmmKooooKmmKooooKmmKooooKmmKooooKmmmmmmmK..",
    ".KmmKoYYoKmmKoYYoKmmKoYYoKmmKoYYoKmmmmmmmK..",
    ".KmmKoYYoKmmKoYYoKmmKoYYoKmmKoYYoKmmmmmmmK..",
    ".KmmKooooKmmKooooKmmKooooKmmKooooKmmmmmmmK..",
    ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK..",
    ".KddddddddddddddddddddddddddddddddddddddK..",
    ".KddddddddddddddddddddddddddddddddddddddK..",
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
  ],
  gaugewall: [
    "KKKKKKKKKKKKKKKKKK",
    "KmKyyKmKggKmKbbKmK",
    "KmKYyKmKfgKmKbBKmK",
    "KKKKKKKKKKKKKKKKKK",
    "KmhmmhmmhmmhmmhmmK",
    "KmmmmmmmmmmmmmmmmK",
    "KKKKKKKKKKKKKKKKKK",
  ],
  pipesrun: [
    "hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh",
    "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
    "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm",
    "...KK.......KK.......KK.......KK",
    "...hh.......hh.......hh.......hh",
  ],
  ventduct: [
    "KKKKKKKKKKKKKKKK",
    "KMMMMMMMMMMMMMMK",
    "KmKmKmKmKmKmKmmK",
    "KmKmKmKmKmKmKmmK",
    "KKKKKKKKKKKKKKKK",
  ],
  tank: [
    "..KKKKKKKK..",
    ".KMMMMMMMMK.",
    "KMmmmmmmmmMK",
    "KmmmmmmmmmmK",
    "KmmyYmmmmmmK",
    "KmmmmmmmmmmK",
    "KBBBBBBBBBBK",
    "KmmmmmmmmmmK",
    "KmmmmmmmmmmK",
    "KBBBBBBBBBBK",
    "KmmmmmmmmmmK",
    ".KMmmmmmmMK.",
    "..KKKKKKKK..",
    "...KK..KK...",
  ],
  barrel: [
    ".KKKKKK.",
    "KMmmmmMK",
    "KBBBBBBK",
    "KmmMmmmK",
    "KmmMmmmK",
    "KBBBBBBK",
    "KmmMmmmK",
    ".KKKKKK.",
  ],
  extinguisher: [
    "..KK..",
    ".KhK..",
    "..KK..",
    ".KrrK.",
    "KrRrrK",
    "KrrrrK",
    "KrRrrK",
    "KrrrrK",
    "KRRRRK",
    ".KKKK.",
  ],

  // --- Workshop ----------------------------------------------------------------------
  workbench: [
    "..KyK....KhhK.......KccK........",
    "..KyK....KhhK.......KccK........",
    "uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu",
    "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    ".KwwwwwwKK..........KKwwwwwwK...",
    ".KwddwwwKK..........KKwwwddwK...",
    ".KwwwwwwKK..........KKwwwwwwK...",
    ".KwwwwwwKK..........KKwwwwwwK...",
    ".KvvvvvvKK..........KKvvvvvvK...",
    ".KKKKKKKKK..........KKKKKKKKK...",
  ],
  toolwall: [
    "KKKKKKKKKKKKKKKKKKKK",
    "KwwwwwwwwwwwwwwwwwwK",
    "Kw.hh..h..yy..h.h.wK",
    "Kw.hh..h..y...h.h.wK",
    "Kw.....h......h...wK",
    "Kw.KK.....hh......wK",
    "KwwwwwwwwwwwwwwwwwwK",
    "KKKKKKKKKKKKKKKKKKKK",
  ],
  lathe: [
    "KKKKKK..........",
    "KMmmmK..........",
    "KmmmmKKKK.......",
    "KmmmmKmmK.......",
    "KKKKKKKmK.......",
    "......KmK.......",
    "......KhK.......",
    ".....KKKKK......",
    ".....KdddK......",
    "..KKKKKKKKKKK...",
    "..KMMMMMMMMMK...",
    "..KmmmmmmmmmK...",
    "..KKKKKKKKKKK...",
    "....KK...KK.....",
  ],
  cratestack: [
    "....KKKKKKKK......",
    "....KuWWWWuK......",
    "....KWwwwwWK......",
    "....KwWWWWwK......",
    "....KKKKKKKK......",
    "KKKKKKKK.KKKKKKKK.",
    "KuWWWWuK.KuWWWWuK.",
    "KWwwwwWK.KWwwwwWK.",
    "KWwwwwWK.KWwwwwWK.",
    "KwWWWWwK.KwWWWWwK.",
    "KKKKKKKK.KKKKKKKK.",
  ],
  crate: [
    "KKKKKKKKKK",
    "KuWWWWWWuK",
    "KWwwwwwwWK",
    "KWwwddwwWK",
    "KWwwwwwwWK",
    "KwWWWWWWwK",
    "KKKKKKKKKK",
  ],

  // --- Test bay --------------------------------------------------------------------
  monitorwall: [
    "KKKKKKKKKKKKK.KKKKKKKKKKKKK.",
    "KfggggggggggK.KfggggggggggK.",
    "KggGGGggggggK.KgggggGGGgggK.",
    "KggggggGGgggK.KgGGggggggggK.",
    "KgGGggggggggK.KggggggGGGggK.",
    "KggggggggggGK.KggggggggggGK.",
    "KGGGGGGGGGGGK.KGGGGGGGGGGGK.",
    "KKKKKKKKKKKKK.KKKKKKKKKKKKK.",
    "......KK.........KK.........",
    "......KK.........KK.........",
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    "KMMMMMMMMMMMMMMMMMMMMMMMMMMK",
    "KmmmmmmmmmmmmmmmmmmmmmmmmmmK",
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    ".KK......................KK.",
  ],
  testpod: [
    "KKKKK.............",
    "KmmmKKKK..........",
    "KmmmKmmKKK........",
    "KKKKKKmKmmK.......",
    "......KKKmK.......",
    ".........KK.......",
    "........Kg........",
    "....KKKKKKKKKK....",
    "...KKggggggggKK...",
    "...KgffggggggKK...",
    "...KggggggggggK...",
    "...KggKddKggggK...",
    "...KggKddKggggK...",
    "...KggggggggggK...",
    "...KKKKKKKKKKKK...",
    "...KmmKKKKKKmmK...",
    "...KKK......KKK...",
  ],
  serverrack: [
    "KKKKKKKKKKKK",
    "KMmmmmmmmmMK",
    "KmKKKKKKKKmK",
    "KmKgKyKrKKmK",
    "KmKKKKKKKKmK",
    "KmKyKgKbKKmK",
    "KmKKKKKKKKmK",
    "KmKrKgKyKKmK",
    "KmKKKKKKKKmK",
    "KmKgKbKgKKmK",
    "KmKKKKKKKKmK",
    "KmKyKrKgKKmK",
    "KmKKKKKKKKmK",
    "KmmmmmmmmmmK",
    "KKKKKKKKKKKK",
    ".KK......KK.",
  ],
}

/** Sprite kinds whose screens flicker / scan in the live overlay. */
const SCREEN_KINDS = new Set([
  "bridgescreens",
  "console",
  "monitorwall",
  "radarscope",
])

/** Sprite kinds that get a soft bloom halo baked behind them. */
const BLOOM_KINDS: Record<string, string> = {
  bridgescreens: BLOOM_SCREEN,
  console: BLOOM_SCREEN,
  monitorwall: BLOOM_SCREEN,
  radarscope: BLOOM_SCREEN,
  gaugewall: BLOOM_SCREEN,
  serverrack: BLOOM_SCREEN,
  testpod: BLOOM_SCREEN,
  maptable: BLOOM_SCREEN,
  vending: BLOOM_RED,
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  u: number,
  accent: string,
  accentDark: string
) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const y0 = y + Math.round(r * u)
    const y1 = y + Math.round((r + 1) * u)
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch === ".") continue
      const color =
        ch === "A" ? accent : ch === "a" ? accentDark : SPRITE_PALETTE[ch]
      if (!color) continue
      const x0 = x + Math.round(c * u)
      const x1 = x + Math.round((c + 1) * u)
      ctx.fillStyle = color
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    }
  }
}

function spriteWidth(rows: string[]): number {
  let w = 0
  for (const r of rows) w = Math.max(w, r.length)
  return w
}

// ---------------------------------------------------------------------------
// Window bands — kept congruent with the exterior glass painted in
// ferry-model.ts, so the interior windows sit exactly behind the real ones.

interface WindowBand {
  z0: number
  z1: number
  glassAt: (x: number) => boolean
}

function windowBand(room: RoomDef): WindowBand | null {
  // Tier-1 cabin rooms (lounge, mess, quarters).
  if (room.z0 >= 18 && room.z1 <= 32)
    return { z0: 24, z1: 29, glassAt: (x) => x % 9 >= 3 }
  // Tier-2 chart room.
  if (room.z0 >= 36 && room.z1 <= 47)
    return { z0: 39, z1: 44, glassAt: (x) => (x + 4) % 9 >= 3 }
  // Wheelhouse.
  if (room.z0 >= 51) return { z0: 54, z1: 58, glassAt: (x) => x % 8 >= 1 }
  return null // hull rooms have no glass below the deck
}

// ---------------------------------------------------------------------------
// Room painting

type Region = (x: number, z: number) => boolean

export function floorHeight(room: RoomDef): number {
  return room.z1 - room.z0 + 1 <= SHALLOW_ROOM_H ? 1 : 2
}

/** How many hanging lamps a room gets. */
function lampCount(room: RoomDef): number {
  return Math.max(1, Math.round((room.x1 - room.x0 + 1) / 13))
}

/** Clip path covering the room's occupied cells (handles the bow taper). */
function roomClipPath(
  region: Region,
  room: RoomDef,
  cellX: (x: number) => number,
  cellY: (z: number) => number,
  zoom: number
): Path2D {
  const path = new Path2D()
  for (let z = room.z0; z <= room.z1; z++) {
    let run = -1
    for (let x = room.x0; x <= room.x1 + 1; x++) {
      const inside = x <= room.x1 && region(x, z)
      if (inside && run < 0) run = x
      if (!inside && run >= 0) {
        path.rect(cellX(x - 1), cellY(z), (x - run) * zoom, zoom)
        run = -1
      }
    }
  }
  return path
}

export function paintRoom(
  ctx: CanvasRenderingContext2D,
  p: HullProfile,
  room: RoomDef,
  zoom: number
) {
  const occ = (x: number, z: number) =>
    x >= 0 && x < p.lx && z >= 0 && z < p.lz && p.occupancy[z * p.lx + x] === 1
  const region: Region = (x, z) =>
    x >= room.x0 && x <= room.x1 && z >= room.z0 && z <= room.z1 && occ(x, z)
  const cellX = (x: number) => (p.lx - 1 - x) * zoom // bow on the left
  const cellY = (z: number) => (p.lz - 1 - z) * zoom

  const accent = resolveCssColor(room.accentVar ?? "", "#4f6bff")
  const accentDark = mixHex(accent, "#1a2336", 0.55)
  const theme = roomTheme(room)
  const wallTop = mixHex(theme.wallTop, accent, 0.06)
  const wallGrimeHi = mixHex(wallTop, "#e8edf8", 0.07)
  const floorH = floorHeight(room)
  const floorTopZ = room.z0 + floorH // first wall row above the floor
  const roomH = room.z1 - room.z0 + 1
  const wallRows = roomH - floorH
  const dadoRows = Math.max(1, Math.floor(wallRows / 3))
  const u = zoom / 4
  const sub = Math.max(1, Math.round(u))

  // Back wall: upper field + darker dado panel with a trim line, with sparse
  // grime/highlight dithering so big walls don't read flat.
  for (let z = floorTopZ; z <= room.z1; z++) {
    const inDado = z < floorTopZ + dadoRows
    for (let x = room.x0; x <= room.x1; x++) {
      if (!region(x, z)) continue
      const cx = cellX(x)
      const cy = cellY(z)
      ctx.fillStyle = inDado ? theme.wallDado : wallTop
      ctx.fillRect(cx, cy, zoom, zoom)
      const h = hash2(x, z)
      if (h % 11 === 0) {
        ctx.fillStyle = theme.grime
        ctx.fillRect(cx + (h % 3) * sub, cy + ((h >> 2) % 3) * sub, sub, sub)
      } else if (h % 23 === 1 && !inDado) {
        ctx.fillStyle = wallGrimeHi
        ctx.fillRect(cx + ((h >> 4) % 3) * sub, cy + (h % 3) * sub, sub, sub)
      }
      if (z === floorTopZ + dadoRows - 1) {
        ctx.fillStyle = theme.dadoTrim
        ctx.fillRect(cx, cy, zoom, sub)
      }
    }
  }

  // Wall texture: vertical panel seams; steel rooms also get rivet rows.
  ctx.fillStyle = theme.wallSeam
  for (let x = room.x0 + 3; x <= room.x1 - 1; x += 6) {
    for (let z = floorTopZ + dadoRows; z <= room.z1 - 1; z++) {
      if (region(x, z)) ctx.fillRect(cellX(x) + zoom - 1, cellY(z), 1, zoom)
    }
  }
  if (theme.rivet) {
    ctx.fillStyle = theme.rivet
    for (const z of [room.z1 - 1, floorTopZ + dadoRows]) {
      for (let x = room.x0 + 1; x <= room.x1 - 1; x += 3) {
        if (region(x, z)) ctx.fillRect(cellX(x) + sub, cellY(z) + sub, 1, 1)
      }
    }
  }

  // Windows behind the real exterior glass band: night sky over a moonlit
  // sea, with a light sill line underneath.
  const band = windowBand(room)
  if (band) {
    const sill = mixHex(theme.wallTop, "#e8edf8", 0.35)
    for (let x = room.x0 + 1; x <= room.x1 - 1; x++) {
      if (!band.glassAt(x)) continue
      for (
        let z = Math.max(band.z0, floorTopZ);
        z <= Math.min(band.z1, room.z1);
        z++
      ) {
        if (!region(x, z)) continue
        const cx = cellX(x)
        const cy = cellY(z)
        // Open night sky, faintly brighter toward the bottom of the pane.
        ctx.fillStyle = z <= band.z0 + 1 ? SKY_HI : SKY
        ctx.fillRect(cx, cy, zoom, zoom)
        const h = hash2(x, z)
        if ((x * 7 + z * 13) % 17 === 0) {
          ctx.fillStyle = STAR
          ctx.fillRect(cx + 2 * sub, cy + sub, 1, 1)
        } else if (h % 9 === 0) {
          ctx.fillStyle = STAR_DIM
          ctx.fillRect(cx + (h % 3) * sub, cy + ((h >> 2) % 3) * sub, 1, 1)
        }
      }
      const sillZ = band.z0 - 1
      if (sillZ >= floorTopZ && region(x, sillZ)) {
        ctx.fillStyle = sill
        ctx.fillRect(cellX(x), cellY(sillZ), zoom, sub)
      }
    }
  }

  // Floor: lit surface row with plank seams, body, dark base row, grime.
  for (let z = room.z0; z < floorTopZ; z++) {
    for (let x = room.x0; x <= room.x1; x++) {
      if (!region(x, z)) continue
      const cx = cellX(x)
      const cy = cellY(z)
      ctx.fillStyle = z === room.z0 && floorH > 1 ? theme.floorDark : theme.floor
      ctx.fillRect(cx, cy, zoom, zoom)
      if (z === floorTopZ - 1) {
        // Lit top surface of the floor.
        ctx.fillStyle = theme.floorHi
        ctx.fillRect(cx, cy, zoom, Math.max(2, 2 * sub))
        // Staggered plank seams.
        if ((x + (z % 2) * 2) % 4 === 0) {
          ctx.fillStyle = theme.floorSeam
          ctx.fillRect(cx, cy, 1, zoom)
        }
      } else if ((x + 2) % 4 === 0) {
        ctx.fillStyle = theme.floorSeam
        ctx.fillRect(cx, cy, 1, zoom)
      }
      const h = hash2(x + 311, z)
      if (h % 13 === 0) {
        ctx.fillStyle = theme.floorSeam
        ctx.fillRect(cx + (h % 4) * sub, cy + ((h >> 3) % 3) * sub, sub, sub)
      }
    }
  }

  const clip = roomClipPath(region, room, cellX, cellY, zoom)
  ctx.save()
  ctx.clip(clip)

  const roomLeft = cellX(room.x1)
  const roomRight = cellX(room.x0) + zoom
  const floorTopY = cellY(floorTopZ - 1)
  const ceilY = cellY(room.z1)
  const w = room.x1 - room.x0 + 1

  // Ceiling fascia: a solid recessed band under the deck above.
  ctx.fillStyle = mixHex(theme.wallTop, "#05070f", 0.45)
  ctx.fillRect(roomLeft, ceilY, roomRight - roomLeft, Math.floor(zoom / 2))

  // Hull rooms get portholes with the night sea behind them, and a sagging
  // cable run along the upper wall (cabin rooms have real windows instead).
  if (!band) {
    const portholes = Math.max(1, Math.round(w / 12))
    const phRows = SPRITES.porthole
    const phH = Math.round(phRows.length * u)
    const phY =
      ceilY + Math.round((floorTopY - ceilY) * 0.32) - Math.round(phH / 2)
    for (let i = 0; i < portholes; i++) {
      const fx = room.x0 + ((i + 1) * w) / (portholes + 1)
      const px = cellX(Math.round(fx)) - Math.round((spriteWidth(phRows) * u) / 2)
      drawSprite(ctx, phRows, px, phY, u, accent, accentDark)
    }
    ctx.fillStyle = "#141c33"
    const cableY = ceilY + Math.floor(zoom * 1.1)
    const span = 6 * zoom
    for (let sx = roomLeft + zoom; sx < roomRight - zoom; sx += sub) {
      const ph = ((sx - roomLeft) % span) / span
      const sag = Math.round(Math.sin(ph * Math.PI) * 2.5 * sub)
      ctx.fillRect(sx, cableY + sag, sub, Math.max(1, sub))
    }
  }

  // Cool moonlight beams falling inward from each window run onto the floor.
  if (band) {
    let runStart = -1
    for (let x = room.x0; x <= room.x1 + 1; x++) {
      const glass = x <= room.x1 && band.glassAt(x) && region(x, band.z0)
      if (glass && runStart < 0) runStart = x
      if (!glass && runStart >= 0) {
        const runEnd = x - 1
        const bx = cellX(runEnd)
        const bw = (runEnd - runStart + 1) * zoom
        const beamTop = cellY(band.z0 - 1)
        const beamH = floorTopY - beamTop
        const widen = [0, 1, 2]
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = `rgba(${MOON}, ${[0.055, 0.04, 0.028][k]})`
          ctx.fillRect(
            bx - widen[k] * Math.floor(zoom / 2),
            beamTop + Math.floor((beamH * k) / 3),
            bw + widen[k] * zoom,
            Math.ceil(beamH / 3)
          )
        }
        ctx.fillStyle = `rgba(${MOON}, 0.07)`
        ctx.fillRect(bx - zoom, floorTopY, bw + 2 * zoom, floorH * zoom - 1)
        runStart = -1
      }
    }
  }

  // Hanging warm lights with stepped glow cones and a floor pool.
  const lights = lampCount(room)
  for (let i = 0; i < lights; i++) {
    const fx = room.x0 + ((i + 1) * w) / (lights + 1)
    const fxPx = cellX(Math.round(fx)) + Math.floor(zoom / 2)
    const fy = ceilY + Math.floor(zoom / 2)
    // Stem and shade: bright core, warm rim.
    ctx.fillStyle = "#1a2336"
    ctx.fillRect(fxPx - 1, fy, 2, 2 * sub)
    ctx.fillStyle = SPRITE_PALETTE.y
    ctx.fillRect(fxPx - zoom, fy + 2 * sub, zoom * 2, 2 * sub)
    ctx.fillStyle = SPRITE_PALETTE.Y
    ctx.fillRect(fxPx - Math.floor(zoom / 2), fy + 2 * sub, zoom, sub)
    const coneTop = fy + 4 * sub
    const poolH = floorTopY - coneTop
    const widths = [2.5, 4.5, 6.5]
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgba(${GLOW}, ${[0.16, 0.11, 0.07][k]})`
      const gw = Math.floor(widths[k] * zoom)
      ctx.fillRect(
        fxPx - Math.floor(gw / 2),
        coneTop + Math.floor((poolH * k) / 3),
        gw,
        Math.ceil(poolH / 3)
      )
    }
    // Warm pool on the floor surface.
    ctx.fillStyle = `rgba(${GLOW}, 0.1)`
    const pw = Math.floor(7 * zoom)
    ctx.fillRect(fxPx - Math.floor(pw / 2), floorTopY, pw, floorH * zoom - 1)
  }

  // Furniture: lit pieces bloom softly, every piece grounded by a contact
  // shadow.
  for (const prop of room.props ?? []) {
    const rows = SPRITES[prop.kind]
    if (!rows) continue
    const px = roomLeft + Math.round(prop.x * zoom)
    const bottomY = cellY(room.z0 + prop.z - 1)
    const topY = bottomY - Math.round(rows.length * u)
    const wPx = Math.round(spriteWidth(rows) * u)
    const hPx = bottomY - topY
    const bloom = BLOOM_KINDS[prop.kind]
    if (bloom) {
      ctx.fillStyle = `rgba(${bloom}, 0.05)`
      ctx.fillRect(px - 4 * sub, topY - 4 * sub, wPx + 8 * sub, hPx + 8 * sub)
      ctx.fillStyle = `rgba(${bloom}, 0.07)`
      ctx.fillRect(px - 2 * sub, topY - 2 * sub, wPx + 4 * sub, hPx + 4 * sub)
    }
    ctx.fillStyle = "rgba(4, 6, 14, 0.3)"
    ctx.fillRect(px - sub, bottomY - 2 * sub, wPx + 2 * sub, 3 * sub)
    drawSprite(ctx, rows, px, topY, u, accent, accentDark)
  }

  // Depth shading: dark inset at the side walls, shadow under the ceiling,
  // and a contact line where the wall meets the floor — the cheap semi-3D
  // read over walls and furniture alike.
  const roomPxH = cellY(room.z0 - 1) - ceilY
  ctx.fillStyle = "rgba(6, 9, 20, 0.22)"
  ctx.fillRect(roomLeft, ceilY, zoom, roomPxH)
  ctx.fillRect(roomRight - zoom, ceilY, zoom, roomPxH)
  ctx.fillStyle = "rgba(6, 9, 20, 0.1)"
  ctx.fillRect(roomLeft + zoom, ceilY, Math.floor(zoom / 2), roomPxH)
  ctx.fillRect(
    roomRight - zoom - Math.floor(zoom / 2),
    ceilY,
    Math.floor(zoom / 2),
    roomPxH
  )
  ctx.fillStyle = "rgba(6, 9, 20, 0.16)"
  ctx.fillRect(roomLeft, ceilY, roomRight - roomLeft, zoom)
  ctx.fillStyle = "rgba(4, 6, 14, 0.25)"
  ctx.fillRect(roomLeft, floorTopY - sub, roomRight - roomLeft, sub)

  // Corner vignette: the four corners fall off darker than the room center.
  const vw = Math.min(3 * zoom, Math.floor((roomRight - roomLeft) / 4))
  const vh = Math.min(2 * zoom, Math.floor(roomPxH / 3))
  const floorBotY = cellY(room.z0 - 1)
  for (const [cx, cy] of [
    [roomLeft, ceilY],
    [roomRight - vw, ceilY],
    [roomLeft, floorBotY - vh],
    [roomRight - vw, floorBotY - vh],
  ]) {
    ctx.fillStyle = "rgba(4, 6, 14, 0.12)"
    ctx.fillRect(cx, cy, vw, vh)
    ctx.fillStyle = "rgba(4, 6, 14, 0.08)"
    ctx.fillRect(cx, cy, Math.floor(vw / 2), Math.floor(vh / 2))
  }

  ctx.restore()

  // Compartment walls: 1-art-px edges wherever the region borders anything else.
  ctx.fillStyle = "#0e1730"
  for (let z = room.z0; z <= room.z1; z++) {
    for (let x = room.x0; x <= room.x1; x++) {
      if (!region(x, z)) continue
      const cx = cellX(x)
      const cy = cellY(z)
      if (!region(x + 1, z)) ctx.fillRect(cx, cy, 1, zoom) // bow side
      if (!region(x - 1, z)) ctx.fillRect(cx + zoom - 1, cy, 1, zoom)
      if (!region(x, z + 1)) ctx.fillRect(cx, cy, zoom, 1) // ceiling
      if (!region(x, z - 1)) ctx.fillRect(cx, cy + zoom - 1, zoom, 1)
    }
  }

  // Agent-hue accent strip along the inside of the ceiling.
  ctx.fillStyle = accent
  for (let x = room.x0; x <= room.x1; x++) {
    if (region(x, room.z1) && !region(x, room.z1 + 1)) {
      ctx.fillRect(cellX(x), cellY(room.z1) + 1, zoom, 2)
    }
  }

  // Label chip, centered along the ceiling — like the reference shelter art.
  const scale = zoom >= 9 ? 2 : 1
  const rw = w * zoom
  let label = room.label
  if (pixelTextWidth(label, scale) > rw - 10) label = label.split(" ")[0]
  const tw = pixelTextWidth(label, scale)
  if (tw <= rw - 8) {
    const pad = 2 * scale
    const chipW = tw + pad * 2
    const chipH = PIXEL_FONT_H * scale + pad * 2
    const chipX = roomLeft + Math.floor((rw - chipW) / 2)
    const chipY = ceilY + 4
    ctx.fillStyle = CHIP_BORDER
    ctx.fillRect(chipX - 1, chipY - 1, chipW + 2, chipH + 2)
    ctx.fillStyle = CHIP_BG
    ctx.fillRect(chipX, chipY, chipW, chipH)
    drawPixelText(ctx, label, chipX + pad, chipY + pad, LABEL, scale)
  }
}

// ---------------------------------------------------------------------------
// Live animation overlay — stateless, driven by wall-clock time, drawn over
// the baked interior every frame while the cutaway is revealed.

type AnchorKind =
  | "screen"
  | "leds"
  | "engineglow"
  | "steam"
  | "lamp"
  | "radar"
  | "gauges"

interface AnimAnchor {
  kind: AnchorKind
  x: number
  y: number
  w: number
  h: number
  seed: number
}

const anchorCache = new Map<number, AnimAnchor[]>()

function buildAnchors(zoom: number): AnimAnchor[] {
  const p = getHullProfile()
  const cellX = (x: number) => (p.lx - 1 - x) * zoom
  const cellY = (z: number) => (p.lz - 1 - z) * zoom
  const u = zoom / 4
  const anchors: AnimAnchor[] = []
  let seed = 0

  for (const room of ROOMS) {
    const floorH = floorHeight(room)
    const roomLeft = cellX(room.x1)
    const floorTopY = cellY(room.z0 + floorH - 1)
    const ceilY = cellY(room.z1)

    for (const prop of room.props ?? []) {
      const rows = SPRITES[prop.kind]
      if (!rows) continue
      const px = roomLeft + Math.round(prop.x * zoom)
      const bottomY = cellY(room.z0 + prop.z - 1)
      const topY = bottomY - Math.round(rows.length * u)
      const wPx = Math.round(spriteWidth(rows) * u)
      const hPx = bottomY - topY
      seed++
      if (SCREEN_KINDS.has(prop.kind)) {
        anchors.push({ kind: "screen", x: px, y: topY, w: wPx, h: hPx, seed })
        if (prop.kind === "radarscope") {
          // The scope circle is rows 1–6 of the sprite.
          seed++
          anchors.push({
            kind: "radar",
            x: px + Math.round(2 * u),
            y: topY + Math.round(1 * u),
            w: Math.round(6 * u),
            h: Math.round(5 * u),
            seed,
          })
        }
      } else if (prop.kind === "gaugewall") {
        anchors.push({ kind: "gauges", x: px, y: topY, w: wPx, h: hPx, seed })
      } else if (prop.kind === "serverrack") {
        anchors.push({ kind: "leds", x: px, y: topY, w: wPx, h: hPx, seed })
      } else if (prop.kind === "engine") {
        // Vent row (rows 10–13 of the sprite) pulses; pistons vent steam.
        const ventY = topY + Math.round(10 * u)
        anchors.push({
          kind: "engineglow",
          x: px,
          y: ventY,
          w: wPx,
          h: Math.round(4 * u),
          seed,
        })
        for (const cyl of [6, 16, 26, 36]) {
          seed++
          anchors.push({
            kind: "steam",
            x: px + Math.round(cyl * u),
            y: topY,
            w: Math.round(2 * u),
            h: Math.round(3 * u),
            seed,
          })
        }
      }
    }

    // Lamps flicker.
    const w = room.x1 - room.x0 + 1
    const lights = lampCount(room)
    for (let i = 0; i < lights; i++) {
      const fx = room.x0 + ((i + 1) * w) / (lights + 1)
      const fxPx = cellX(Math.round(fx)) + Math.floor(zoom / 2)
      const coneTop = ceilY + Math.floor(zoom / 2) + 4 * Math.max(1, Math.round(u))
      seed++
      anchors.push({
        kind: "lamp",
        x: fxPx - Math.floor(2.5 * zoom),
        y: coneTop,
        w: Math.floor(5 * zoom),
        h: Math.max(1, floorTopY - coneTop),
        seed,
      })
    }

  }
  return anchors
}

/**
 * Per-frame animation pass over the baked interior. (ox, oy) is where the
 * interior canvas was blitted; `t` is seconds; `alpha` follows the cutaway
 * reveal so effects fade in with the rooms.
 */
let reducedMotion: MediaQueryList | null = null

export function drawInteriorAnimations(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  zoom: number,
  t: number,
  alpha: number
) {
  if (!reducedMotion)
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  if (reducedMotion.matches) return

  let anchors = anchorCache.get(zoom)
  if (!anchors) {
    anchors = buildAnchors(zoom)
    anchorCache.set(zoom, anchors)
  }
  const u = Math.max(1, Math.round(zoom / 4))

  for (const a of anchors) {
    const x = ox + a.x
    const y = oy + a.y
    switch (a.kind) {
      case "screen": {
        const flicker = 0.04 + 0.03 * Math.sin(t * 6 + a.seed * 7)
        ctx.fillStyle = `rgba(127, 224, 176, ${flicker * alpha})`
        ctx.fillRect(x, y, a.w, a.h)
        const sweep = ((t * 0.22 + a.seed * 0.31) % 1) * a.h
        ctx.fillStyle = `rgba(174, 240, 208, ${0.1 * alpha})`
        ctx.fillRect(x, y + Math.floor(sweep), a.w, Math.max(1, u))
        break
      }
      case "leds": {
        const tick = Math.floor(t * 2.5) + a.seed * 13
        const rows = Math.max(1, Math.floor(a.h / (2 * u)))
        const offRow = tick % rows
        const onRow = (tick * 7 + 3) % rows
        ctx.fillStyle = `rgba(10, 15, 31, ${0.85 * alpha})`
        ctx.fillRect(x + 3 * u, y + offRow * 2 * u + u, 2 * u, u)
        ctx.fillStyle = `rgba(174, 240, 208, ${0.5 * alpha})`
        ctx.fillRect(x + 5 * u, y + onRow * 2 * u + u, 2 * u, u)
        break
      }
      case "engineglow": {
        const pulse = 0.08 + 0.07 * Math.sin(t * 3 + a.seed)
        ctx.fillStyle = `rgba(224, 140, 76, ${pulse * alpha})`
        ctx.fillRect(x, y, a.w, a.h)
        break
      }
      case "steam": {
        for (let k = 0; k < 2; k++) {
          const ph = (t / 1.7 + a.seed * 0.41 + k * 0.5) % 1
          const size = Math.max(1, Math.round(u * (1 + ph * 1.5)))
          const py = y - Math.round(ph * 5 * u)
          ctx.fillStyle = `rgba(200, 210, 230, ${0.16 * (1 - ph) * alpha})`
          ctx.fillRect(x + ((a.seed + k) % 2) * u, py, size, size)
        }
        break
      }
      case "lamp": {
        // Slow breathing pulse (the baked cone is ~0.9; this tops it to 1).
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.9 + a.seed * 2.3)
        ctx.fillStyle = `rgba(${GLOW}, ${0.035 * pulse * alpha})`
        ctx.fillRect(x, y, a.w, a.h)
        break
      }
      case "radar": {
        // Rotating sweep arm, drawn as stepped pixels from the scope center.
        const cx = x + a.w / 2
        const cy = y + a.h / 2
        const ang = t * 1.5 + a.seed
        const r = Math.min(a.w, a.h) / 2
        ctx.fillStyle = `rgba(174, 240, 208, ${0.7 * alpha})`
        const steps = Math.max(2, Math.floor(r))
        for (let k = 1; k <= steps; k++) {
          const rr = (k / steps) * r
          ctx.fillRect(
            Math.round(cx + Math.cos(ang) * rr),
            Math.round(cy + Math.sin(ang) * rr),
            1,
            1
          )
        }
        break
      }
      case "gauges": {
        // Needle wobble under the three dials of the gauge wall.
        const dialY = y + Math.round(a.h * 0.25)
        for (let k = 0; k < 3; k++) {
          const dx = x + Math.round(a.w * (0.2 + k * 0.31))
          const wob = Math.round(Math.sin(t * 2.1 + k * 1.9 + a.seed) * u)
          ctx.fillStyle = `rgba(10, 15, 31, ${0.8 * alpha})`
          ctx.fillRect(dx + wob, dialY, 1, 2 * u)
        }
        break
      }
    }
  }
}
