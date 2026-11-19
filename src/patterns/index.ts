/**
 * Pattern framework entry point (Enemy/AI agent).
 *  - patternRunner: PatternRunner  (contract)
 *  - PATTERNS: named reusable PatternDefs (~40, stable ids)
 *  - bulletPresets / makeBullet: shared bullet visuals for bosses
 */
export { patternRunner, MAX_BULLET_SPEED, MAX_AIMED_SINGLE_SPEED, MAX_MISSILE_TURN, setEmitMissileEvents } from "./runner";
export { PATTERNS, resolvePattern } from "./library";
export { bulletPresets, makeBullet, type BulletPresetId } from "./presets";
export { CHAPTER_TIERS, MAX_TIER_MISSILE_SPEED, chapterIndexOf, chapterTier, tieredPattern, type ChapterTier } from "./tiers";
