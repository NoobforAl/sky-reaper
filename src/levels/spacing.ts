/**
 * Spawn spacing model (round 5, user feedback #7 "enemies overlap each other", level side).
 *
 * Every spawned unit is reduced to a box (sprite size x PIXEL_SCALE) moving with a rough first-seconds velocity from its
 * movement def (ground units also ride the scroll; hover / strafe / dive units stop at their holdY). Two units of the
 * same layer "overlap" when their boxes intersect by more than OVERLAP_K of the summed half sizes at any sampled moment
 * of the first ~1.5 s after the later one spawns. Used by:
 *  - sanity.ts `checkOverlaps()`: authored waves must start clean (portrait and wide mapping);
 *  - runner.ts: wide-field copies are placed (mirror -> flank -> skip) so they never land on an authored unit.
 * Runtime separation while units fly (follower slows, soft push) is the Enemy agent's side (src/enemies).
 * Event-time only: nothing here runs per frame.
 */
import { PIXEL_SCALE, type EnemyDef } from "../contracts";

/** boxes may touch / overlap by this share of the summed half sizes before it counts (transparent sprite corners) */
export const OVERLAP_K = 0.8;
/** pairs further apart in time than this are never compared */
export const OVERLAP_WINDOW = 2.5;
const SAMPLES = [0, 0.3, 0.6, 1, 1.5];

export interface SpawnBox {
  t: number;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  /** y where the unit stops descending (hover / strafe / dive), Infinity when it keeps moving */
  stopY: number;
  ground: boolean;
  id: string;
  /** free tag for reports (event time, member index...) */
  tag?: string;
}

/** fill `out` with the spacing box of a unit spawned at (x, y) at time t. `scroll` = chapter scroll speed (u/s) */
export function boxFor(def: EnemyDef, x: number, y: number, t: number, scroll: number, dir: number, out: SpawnBox): SpawnBox {
  const m = def.movement;
  const ground = def.layer === "ground";
  let vx = 0;
  let vy = 0;
  let stopY = Infinity;
  const sp = m.speed || 0;
  switch (m.kind) {
    case "straight": {
      const a = ((m.angle ?? 90) * Math.PI) / 180;
      vx = Math.cos(a) * sp * (dir === -1 ? -1 : 1);
      vy = Math.sin(a) * sp;
      break;
    }
    case "diagonal": {
      const a = ((m.angle ?? 60) * Math.PI) / 180;
      vx = Math.cos(a) * sp * (dir === -1 ? -1 : 1);
      vy = Math.sin(a) * sp;
      break;
    }
    case "hover":
    case "strafe":
      vy = sp;
      stopY = m.holdY ?? (m.kind === "hover" ? 180 : 170);
      break;
    case "dive":
      vy = sp * 0.6;
      stopY = m.holdY ?? 170;
      break;
    case "stationary":
      break;
    default:
      vy = sp;
  }
  if (ground && def.anchored !== false) vy += scroll;
  out.t = t;
  out.x = x;
  out.y = y;
  out.w = def.size[0] * PIXEL_SCALE;
  out.h = def.size[1] * PIXEL_SCALE;
  out.vx = vx;
  out.vy = vy;
  out.stopY = y >= stopY ? Infinity : stopY;
  out.ground = ground;
  out.id = def.id;
  return out;
}

function yAt(b: SpawnBox, time: number): number {
  const y = b.y + b.vy * Math.max(0, time - b.t);
  return y > b.stopY ? b.stopY : y;
}

/** true when a and b (same layer) intersect at some sampled moment after both exist */
export function boxesOverlap(a: SpawnBox, b: SpawnBox): boolean {
  if (a.ground !== b.ground) return false;
  const dt = Math.abs(a.t - b.t);
  if (dt > OVERLAP_WINDOW) return false;
  const t0 = Math.max(a.t, b.t);
  const lx = ((a.w + b.w) / 2) * OVERLAP_K;
  const ly = ((a.h + b.h) / 2) * OVERLAP_K;
  for (const s of SAMPLES) {
    const time = t0 + s;
    const ax = a.x + a.vx * (time - a.t);
    const bx = b.x + b.vx * (time - b.t);
    if (Math.abs(ax - bx) >= lx) continue;
    if (Math.abs(yAt(a, time) - yAt(b, time)) < ly) return true;
  }
  return false;
}

/** clearance (units) two units need side by side: summed half widths / OVERLAP_K plus a small gap */
export function sideGap(a: EnemyDef, b: EnemyDef): number {
  return ((a.size[0] + b.size[0]) / 2) * PIXEL_SCALE + 8;
}
