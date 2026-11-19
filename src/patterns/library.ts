/**
 * Named, reusable patterns. Ids are STABLE (Level agent / boss scripts reference them).
 * Tiers: t1 = chapter 1-2 (teaching), t2 = chapter 2-4, t3 = chapter 4-5 / elites.
 * Fan step angles are >= 12 deg (=> >= 28u gap at ~135u from the muzzle).
 */
import type { HazardSpawn, PatternDef } from "../contracts";
import { makeBullet } from "./presets";

type Hz = Omit<HazardSpawn, "x" | "y">;
const hz = (radius: number, telegraphMs: number, damage: number, extra: Partial<Hz> = {}): Hz => ({
  radius,
  telegraphMs,
  damage,
  damageClass: "enemy",
  blastFx: "explosion_m",
  color: [255, 90, 40],
  ...extra,
});

const list: PatternDef[] = [
  // ------------------------------------------------------------------ tier 1 (forgiving)
  { id: "single_down", kind: "straight", bullet: makeBullet("small", { speed: 150 }), count: 1, sfx: "shot_vulcan" },
  { id: "twin_down", kind: "straight", bullet: makeBullet("small", { speed: 160 }), count: 2, blastSpacing: 30, sfx: "shot_vulcan" },
  { id: "aimed_slow", kind: "aimed", bullet: makeBullet("small", { speed: 140 }), count: 1, sfx: "shot_vulcan" },
  { id: "aimed_needle", kind: "aimed", bullet: makeBullet("needle", { speed: 230 }), count: 1, sfx: "shot_laser" },
  { id: "fan3_slow", kind: "spread", bullet: makeBullet("small", { speed: 130 }), count: 3, spreadDeg: 36, sfx: "shot_spread" },
  { id: "fan3_aimed", kind: "aimed", bullet: makeBullet("small", { speed: 150 }), count: 3, spreadDeg: 30, sfx: "shot_spread" },
  { id: "ring8_slow", kind: "circular", bullet: makeBullet("orb", { speed: 100 }), count: 8, telegraphMs: 400, sfx: "shot_spread" },
  { id: "tank_shell", kind: "aimed", bullet: makeBullet("big", { speed: 130, damage: 14 }), count: 1, telegraphMs: 300, sfx: "rocket" },

  // ------------------------------------------------------------------ tier 2
  { id: "fan5", kind: "spread", bullet: makeBullet("small", { speed: 150 }), count: 5, spreadDeg: 60, sfx: "shot_spread" },
  { id: "fan5_aimed", kind: "aimed", bullet: makeBullet("small", { speed: 160 }), count: 5, spreadDeg: 56, sfx: "shot_spread" },
  { id: "burst3_aimed", kind: "burst", bullet: makeBullet("needle", { speed: 220 }), count: 1, shots: 3, gapMs: 140, sfx: "shot_vulcan" },
  { id: "burst3_lead", kind: "burst", aim: "lead", bullet: makeBullet("needle", { speed: 220 }), count: 1, shots: 3, gapMs: 160, sfx: "shot_vulcan" },
  { id: "ring12", kind: "circular", bullet: makeBullet("orb", { speed: 115 }), count: 12, telegraphMs: 500, sfx: "shot_spread" },
  { id: "spiral_slow", kind: "spiral", bullet: makeBullet("orb", { speed: 110 }), count: 2, shots: 12, gapMs: 140, rotationDeg: 17, telegraphMs: 400, sfx: "shot_spread" },
  { id: "cross4", kind: "multi", bullet: makeBullet("orb", { speed: 120 }), count: 1, offsets: [0, 90, 180, 270], angleOffset: 45, sfx: "shot_spread" },
  { id: "cross4_rotating", kind: "multi", bullet: makeBullet("orb_cyan", { speed: 120 }), count: 1, offsets: [0, 90, 180, 270], shots: 6, gapMs: 200, rotationDeg: 15, sfx: "shot_spread" },
  { id: "sweep_down", kind: "sweep", aim: "none", bullet: makeBullet("small", { speed: 170 }), count: 1, shots: 9, gapMs: 90, spreadDeg: 100, sfx: "shot_vulcan" },
  { id: "flak_burst", kind: "aimed", bullet: makeBullet("flak", { speed: 170 }), count: 3, spreadDeg: 28, telegraphMs: 250, sfx: "rocket" },
  { id: "homing_single", kind: "homing", bullet: makeBullet("missile", { speed: 140, turnRate: 75 }), count: 1, telegraphMs: 700 },
  {
    id: "mortar_blast",
    kind: "delayedBlast",
    bullet: makeBullet("bomb"),
    count: 1,
    hazard: hz(40, 1000, 18, { blastFx: "blast_ground" }),
    sfx: "bomb_drop",
  },
  {
    id: "carpet_bomb",
    kind: "areaStrike",
    aim: "none",
    bullet: makeBullet("bomb"),
    blasts: 5,
    blastSpacing: 64,
    gapMs: 180,
    hazard: hz(34, 900, 18, { anchored: true, blastFx: "blast_ground" }),
    sfx: "bomb_drop",
  },
  { id: "mine_drop", kind: "straight", aim: "none", bullet: makeBullet("mine"), count: 1, sfx: "bomb_drop" },
  { id: "sweep_turret", kind: "sweep", aim: "player", bullet: makeBullet("small", { speed: 160 }), count: 1, shots: 6, gapMs: 120, spreadDeg: 50, sfx: "shot_vulcan" },
  { id: "twin_aimed", kind: "aimed", bullet: makeBullet("small", { speed: 170 }), count: 2, spreadDeg: 14, muzzles: [[-10, 8], [10, 8]], sfx: "shot_vulcan" },

  // ------------------------------------------------------------------ tier 3 (late chapters / elites)
  { id: "fan7_aimed", kind: "aimed", bullet: makeBullet("small_red", { speed: 170 }), count: 7, spreadDeg: 84, telegraphMs: 300, sfx: "shot_spread" },
  { id: "ring16", kind: "circular", bullet: makeBullet("orb", { speed: 125 }), count: 16, telegraphMs: 650, sfx: "shot_spread" },
  { id: "ring_double", kind: "burst", aim: "none", bullet: makeBullet("orb_cyan", { speed: 120 }), count: 12, spreadDeg: 330, shots: 2, gapMs: 300, telegraphMs: 650, sfx: "shot_spread" },
  { id: "spiral_double", kind: "spiral", bullet: makeBullet("orb", { speed: 125 }), count: 4, shots: 18, gapMs: 110, rotationDeg: 13, telegraphMs: 650, sfx: "shot_spread" },
  { id: "burst5_aimed", kind: "burst", bullet: makeBullet("needle", { speed: 240 }), count: 1, shots: 5, gapMs: 110, telegraphMs: 300, sfx: "shot_vulcan" },
  // round 7 (R5-6): 250 ms charge telegraph; several Hornet Aces on wide fired unannounced overlapping fans (expert hit, citadel wide)
  { id: "burst_fan3", kind: "burst", bullet: makeBullet("small_red", { speed: 180 }), count: 3, spreadDeg: 30, shots: 3, gapMs: 220, telegraphMs: 250, sfx: "shot_spread" },
  { id: "needle_lead", kind: "aimed", aim: "lead", bullet: makeBullet("needle", { speed: 300 }), count: 1, telegraphMs: 250, sfx: "shot_laser" },
  { id: "big_orb_slow", kind: "aimed", bullet: makeBullet("big", { speed: 95, damage: 20 }), count: 3, spreadDeg: 40, telegraphMs: 600, sfx: "rocket" },
  { id: "homing_pair", kind: "homing", bullet: makeBullet("missile", { speed: 160, turnRate: 90 }), count: 2, spreadDeg: 70, telegraphMs: 800 },
  { id: "homing_salvo4", kind: "homing", bullet: makeBullet("missile", { speed: 160, turnRate: 90 }), count: 2, spreadDeg: 80, shots: 2, gapMs: 500, telegraphMs: 900 },
  { id: "sweep_wide", kind: "sweep", aim: "player", bullet: makeBullet("small_red", { speed: 180 }), count: 2, shots: 10, gapMs: 90, spreadDeg: 120, telegraphMs: 300, sfx: "shot_vulcan" },
  {
    id: "artillery_triple",
    kind: "delayedBlast",
    bullet: makeBullet("bomb"),
    count: 3,
    blastSpacing: 70,
    hazard: hz(38, 1100, 20, { blastFx: "blast_ground" }),
    sfx: "bomb_drop",
  },
  {
    id: "carpet_heavy",
    kind: "areaStrike",
    aim: "player",
    bullet: makeBullet("bomb"),
    blasts: 7,
    blastSpacing: 58,
    gapMs: 140,
    hazard: hz(40, 1000, 22, { anchored: true, blastFx: "blast_ground" }),
    sfx: "bomb_drop",
  },
  { id: "flak_wall", kind: "straight", aim: "none", bullet: makeBullet("flak", { speed: 120 }), count: 5, blastSpacing: 44, telegraphMs: 600, sfx: "rocket" },
  { id: "aa_flak_volley", kind: "burst", bullet: makeBullet("flak", { speed: 180 }), count: 2, spreadDeg: 18, shots: 3, gapMs: 200, sfx: "rocket" },
  { id: "xcross8", kind: "multi", bullet: makeBullet("orb_cyan", { speed: 130 }), count: 1, offsets: [0, 45, 90, 135, 180, 225, 270, 315], shots: 4, gapMs: 260, rotationDeg: 11, telegraphMs: 650, sfx: "shot_spread" },
];

export const PATTERNS: Record<string, PatternDef> = Object.fromEntries(list.map((p) => [p.id, p]));

/** Resolve a pattern id or inline def (unknown ids fall back to `single_down` so content never crashes). */
export function resolvePattern(p: PatternDef | string): PatternDef {
  if (typeof p !== "string") return p;
  const def = PATTERNS[p];
  if (!def) {
    if (typeof console !== "undefined") console.warn(`[patterns] unknown pattern id "${p}", using single_down`);
    return PATTERNS.single_down;
  }
  return def;
}
