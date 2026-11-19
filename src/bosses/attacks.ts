/**
 * Boss pattern library (inline PatternDefs built from the shared bullet presets).
 * Fairness: fan steps >= 12 deg, bullet speed <= 260 (aimed singles <= 340), missiles turn <= 110 deg/s,
 * big attacks telegraph >= 800 ms (BOSS_TUNING.bigTelegraphMs).
 */
import type { HazardSpawn, PatternDef } from "../contracts";
import { makeBullet } from "../patterns";

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

const BIG = 900;

export const BP = {
  // ---- small arms
  aimed: { id: "b_aimed", kind: "aimed", bullet: makeBullet("small", { speed: 170 }), count: 1, sfx: "shot_vulcan" },
  needle: { id: "b_needle", kind: "aimed", bullet: makeBullet("needle", { speed: 250 }), count: 1, telegraphMs: 200, sfx: "shot_laser" },
  burst3: { id: "b_burst3", kind: "burst", bullet: makeBullet("needle", { speed: 210 }), count: 1, shots: 3, gapMs: 150, sfx: "shot_vulcan" },
  burst5: { id: "b_burst5", kind: "burst", bullet: makeBullet("needle", { speed: 230 }), count: 1, shots: 5, gapMs: 110, telegraphMs: 300, sfx: "shot_vulcan" },
  fan3: { id: "b_fan3", kind: "aimed", bullet: makeBullet("small", { speed: 155 }), count: 3, spreadDeg: 30, sfx: "shot_spread" },
  fan5: { id: "b_fan5", kind: "aimed", bullet: makeBullet("small", { speed: 160 }), count: 5, spreadDeg: 56, sfx: "shot_spread" },
  fan5Down: { id: "b_fan5_down", kind: "spread", aim: "none", bullet: makeBullet("small_red", { speed: 150 }), count: 5, spreadDeg: 60, sfx: "shot_spread" },
  fan7: { id: "b_fan7", kind: "aimed", bullet: makeBullet("small_red", { speed: 165 }), count: 7, spreadDeg: 84, telegraphMs: 400, sfx: "shot_spread" },
  sweep: { id: "b_sweep", kind: "sweep", aim: "player", bullet: makeBullet("small", { speed: 165 }), count: 1, shots: 8, gapMs: 110, spreadDeg: 70, sfx: "shot_vulcan" },
  sweepWide: { id: "b_sweep_wide", kind: "sweep", aim: "player", bullet: makeBullet("small_red", { speed: 175 }), count: 2, spreadDeg: 120, shots: 10, gapMs: 90, telegraphMs: 500, sfx: "shot_vulcan" },
  flak: { id: "b_flak", kind: "aimed", bullet: makeBullet("flak", { speed: 165 }), count: 3, spreadDeg: 28, telegraphMs: 250, sfx: "rocket" },
  bigOrbs: { id: "b_big_orbs", kind: "aimed", bullet: makeBullet("big", { speed: 100, damage: 18 }), count: 3, spreadDeg: 40, telegraphMs: BIG, sfx: "rocket" },
  shell: { id: "b_shell", kind: "aimed", bullet: makeBullet("big", { speed: 135, damage: 16 }), count: 1, telegraphMs: 500, sfx: "rocket" },

  // ---- rings / spirals (big: telegraphed)
  ring12: { id: "b_ring12", kind: "circular", bullet: makeBullet("orb", { speed: 115 }), count: 12, telegraphMs: BIG, sfx: "shot_spread" },
  ring16: { id: "b_ring16", kind: "circular", bullet: makeBullet("orb", { speed: 120 }), count: 16, telegraphMs: BIG, sfx: "shot_spread" },
  ringCyan: { id: "b_ring_cyan", kind: "burst", aim: "none", bullet: makeBullet("orb_cyan", { speed: 115 }), count: 12, spreadDeg: 330, shots: 2, gapMs: 320, telegraphMs: BIG, sfx: "shot_spread" },
  spiral: { id: "b_spiral", kind: "spiral", bullet: makeBullet("orb", { speed: 110 }), count: 3, shots: 14, gapMs: 140, rotationDeg: 15, telegraphMs: BIG, sfx: "shot_spread" },
  spiral4: { id: "b_spiral4", kind: "spiral", bullet: makeBullet("orb", { speed: 120 }), count: 4, shots: 18, gapMs: 115, rotationDeg: 13, telegraphMs: BIG, sfx: "shot_spread" },
  cross: { id: "b_cross", kind: "multi", bullet: makeBullet("orb_cyan", { speed: 120 }), count: 1, offsets: [0, 90, 180, 270], shots: 8, gapMs: 180, rotationDeg: 12, telegraphMs: 600, sfx: "shot_spread" },
  xcross: { id: "b_xcross", kind: "multi", bullet: makeBullet("orb_cyan", { speed: 125 }), count: 1, offsets: [0, 45, 90, 135, 180, 225, 270, 315], shots: 5, gapMs: 260, rotationDeg: 11, telegraphMs: BIG, sfx: "shot_spread" },

  // ---- missiles (always decoyable: flares!)
  missile1: { id: "b_missile1", kind: "homing", bullet: makeBullet("missile", { speed: 140, turnRate: 75 }), count: 1, telegraphMs: BIG, sfx: "missile_launch" },
  missile2: { id: "b_missile2", kind: "homing", bullet: makeBullet("missile", { speed: 145, turnRate: 82 }), count: 2, spreadDeg: 70, telegraphMs: BIG, sfx: "missile_launch" },
  missile4: { id: "b_missile4", kind: "homing", bullet: makeBullet("missile", { speed: 150, turnRate: 80 }), count: 2, spreadDeg: 80, shots: 2, gapMs: 500, telegraphMs: 1000, sfx: "missile_launch" },

  // ---- area denial
  mines: { id: "b_mines", kind: "spread", aim: "none", bullet: makeBullet("mine", { speed: 55 }), count: 3, spreadDeg: 60, telegraphMs: 400, sfx: "bomb_drop" },
  artillery: {
    id: "b_artillery",
    kind: "delayedBlast",
    bullet: makeBullet("bomb"),
    count: 3,
    blastSpacing: 72,
    hazard: hz(38, 1100, 20, { blastFx: "blast_ground" }),
    sfx: "bomb_drop",
  },
  carpet: {
    id: "b_carpet",
    kind: "areaStrike",
    aim: "player",
    bullet: makeBullet("bomb"),
    blasts: 6,
    blastSpacing: 60,
    gapMs: 150,
    hazard: hz(38, 1000, 20, { blastFx: "blast_ground" }),
    sfx: "bomb_drop",
  },
} satisfies Record<string, PatternDef>;
