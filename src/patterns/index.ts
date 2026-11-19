/**
 * Pattern framework entry point (Enemy/AI agent).
 *  - patternRunner: PatternRunner  (contract)
 *  - PATTERNS: named reusable PatternDefs (~40, stable ids)
 *  - bulletPresets / makeBullet: shared bullet visuals for bosses
 */
export { patternRunner, MAX_BULLET_SPEED, MAX_AIMED_SINGLE_SPEED, MAX_MISSILE_TURN, setEmitMissileEvents } from "./runner";
export { PATTERNS, resolvePattern } from "./library";
export { bulletPresets, makeBullet, type BulletPresetId } from "./presets";
export {
  CHAPTER_TIERS,
  CHAPTER_HP,
  LEGACY_CHAPTER_HP,
  MAX_TIER_MISSILE_SPEED,
  THREAT_MAX,
  THREAT_FIRE_RATE_PER_LEVEL,
  THREAT_BULLET_SPEED_PER_LEVEL,
  chapterIndexOf,
  chapterTier,
  threatOf,
  threatFireRate,
  tieredPattern,
  type ChapterTier,
} from "./tiers";
