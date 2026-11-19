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

/**
 * Round 6 item 13: per-chapter palette variants for AIR enemies (planes, helicopters, drones). The asset agent registers
 * `K + "__" + biome` (biome = ChapterDef.biome) for every air sprite key K (bank / dmg / anim strips included); each key
 * falls back to plain K when its variant is not registered. Bosses keep their own art (the World passes plain
 * enemyKeys for boss parts). One cache per biome, keyed by def, built at the first spawn: no per-frame string building.
 */
const biomeCache = new Map<string, WeakMap<EnemyDef, EnemyKeys>>();

export function enemyKeysForBiome(def: EnemyDef, biome: string, has: (key: string) => boolean): EnemyKeys {
  const plain = enemyKeys(def);
  if (def.layer !== "air" || !biome) return plain;
  let m = biomeCache.get(biome);
  if (!m) {
    m = new WeakMap();
    biomeCache.set(biome, m);
  }
  let k = m.get(def);
  if (!k) {
    const suf = "__" + biome;
    const v = (key: string): string => (has(key + suf) ? key + suf : key);
    const c: EnemyKeys = {
      base: v(plain.base),
      bankL: v(plain.bankL),
      bankR: v(plain.bankR),
      gun: v(plain.gun),
      dead: v(plain.dead),
      dmg: v(plain.dmg),
      bankLDmg: v(plain.bankLDmg),
      bankRDmg: v(plain.bankRDmg),
      burn: v(plain.burn),
      // muzzle placement is geometry of the base art, identical for every palette
      muzzle: plain.muzzle,
    };
    const same = c.base === plain.base && c.bankL === plain.bankL && c.bankR === plain.bankR && c.dmg === plain.dmg;
    k = same && c.gun === plain.gun && c.bankLDmg === plain.bankLDmg && c.bankRDmg === plain.bankRDmg ? plain : c;
    m.set(def, k);
  }
  return k;
}

const pickupCache:Partial<Record<PickupKind, string>> = {};

export function pickupKey(kind: PickupKind): string {
  return (pickupCache[kind] ??= "pickup_" + kind);
}
