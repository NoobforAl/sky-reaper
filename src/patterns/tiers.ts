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

/** Index = ChapterDef.index (0 = pacific ... 4 = citadel). Values: docs/BALANCE_SPEC.md T1 (round 5). */
export const CHAPTER_TIERS: readonly ChapterTier[] = [
  { fireRate: 1.0, bulletSpeed: 1.0, missileSpeed: 1.0, missileTurn: 0 },
  { fireRate: 1.25, bulletSpeed: 1.06, missileSpeed: 1.05, missileTurn: 0 },
  { fireRate: 1.45, bulletSpeed: 1.12, missileSpeed: 1.18, missileTurn: 8 },
  { fireRate: 1.65, bulletSpeed: 1.18, missileSpeed: 1.25, missileTurn: 12 },
  { fireRate: 1.85, bulletSpeed: 1.24, missileSpeed: 1.32, missileTurn: 16 },
];

/**
 * Chapter HP scale for regular enemies (docs/BALANCE_SPEC.md E1). The level files apply it through
 * `tl.setDefaults({ hpScale })`; `LEGACY_CHAPTER_HP` is what they applied before round 5. src/enemies tops a spawn up
 * from legacy to target only while the chapter default is still the legacy value, so it never double-applies.
 */
export const CHAPTER_HP: readonly number[] = [1.0, 1.1, 1.25, 1.4, 1.55];
export const LEGACY_CHAPTER_HP: readonly number[] = [1.0, 1.0, 1.05, 1.1, 1.2];

/** THREAT rank (docs/BALANCE_SPEC.md §7): per level, regular enemies fire 10 % faster and non-missile bullets fly 8 % faster. */
export const THREAT_MAX = 3;
export const THREAT_FIRE_RATE_PER_LEVEL = 0.1;
export const THREAT_BULLET_SPEED_PER_LEVEL = 0.08;

/** THREAT level of the running world (0..3, integer). `WorldAPI.threat` is optional; absent = 0. No allocation. */
export function threatOf(world: WorldAPI): number {
  const t = (world as { threat?: number }).threat;
  return typeof t === "number" && t > 0 ? Math.min(THREAT_MAX, Math.floor(t)) : 0;
}

/** Fire-rate multiplier for a THREAT level. */
export function threatFireRate(level: number): number {
  return 1 + THREAT_FIRE_RATE_PER_LEVEL * level;
}

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

/** one cache per (chapter tier, THREAT level) */
const cache: Array<WeakMap<PatternDef, PatternDef>> = [];
for (let i = 0; i < CHAPTER_TIERS.length * (THREAT_MAX + 1); i++) cache.push(new WeakMap());

/**
 * Return `p` scaled for chapter `index` and THREAT level `threat` (cached per def, so steady-state calls allocate
 * nothing). Missiles only take the chapter tier (never THREAT: they must stay outrunnable); hazards are never touched.
 * The runner's MAX_BULLET_SPEED / MAX_AIMED_SINGLE_SPEED caps still clamp the result.
 */
export function tieredPattern(p: PatternDef, index: number, threat = 0): PatternDef {
  const ti = Math.max(0, Math.min(index | 0, CHAPTER_TIERS.length - 1));
  const th = Math.max(0, Math.min(threat | 0, THREAT_MAX));
  if (ti === 0 && th === 0) return p;
  const t = CHAPTER_TIERS[ti]!;
  const c = cache[ti * (THREAT_MAX + 1) + th]!;
  let out = c.get(p);
  if (out) return out;
  const b = p.bullet;
  const missile = !!b.isMissile || p.kind === "homing";
  if (missile) {
    if (ti === 0) out = p;
    else {
      const speed = Math.max(b.speed, Math.min(MAX_TIER_MISSILE_SPEED, Math.round(b.speed * t.missileSpeed)));
      const turnRate = Math.min(MAX_MISSILE_TURN, (b.turnRate ?? 80) + t.missileTurn);
      out = { ...p, bullet: { ...b, speed, turnRate } };
    }
  } else if (p.kind === "delayedBlast" || p.kind === "areaStrike") {
    out = p; // hazards: telegraph timing is the fairness guarantee, do not touch
  } else {
    const mul = t.bulletSpeed * (1 + THREAT_BULLET_SPEED_PER_LEVEL * th);
    out = { ...p, bullet: { ...b, speed: Math.round(b.speed * mul) } };
  }
  c.set(p, out);
  return out;
}
