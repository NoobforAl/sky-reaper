/**
 * Naval units on the jungle river / arctic open-water lead (round 6, #12).
 *
 * Boats (gunboat, destroyer) are not anchored to the ground: they move in screen space at their own speed while the
 * river scrolls past underneath, so a boat spawned on the water drifts onto the bank as soon as the river bends.
 * The runner therefore
 *  1. spawns every boat on the river centre line + a small lane offset that leaves room for its own weave
 *     (`riverSpawnX`), and
 *  2. every sim step shifts each boat (and the base of its sine weave) by the change of the river centre under it and
 *     clamps it inside the drawn water (`riverFollowShift`).
 * Both use the same `riverX` / `waterHalfW` as the background, so the boats follow the drawn curve exactly.
 * `sanity.ts` replays this per boat and fails when a hull leaves the water at any sampled moment.
 */
import { GAME_H, GAME_W, PIXEL_SCALE, X_SCALE } from "../contracts";
import { enemySystem } from "../enemies";
import { hasRiver, riverX, waterHalfW } from "./backgrounds";

export const NAVAL = new Set(["gunboat", "destroyer"]);

/** water kept between a hull and the bank (game units) */
export const BANK_CLEARANCE = 3;
/** share of the authored lateral offset (relative to the field centre, design units) kept on the river */
const LANE_SHARE = 0.3;

/** does this chapter biome put this enemy on the river? */
export function isRiverBoat(biome: string, enemy: string): boolean {
  return hasRiver(biome) && NAVAL.has(enemy);
}

/** half the hull width of a naval unit (game units) */
export function hullHalf(enemy: string): number {
  const d = enemySystem.defs[enemy];
  return d ? (d.size[0] * PIXEL_SCALE) / 2 : 16;
}

/** the unit's own sine weave amplitude (0 for straight movers) */
export function weaveAmp(enemy: string): number {
  const m = enemySystem.defs[enemy]?.movement;
  return m && m.kind === "sine" ? (m.amp ?? 50) : 0;
}

/** largest |x - riverX(wy)| that keeps the whole hull on the water */
export function laneHalf(biome: string, enemy: string, wy: number): number {
  return Math.max(0, waterHalfW(biome, wy) - hullHalf(enemy) - BANK_CLEARANCE);
}

/**
 * Spawn x on the river for an authored live x at world-y `wy`: the river centre plus a share of the authored offset,
 * limited so that the unit's weave still starts inside the water.
 */
export function riverSpawnX(biome: string, enemy: string, x: number, wy: number): number {
  const room = Math.max(0, laneHalf(biome, enemy, wy) - weaveAmp(enemy) * 0.5);
  const want = ((x - GAME_W / 2) / X_SCALE) * LANE_SHARE;
  return riverX(wy) + Math.max(-room, Math.min(room, want));
}

/**
 * Shift to add to a boat's x this step: follow the river centre (`prevCx` -> `cx`), then clamp the hull inside the
 * water (`half` = laneHalf at the boat's world-y).
 */
export function riverFollowShift(x: number, prevCx: number, cx: number, half: number): number {
  let shift = cx - prevCx;
  const off = x + shift - cx;
  if (off > half) shift -= off - half;
  else if (off < -half) shift += -half - off;
  return shift;
}

// ------------------------------------------------------------------ land vehicles (round 7, QA R6-4)
/**
 * Moving ground units (tanks, APCs, walkers) drive across the river biomes on their own straight / diagonal / sine
 * paths and used to roll onto the water (arctic t ~104). Two runner steps keep them dry, both shared with sanity.ts:
 *  1. spawn (`landSpawnX`, event time): a tank / walker / crawler column is moved sideways to the nearest x whose whole
 *     on-screen path (its own speed + the scroll, the river bending under it) stays on land; an APC (diagonal) only
 *     needs a dry entry.
 *  2. every step (`ChapterRunner.keepOnLand`): a vehicle that touches the water anyway (APCs drifting sideways, wide
 *     copies, river bends) is put back on its bank and a diagonal mover turns away, like its wall bounce.
 * Vehicles on a road / rail set-piece are left alone (roads and rails are drawn over the river).
 */
/** ground kept between a vehicle's sprite edge and the drawn water (game units) */
export const LAND_CLEARANCE = 4;

/** does this unit drive over land in a river biome (moving ground unit, not a boat)? */
export function isLandMover(biome: string, enemy: string): boolean {
  if (!hasRiver(biome) || NAVAL.has(enemy)) return false;
  const d = enemySystem.defs[enemy];
  return !!d && d.layer === "ground" && d.anchored !== false && d.movement.kind !== "stationary" && d.movement.kind !== "scripted";
}

/** half extent of a land vehicle on the ground (largest sprite side: diagonal movers turn) */
export function landHalf(enemy: string): number {
  const d = enemySystem.defs[enemy];
  return d ? (Math.max(d.size[0], d.size[1]) * PIXEL_SCALE) / 2 : 16;
}

/** how far (game units) a land unit of half extent `half` at (x, world-y wy) reaches onto the water; <= 0 = dry */
export function landOnWater(biome: string, x: number, wy: number, half: number): number {
  return half + LAND_CLEARANCE + waterHalfW(biome, wy) - Math.abs(x - riverX(wy));
}

/** x shift that puts a land unit back on the bank it is on (0 when it is dry) */
export function landBankShift(biome: string, x: number, wy: number, half: number): number {
  const over = landOnWater(biome, x, wy, half);
  if (over <= 0) return 0;
  return x >= riverX(wy) ? over : -over;
}

/**
 * Spawn x for a land vehicle authored at live x (screen y `y`, world-y `wy` at spawn, `scroll` u/s, `dir` = opts.dir):
 * the nearest column (6 u steps, either side) whose on-screen path stays dry, or `x` when none is found within the
 * field. Straight movers are checked over their whole visible life, sine movers with their weave width added, diagonal
 * movers over their first 2 s on screen (the bank guard handles the rest). `onSurface` = is (x, wy) on a road / rail
 * drawn over the water (counts as dry). Event time only (about 100 x 60 samples).
 */
export function landSpawnX(biome: string, enemy: string, x: number, y: number, wy: number, scroll: number, dir: number, onSurface?: (x: number, wy: number) => boolean): number {
  if (!isLandMover(biome, enemy)) return x;
  const d = enemySystem.defs[enemy]!;
  const m = d.movement;
  const half = landHalf(enemy);
  const DEG = Math.PI / 180;
  let vx = 0;
  let vy = m.speed;
  let extra = 0;
  if (m.kind === "straight" || m.kind === "diagonal") {
    const a = m.angle ?? (m.kind === "straight" ? 90 : 60);
    const ax = dir === -1 ? 180 - a : a;
    vx = Math.cos(ax * DEG) * m.speed;
    vy = Math.sin(ax * DEG) * m.speed;
  } else if (m.kind === "sine") extra = m.amp ?? 50;
  const down = Math.max(10, scroll + vy);
  const k0 = Math.max(0, (-half - y) / down);
  const k1 = m.kind === "diagonal" ? k0 + 2 : Math.min(k0 + 40, (GAME_H + half - y) / down);
  const dry = (cx: number): boolean => {
    for (let k = k0; k <= k1; k += 0.25) {
      const px = cx + vx * k;
      const pwy = wy - vy * k;
      if (landOnWater(biome, px, pwy, half + extra) > 0 && !(onSurface && extra === 0 && onSurface(px, pwy))) return false;
    }
    return true;
  };
  if (dry(x)) return x;
  const lo = half + extra + 8;
  const hi = GAME_W - half - extra - 8;
  for (let off = 6; off < GAME_W; off += 6) {
    if (x - off >= lo && dry(x - off)) return x - off;
    if (x + off <= hi && dry(x + off)) return x + off;
    if (x - off < lo && x + off > hi) break;
  }
  return x;
}
