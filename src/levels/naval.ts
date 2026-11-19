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
import { GAME_W, PIXEL_SCALE, X_SCALE } from "../contracts";
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
