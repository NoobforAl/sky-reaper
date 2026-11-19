/**
 * Chapter threat tiers for regular enemies (QA_REPORT #1, #9).
 *
 * The campaign gets harder per chapter by scaling regular enemies' fire rate, bullet speed and missile performance.
 * Chapter 1 (tier 0) is the unscaled tutorial baseline. Bosses do NOT go through this (their balance lives in
 * src/bosses); only src/enemies calls `tieredPattern`.
 *
 * Fairness caps from runner.ts (MAX_BULLET_SPEED / MAX_AIMED_SINGLE_SPEED / MAX_MISSILE_TURN) still clamp the result,
 * and missiles stay below MAX_TIER_MISSILE_SPEED (player base speed is 270 u/s) so every missile can be outrun,
 * and they stay decoyable so flares keep working.
 */
import type { PatternDef, WorldAPI } from "../contracts";
import { MAX_MISSILE_TURN } from "./runner";

export interface ChapterTier {
  /** attack-timer speed (1 = authored interval; 1.5 = intervals are 2/3 as long) */
  fireRate: number;
  /** multiplier on non-missile bullet speed */
  bulletSpeed: number;
  /** multiplier on missile speed and flat bonus on missile turn rate (deg/s) */
  missileSpeed: number;
  missileTurn: number;
}

/** Index = ChapterDef.index (0 = pacific ... 4 = citadel). */
export const CHAPTER_TIERS: readonly ChapterTier[] = [
  { fireRate: 1.0, bulletSpeed: 1.0, missileSpeed: 1.0, missileTurn: 0 },
  { fireRate: 1.2, bulletSpeed: 1.04, missileSpeed: 1.05, missileTurn: 0 },
  { fireRate: 1.38, bulletSpeed: 1.08, missileSpeed: 1.18, missileTurn: 8 },
  { fireRate: 1.5, bulletSpeed: 1.12, missileSpeed: 1.25, missileTurn: 12 },
  { fireRate: 1.62, bulletSpeed: 1.16, missileSpeed: 1.32, missileTurn: 16 },
];

/** Missiles never get faster than this (player moves 270 u/s, so a missile can always be outrun). */
export const MAX_TIER_MISSILE_SPEED = 200;

/**
 * Chapter index of the running world. The concrete Engine World exposes `chapter: ChapterDef`, which WorldAPI does not
 * declare yet (see docs/CONTRACT_REQUESTS.md "enemy: WorldAPI.chapterIndex"); unknown worlds fall back to tier 0.
 */
export function chapterIndexOf(world: WorldAPI): number {
  const w = world as WorldAPI & { chapterIndex?: number; chapter?: { index?: number } };
  const i = typeof w.chapterIndex === "number" ? w.chapterIndex : w.chapter?.index;
  return typeof i === "number" && isFinite(i) ? Math.max(0, Math.min(CHAPTER_TIERS.length - 1, Math.floor(i))) : 0;
}

export function chapterTier(world: WorldAPI): ChapterTier {
  return CHAPTER_TIERS[chapterIndexOf(world)]!;
}

const cache: Array<WeakMap<PatternDef, PatternDef>> = CHAPTER_TIERS.map(() => new WeakMap());

/** Return `p` scaled for chapter `index` (cached per def, so steady-state calls allocate nothing). */
export function tieredPattern(p: PatternDef, index: number): PatternDef {
  if (index <= 0) return p;
  const t = CHAPTER_TIERS[Math.min(index, CHAPTER_TIERS.length - 1)]!;
  const c = cache[Math.min(index, CHAPTER_TIERS.length - 1)]!;
  let out = c.get(p);
  if (out) return out;
  const b = p.bullet;
  const missile = !!b.isMissile || p.kind === "homing";
  if (missile) {
    const speed = Math.max(b.speed, Math.min(MAX_TIER_MISSILE_SPEED, Math.round(b.speed * t.missileSpeed)));
    const turnRate = Math.min(MAX_MISSILE_TURN, (b.turnRate ?? 80) + t.missileTurn);
    out = { ...p, bullet: { ...b, speed, turnRate } };
  } else if (p.kind === "delayedBlast" || p.kind === "areaStrike") {
    out = p; // hazards: telegraph timing is the fairness guarantee, do not touch
  } else {
    out = { ...p, bullet: { ...b, speed: Math.round(b.speed * t.bulletSpeed) } };
  }
  c.set(p, out);
  return out;
}
