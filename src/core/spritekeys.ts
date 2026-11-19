/**
 * Cached sprite keys per enemy def, so the sim step and the renderer never concatenate strings per frame.
 * One small object per EnemyDef, built on first use. Animation variants per docs/ANIM_SPEC.md.
 */
import type { EnemyDef, PickupKind } from "../contracts";
import { muzzleSpecFor, type MuzzleSpec } from "./anim";

export interface EnemyKeys {
  /** `def.sprite ?? "enemy_<id>"` */
  base: string;
  bankL: string;
  bankR: string;
  gun: string;
  dead: string;
  /** damaged body (< 50 % HP) and damaged banking variants */
  dmg: string;
  bankLDmg: string;
  bankRDmg: string;
  /** burning wreck strip (ground units), shown before `dead` */
  burn: string;
  /** muzzle flash placement (null: never flashes) */
  muzzle: MuzzleSpec | null;
}

const cache = new WeakMap<EnemyDef, EnemyKeys>();

export function enemyKeys(def: EnemyDef): EnemyKeys {
  let k = cache.get(def);
  if (!k) {
    const base = def.sprite ?? "enemy_" + def.id;
    k = {
      base,
      bankL: base + "_bankl",
      bankR: base + "_bankr",
      gun: base + "_gun",
      // from the base key so elites (def.sprite = base art) get the base wreck too
      dead: base + "_dead",
      dmg: base + "_dmg",
      bankLDmg: base + "_bankl_dmg",
      bankRDmg: base + "_bankr_dmg",
      burn: base + "_burn",
      muzzle: muzzleSpecFor(base),
    };
    cache.set(def, k);
  }
  return k;
}

const pickupCache: Partial<Record<PickupKind, string>> = {};

export function pickupKey(kind: PickupKind): string {
  return (pickupCache[kind] ??= "pickup_" + kind);
}
