/**
 * Cached sprite keys per enemy def, so the sim step and the renderer never concatenate strings per frame.
 * One small object per EnemyDef, built on first use.
 */
import type { EnemyDef, PickupKind } from "../contracts";

export interface EnemyKeys {
  /** `def.sprite ?? "enemy_<id>"` */
  base: string;
  bankL: string;
  bankR: string;
  gun: string;
  dead: string;
}

const cache = new WeakMap<EnemyDef, EnemyKeys>();

export function enemyKeys(def: EnemyDef): EnemyKeys {
  let k = cache.get(def);
  if (!k) {
    const base = def.sprite ?? "enemy_" + def.id;
    k = { base, bankL: base + "_bankl", bankR: base + "_bankr", gun: base + "_gun", dead: "enemy_" + def.id + "_dead" };
    cache.set(def, k);
  }
  return k;
}

const pickupCache: Partial<Record<PickupKind, string>> = {};

export function pickupKey(kind: PickupKind): string {
  return (pickupCache[kind] ??= "pickup_" + kind);
}
