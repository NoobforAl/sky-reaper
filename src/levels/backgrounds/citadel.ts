/**
 * Iron Citadel base layout (round 6, #11): one coherent industrial grid shared by the background and the runner.
 *
 * Geometry (live game units, world-y `wy` grows upward, screen y = scrollY - wy):
 *  - a 128-unit runway down the middle of the field = the clear flying lane (no structures on it);
 *  - per side, vertical LINES on a 128-unit lattice x = cx +- (128 + 128 m), m = 0..M: the outermost one (M) is the
 *    perimeter wall, and on fields wide enough an avenue (road) splits the side into two plots;
 *  - horizontal lines every `BLOCK` (384) world units, alternating cross road (even j) and compound wall (odd j);
 *  - PLOTS are the rectangles between those lines (minus kerbs and a pipe run along the perimeter wall). Every
 *    stationary ground unit is snapped into a plot on a foundation pad (`snapStructure`), never onto a line, the
 *    runway, a helipad or another pad. Ground vehicles drive on the runway lanes / avenues (`snapLane`).
 * The background (index.ts) draws exactly these lines, plots, pads and helipads with the `cit_*` kit sprites
 * (procedural fallback without them). sanity.ts `checkCitadel()` replays the authored spawns through the snapper.
 *
 * Event-time only: the registry uses fixed typed arrays (no per-frame allocation); drawing reads it.
 */
import { GAME_W, PIXEL_SCALE } from "../../contracts";

export const CIT = {
  tile: 128,
  /** world-y between horizontal lines (3 tiles) */
  block: 384,
  runwayHalf: 64,
  roadHalf: 28,
  wallHalf: 12,
  /** clearance between a line edge and anything placed in a plot */
  kerb: 10,
  /** width reserved along the inside of the perimeter wall for the twin pipe run */
  pipeBand: 36,
  /** pad = unit footprint + this on every side (kit pads are >= 4 native px larger than the unit) */
  padMargin: 6,
  /** gap kept between two pads */
  padGap: 10,
  /** a structure may be pushed at most this far up the field (world units) to find a free plot spot */
  maxLift: 620,
  /** helipad size (cit_helipad 48 px native) */
  helipad: 96,
  /** share of plot blocks that hold a helipad */
  helipadChance: 0.3,
} as const;

/** small deterministic hash 0..1 (same as backgrounds hash2, duplicated to avoid an import cycle) */
function h2(a: number, b: number, seed: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export type PadKind = "s" | "m" | "l" | "hangar";

/** foundation pad kind + half size (game units) for a unit footprint (native px) */
export function padFor(w: number, h: number): { kind: PadKind; hw: number; hh: number } {
  const W = w * PIXEL_SCALE;
  const H = h * PIXEL_SCALE;
  if (w >= 40 && h < 40) return { kind: "hangar", hw: 56, hh: 40 };
  if (w >= 40) return { kind: "l", hw: 56, hh: 56 };
  if (Math.max(w, h) > 20) return { kind: "m", hw: Math.max(32, W / 2 + CIT.padMargin), hh: Math.max(32, H / 2 + CIT.padMargin) };
  return { kind: "s", hw: 24, hh: 24 };
}

const PAD_CAP = 96;

export class CitadelLayout {
  /** field centre x */
  readonly cx = GAME_W / 2;
  /** lattice index of the perimeter wall, and of the avenue (-1 = none) */
  readonly M: number;
  readonly avenue: number;
  /** plot x ranges on the RIGHT side (live units, inner -> outer); the left side mirrors them */
  readonly plots: Array<[number, number]> = [];
  /** drive-lane centres (live x) for ground vehicles */
  readonly lanes: number[] = [];

  // pad registry (ring)
  readonly px = new Float32Array(PAD_CAP);
  readonly pwy = new Float32Array(PAD_CAP);
  readonly phw = new Float32Array(PAD_CAP);
  readonly phh = new Float32Array(PAD_CAP);
  readonly pkind = new Uint8Array(PAD_CAP);
  padN = 0;
  private padHead = 0;
  /** structures that could not be placed on a plot (spawned unsnapped) */
  failed = 0;

  constructor() {
    const T = CIT.tile;
    const cx = this.cx;
    // outermost lattice line that is still (at least partly) on the field
    this.M = Math.max(1, Math.floor((GAME_W + 16 - cx - T) / T));
    this.avenue = this.M >= 4 ? Math.floor(this.M / 2) : -1;
    const inner = cx + CIT.runwayHalf + CIT.kerb;
    const wallIn = this.latX(1, this.M) - CIT.wallHalf - CIT.pipeBand - CIT.kerb;
    if (this.avenue >= 0) {
      const ax = this.latX(1, this.avenue);
      this.plots.push([inner, ax - CIT.roadHalf - CIT.kerb], [ax + CIT.roadHalf + CIT.kerb, wallIn]);
    } else this.plots.push([inner, wallIn]);
    this.lanes.push(cx - 30, cx + 30);
    if (this.avenue >= 0) {
      const ax = this.latX(1, this.avenue);
      this.lanes.push(ax, GAME_W - ax);
    }
  }

  /** lattice line x: side s (+1 right, -1 left), index m */
  latX(s: number, m: number): number {
    return this.cx + s * (CIT.tile + CIT.tile * m);
  }

  /** horizontal line j at wy = BLOCK * j is a road (even) or a wall (odd) */
  isRoadLine(j: number): boolean {
    return (j & 1) === 0;
  }
  lineHalf(j: number): number {
    return this.isRoadLine(j) ? CIT.roadHalf : CIT.wallHalf;
  }

  /** interior wy range of block j (between line j and line j + 1) */
  blockLo(j: number): number {
    return CIT.block * j + this.lineHalf(j) + CIT.kerb;
  }
  blockHi(j: number): number {
    return CIT.block * (j + 1) - this.lineHalf(j + 1) - CIT.kerb;
  }

  /** plot x range for side s, plot p (live x, ascending) */
  plotX0(s: number, p: number): number {
    const r = this.plots[p]!;
    return s > 0 ? r[0] : GAME_W - r[1];
  }
  plotX1(s: number, p: number): number {
    const r = this.plots[p]!;
    return s > 0 ? r[1] : GAME_W - r[0];
  }

  /** helipads given up for a structure (ring of keys, see heliKey) */
  private heliOff = new Int32Array(32);
  private heliOffN = 0;
  private heliKey(s: number, p: number, j: number): number {
    return (j * 4 + p) * 2 + (s > 0 ? 1 : 0);
  }

  /**
   * Does plot (s, p) hold a helipad in block j? Returns its centre x (live) or NaN. Deterministic, except that a
   * helipad still off screen gives way to a structure that needs its spot (narrow portrait plots).
   */
  helipadX(s: number, p: number, j: number): number {
    const w = this.plotX1(s, p) - this.plotX0(s, p);
    if (w < CIT.helipad + 16) return NaN;
    if (h2(j * 7 + p, s > 0 ? 1 : 2, 901) >= CIT.helipadChance) return NaN;
    if (this.heliOffN > 0) {
      const key = this.heliKey(s, p, j);
      const n = Math.min(this.heliOffN, this.heliOff.length);
      for (let i = 0; i < n; i++) if (this.heliOff[i] === key) return NaN;
    }
    // outer half of the plot so the inner side (next to the runway) stays free for structures
    return s > 0 ? this.plotX1(s, p) - CIT.helipad / 2 : this.plotX0(s, p) + CIT.helipad / 2;
  }
  /** helipad centre wy in block j (upper part of the block) */
  helipadWy(j: number): number {
    return this.blockHi(j) - CIT.helipad / 2;
  }

  /** is the pad rect free of other pads and of helipads that are already (partly) on screen (below `minWy`)? */
  isFree(x: number, wy: number, hw: number, hh: number, minWy = -Infinity): boolean {
    const g = CIT.padGap;
    for (let i = 0; i < this.padN; i++) {
      if (Math.abs(this.px[i]! - x) < this.phw[i]! + hw + g && Math.abs(this.pwy[i]! - wy) < this.phh[i]! + hh + g) return false;
    }
    const j = Math.floor(wy / CIT.block);
    const s = x >= this.cx ? 1 : -1;
    for (let p = 0; p < this.plots.length; p++) {
      const hx = this.helipadX(s, p, j);
      if (Number.isNaN(hx)) continue;
      const half = CIT.helipad / 2;
      const hy = this.helipadWy(j);
      if (hy - half >= minWy) continue; // not visible yet: it can give way (see releaseHelipads)
      if (Math.abs(hx - x) < half + hw + g && Math.abs(hy - wy) < half + hh + g) return false;
    }
    return true;
  }

  /** drop the (off-screen) helipads a new pad overlaps */
  private releaseHelipads(x: number, wy: number, hw: number, hh: number): void {
    const j = Math.floor(wy / CIT.block);
    const s = x >= this.cx ? 1 : -1;
    const half = CIT.helipad / 2;
    for (let p = 0; p < this.plots.length; p++) {
      const hx = this.helipadX(s, p, j);
      if (Number.isNaN(hx)) continue;
      if (Math.abs(hx - x) < half + hw + CIT.padGap && Math.abs(this.helipadWy(j) - wy) < half + hh + CIT.padGap) {
        this.heliOff[this.heliOffN % this.heliOff.length] = this.heliKey(s, p, j);
        this.heliOffN++;
      }
    }
  }

  private addPad(x: number, wy: number, hw: number, hh: number, kind: PadKind): void {
    const i = this.padHead;
    this.px[i] = x;
    this.pwy[i] = wy;
    this.phw[i] = hw;
    this.phh[i] = hh;
    this.pkind[i] = kind === "s" ? 0 : kind === "m" ? 1 : kind === "l" ? 2 : 3;
    this.padHead = (i + 1) % PAD_CAP;
    if (this.padN < PAD_CAP) this.padN++;
  }

  /**
   * Place a stationary ground unit (footprint w x h native px) wanted at live x / world-y wy. Searches the plots on the
   * same side (then the other side) for the nearest free spot whose pad lies entirely above `minWy` (so the pad never
   * pops in on screen), registers the pad and returns the spot; null when nothing fits within reach.
   */
  snapStructure(w: number, h: number, x: number, wy: number, minWy: number, out: { x: number; wy: number }): { x: number; wy: number } | null {
    const pad = padFor(w, h);
    const hw = pad.hw;
    const hh = pad.hh;
    const lo = Math.max(wy, minWy + hh);
    const j0 = Math.floor(lo / CIT.block) - 1;
    let best = Infinity;
    let bx = 0;
    let bwy = 0;
    const want = x >= this.cx ? 1 : -1;
    for (let pass = 0; pass < 2; pass++) {
      const s = pass === 0 ? want : -want;
      for (let p = 0; p < this.plots.length; p++) {
        const x0 = this.plotX0(s, p) + hw;
        const x1 = this.plotX1(s, p) - hw;
        if (x1 < x0) continue;
        const xc = Math.max(x0, Math.min(x1, x));
        const top = Math.max(wy, minWy) + CIT.maxLift;
        for (let j = j0; j <= j0 + 4; j++) {
          const y0 = Math.max(this.blockLo(j) + hh, minWy + hh);
          const y1 = Math.min(this.blockHi(j) - hh, top);
          if (y1 < y0) continue;
          const yc = Math.max(y0, Math.min(y1, wy));
          // candidate spots: the clamped spot, then steps of one pad along x and y (16-unit grid for tidy rows)
          for (let a = 0; a < 7; a++) {
            const ox = a === 0 ? 0 : (a & 1 ? 1 : -1) * Math.ceil(a / 2) * (2 * hw + CIT.padGap);
            const raw = xc + ox;
            if (raw < x0 - 0.01 || raw > x1 + 0.01) continue;
            const cxs = Math.max(x0, Math.min(x1, Math.round(raw / 16) * 16));
            for (let b = 0; b < 7; b++) {
              const oy = b === 0 ? 0 : (b & 1 ? 1 : -1) * Math.ceil(b / 2) * (2 * hh + CIT.padGap);
              const rawY = yc + oy;
              if (rawY < y0 - 0.01 || rawY > y1 + 0.01) continue;
              const cy = Math.max(y0, Math.min(y1, Math.round(rawY / 16) * 16));
              const cost = Math.abs(cxs - x) + Math.abs(cy - wy) * 0.6 + pass * 400;
              if (cost >= best) continue;
              if (!this.isFree(cxs, cy, hw, hh, minWy)) continue;
              best = cost;
              bx = cxs;
              bwy = cy;
            }
          }
        }
      }
      if (best < Infinity) break;
    }
    if (best === Infinity) {
      this.failed++;
      return null;
    }
    this.releaseHelipads(bx, bwy, hw, hh);
    this.addPad(bx, bwy, hw, hh, pad.kind);
    out.x = bx;
    out.wy = bwy;
    return out;
  }

  /** nearest drive lane for a ground vehicle (runway lanes, avenues) */
  snapLane(x: number): number {
    let best = this.lanes[0]!;
    for (const l of this.lanes) if (Math.abs(l - x) < Math.abs(best - x)) best = l;
    return best;
  }

  /** forget every pad (chapter restart / sanity replays) */
  reset(): void {
    this.padN = 0;
    this.padHead = 0;
    this.failed = 0;
    this.heliOffN = 0;
  }
}
