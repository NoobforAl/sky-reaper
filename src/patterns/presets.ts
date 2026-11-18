/**
 * Enemy bullet presets (visual + base stats). Reused by the Level agent for bosses:
 *   import { bulletPresets, makeBullet } from "../patterns";
 *   const b = makeBullet("orb", { speed: 150, damage: 12 });
 */
import type { BulletSpec, BulletVisual } from "../contracts";

export type BulletPresetId =
  | "small"
  | "orb"
  | "needle"
  | "big"
  | "missile"
  | "bomb"
  | "flak"
  | "mine"
  | "orb_cyan"
  | "small_red";

const vis = (sprite: string, color: [number, number, number], radius: number, extra: Partial<BulletVisual> = {}): BulletVisual => ({
  sprite,
  color,
  radius,
  ...extra,
});

/** Base specs. `angle` 90 = "forward" (see patterns/runner.ts angle convention). */
export const bulletPresets: Record<BulletPresetId, BulletSpec> = {
  /** basic yellow pellet - fighters, tanks */
  small: { damageClass: "enemy", damage: 8, speed: 170, angle: 90, life: 7, visual: vis("ebullet_small", [255, 230, 60], 4, { rotate: false }) },
  /** red pellet variant (elites / citadel) */
  small_red: { damageClass: "enemy", damage: 9, speed: 175, angle: 90, life: 7, visual: vis("ebullet_small", [255, 80, 80], 4, { rotate: false }) },
  /** magenta orb - rings / spirals */
  orb: { damageClass: "enemy", damage: 10, speed: 130, angle: 90, life: 8, visual: vis("ebullet_orb", [255, 70, 230], 5, { rotate: false }) },
  /** cyan orb - arctic / citadel rings */
  orb_cyan: { damageClass: "enemy", damage: 10, speed: 130, angle: 90, life: 8, visual: vis("ebullet_orb", [80, 240, 255], 5, { rotate: false }) },
  /** fast thin needle - aimed shots */
  needle: { damageClass: "enemy", damage: 9, speed: 240, angle: 90, life: 5, visual: vis("ebullet_needle", [120, 255, 255], 3, { rotate: true }) },
  /** big slow ball - heavy units */
  big: { damageClass: "enemy", damage: 18, speed: 110, angle: 90, life: 9, visual: vis("ebullet_big", [255, 150, 40], 8, { rotate: false }) },
  /** homing missile: decoyable, shootable, warning + lock indicator */
  missile: {
    damageClass: "enemy",
    damage: 20,
    speed: 150,
    angle: 90,
    motion: "homing",
    life: 5.5,
    turnRate: 85,
    armDelay: 0.5,
    decoyable: true,
    isMissile: true,
    blastRadius: 24,
    hp: 2,
    visual: vis("ebullet_missile", [255, 255, 255], 5, { rotate: true, trail: "fx_trail", trailEveryMs: 45 }),
  },
  /** dropped bomb (visual for bomber drops; real damage is via hazards) */
  bomb: { damageClass: "enemy", damage: 16, speed: 90, angle: 90, life: 6, visual: vis("ebullet_bomb", [255, 200, 120], 6, { rotate: true }) },
  /** flak shell: shootable, slows the AA feel */
  flak: { damageClass: "enemy", damage: 10, speed: 160, angle: 90, life: 6, hp: 1, visual: vis("ebullet_flak", [255, 255, 120], 5, { rotate: false }) },
  /** slow drifting mine: shootable, small blast */
  mine: {
    damageClass: "enemy",
    damage: 16,
    speed: 40,
    angle: 90,
    life: 7,
    hp: 3,
    blastRadius: 20,
    visual: vis("ebullet_bomb", [255, 90, 90], 7, { rotate: false, scale: 1 }),
  },
};

/** Copy a preset and override fields (visual is merged, not replaced). */
export function makeBullet(id: BulletPresetId, over: Partial<BulletSpec> = {}): BulletSpec {
  const base = bulletPresets[id];
  return { ...base, ...over, visual: { ...base.visual, ...(over.visual ?? {}) } };
}
