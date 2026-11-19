/**
 * Enemy animation tables + helpers (docs/ANIM_SPEC.md). Everything here is built once per def at key-cache time
 * (spritekeys.ts) or is pure integer/float math, so the renderer selects frames without allocating.
 */

/** bank art hysteresis on the smoothed `e.bank` (ANIM_SPEC §2): enter at 0.5, leave at 0.35 */
export const BANK_ENTER = 0.5;
export const BANK_LEAVE = 0.35;
/** `_dmg` art below this HP fraction */
export const DMG_FRAC = 0.5;
/** wreck: burning strip for the first BURN_SECS of its 8 s life, then the cold `_dead` decal */
export const BURN_SECS = 5;
/** one smoke wisp per burning on-screen wreck every this many seconds */
export const WRECK_SMOKE_EVERY = 0.35;
/** muzzle flash lifetime after a shot (s) */
export const FLASH_SECS = 0.1;
/** air spin-out after death */
export const SPINOUT_LIFE = 0.55;

/** `_gun` state strip: 0 rest, 1 fire (recoil 2 px + flash), 2 return */
export function gunFrame(fireT: number): number {
  return fireT < 0.06 ? 1 : fireT < 0.14 ? 2 : 0;
}

/** `fx_muzzle_e*` frame over the flash life (3 frames) */
export function muzzleFrame(fireT: number): number {
  const f = (fireT * 30) | 0;
  return f > 2 ? 2 : f;
}

/** next bank selection (-1 left, 0 level, 1 right) with hysteresis */
export function bankSelect(prev: number, bank: number): number {
  if (prev < 0) return bank < -BANK_LEAVE ? -1 : bank > BANK_ENTER ? 1 : 0;
  if (prev > 0) return bank > BANK_LEAVE ? 1 : bank < -BANK_ENTER ? -1 : 0;
  return bank < -BANK_ENTER ? -1 : bank > BANK_ENTER ? 1 : 0;
}

export function debrisKey(size: "s" | "m" | "l"): string {
  return size === "l" ? "debris_l" : size === "m" ? "debris_m" : "debris_s";
}

/**
 * Muzzle flash placement for one enemy art id. Points are native px (x,y pairs) relative to the sprite centre in
 * sprite space (+y toward the nose); `±x` rows are expanded to both points. `aft` (bomber tail gunner, destroyer aft
 * turret) is used when the shot heads backwards relative to the body. `gun`: offsets are in `_gun` overlay space.
 */
export interface MuzzleSpec {
  fx: string;
  gun: boolean;
  fore: Float32Array;
  aft: Float32Array | null;
}

type Row = { fx: "s" | "l"; gun?: boolean; fore: number[][]; aft?: number[][] };

// [x, y] or [x, y, 1] for a symmetric ±x pair (ANIM_SPEC §3 table)
const RAW: Record<string, Row> = {
  fighter_basic: { fx: "s", fore: [[0, 10]] },
  interceptor: { fx: "s", fore: [[0, 12]] },
  fighter_heavy: { fx: "l", fore: [[0, 15]] },
  bomber: { fx: "s", fore: [[0, 15]], aft: [[0, -15]] },
  missile_carrier: { fx: "s", fore: [[0, 2]] },
  helicopter: { fx: "s", fore: [[0, 13]] },
  gunship_light: { fx: "s", fore: [[0, 12]] },
  shield_drone: { fx: "s", fore: [[0, 0]] },
  tank_light: { fx: "s", gun: true, fore: [[0, 8]] },
  tank_heavy: { fx: "l", gun: true, fore: [[0, 12]] },
  aa_turret: { fx: "s", gun: true, fore: [[1.5, 8, 1]] },
  ice_turret: { fx: "s", gun: true, fore: [[0, 8]] },
  citadel_turret: { fx: "l", gun: true, fore: [[2, 10, 1]] },
  ice_walker: { fx: "l", gun: true, fore: [[2.5, 12, 1]] },
  armored_vehicle: { fx: "s", fore: [[0, 11]] },
  gunboat: { fx: "s", fore: [[0, 12]] },
  destroyer: { fx: "l", fore: [[1, 20, 1]], aft: [[1, -21, 1]] },
  sand_crawler: { fx: "s", fore: [[0, 12]] },
  radar_station: { fx: "s", fore: [[0, 0]] },
  military_base: { fx: "s", fore: [[0, 0]] },
  hangar: { fx: "s", fore: [[0, 0]] },
  oil_tank: { fx: "s", fore: [[0, 0]] },
  // drone_kamikaze, mine_layer, missile_launcher, sam_site: no gun flash (kamikaze / mines / missiles only)
};

function pts(rows: number[][]): Float32Array {
  const out: number[] = [];
  for (const r of rows) {
    out.push(r[0]!, r[1]!);
    if (r[2]) out.push(-r[0]!, r[1]!);
  }
  return new Float32Array(out);
}

/** built once per def (called from enemyKeys); `base` is the def's base sprite key, so elites share their base row */
export function muzzleSpecFor(base: string): MuzzleSpec | null {
  const id = base.startsWith("enemy_") ? base.slice(6) : base;
  const r = RAW[id];
  if (!r) return null;
  return { fx: r.fx === "l" ? "fx_muzzle_e_l" : "fx_muzzle_e", gun: !!r.gun, fore: pts(r.fore), aft: r.aft ? pts(r.aft) : null };
}

/**
 * QA A/B switch (like `window.__skySeparation`): `window.__skyAnim.enabled = false` restores the pre-round-5 look
 * (base/bank art only, gun frame 0, no muzzle flash, no spin-out, rect debris, cold wrecks) for perf comparisons.
 */
export const ANIM_QA = { enabled: true };
if (typeof window !== "undefined") (window as unknown as { __skyAnim?: typeof ANIM_QA }).__skyAnim = ANIM_QA;
