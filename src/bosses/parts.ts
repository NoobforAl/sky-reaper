/**
 * Boss part EnemyDefs (Level agent). Every boss is a rig of ordinary Enemies with movement "scripted":
 * the BossController positions them each step and runs their attacks; the EnemySystem does nothing for them.
 *
 * Registration: `registerBossDefs(target)` copies BOSS_PART_DEFS into an EnemyDef record. It is called at import
 * time of src/bosses/index.ts with `enemySystem.defs` (from ../enemies), and again (idempotently) in
 * `bosses.create()` in case the Enemy module replaced its defs object. Ids: `boss_<bossId>_<part>`, sprite = id.
 *
 * Rules used here:
 *  - big "bodies" are scenery (destructible:false) with a tiny 2x2 hitbox so they never soak bullets meant
 *    for the parts drawn on top; they are spawned FIRST so they render underneath.
 *  - ground-layer parts set anchored:false so the Engine never adds scroll (the controller places them).
 *  - attacks: [] — patterns are driven by the controller (src/bosses/*.ts).
 */
import type { EnemyDef, Layer, Vulnerability } from "../contracts";

type RGB = [number, number, number];

function part(
  boss: string,
  name: string,
  o: {
    layer: Layer;
    vuln: Vulnerability;
    hp: number;
    size: [number, number];
    color: RGB;
    score?: number;
    hitbox?: [number, number];
    destructible?: boolean;
    contact?: number;
    armor?: number;
    explosion?: "s" | "m" | "l";
    rotates?: boolean;
    tags?: string[];
  },
): EnemyDef {
  const id = `boss_${boss}_${name}`;
  return {
    id,
    name: `${boss} ${name}`,
    layer: o.layer,
    vulnerableTo: o.vuln,
    hp: o.hp,
    contactDamage: o.contact ?? 0,
    score: o.score ?? Math.round(o.hp * 2),
    size: o.size,
    hitbox: o.hitbox,
    sprite: id,
    color: o.color,
    movement: { kind: "scripted", speed: 0 },
    attacks: [],
    drops: [],
    explosion: o.explosion ?? "l",
    armor: o.armor,
    destructible: o.destructible,
    anchored: false,
    rotatesToPlayer: o.rotates,
    tags: ["boss", ...(o.tags ?? [])],
  };
}

const SCENERY = { hp: 1, destructible: false, hitbox: [2, 2] as [number, number], score: 0 };

export const BOSS_PART_DEFS: Record<string, EnemyDef> = {};
function add(d: EnemyDef) {
  BOSS_PART_DEFS[d.id] = d;
}

// ---------------------------------------------------------------- carrier (ch1, naval / ground)
add(part("carrier", "hull", { ...SCENERY, layer: "ground", vuln: "ground", size: [96, 240], color: [70, 84, 96] }));
add(part("carrier", "turret", { layer: "ground", vuln: "both", hp: 150, size: [24, 24], color: [120, 130, 140], rotates: true, explosion: "m", tags: ["aa"] }));
add(part("carrier", "launcher", { layer: "ground", vuln: "ground", hp: 150, size: [24, 24], color: [150, 110, 80], explosion: "m" }));
add(part("carrier", "aa", { layer: "ground", vuln: "both", hp: 110, size: [16, 16], color: [140, 140, 110], rotates: true, explosion: "m", tags: ["aa"] }));
add(part("carrier", "bridge", { layer: "ground", vuln: "both", hp: 700, size: [32, 40], color: [170, 170, 180], score: 3000 }));

// ---------------------------------------------------------------- heli_gunship (ch2, air)
add(part("heli_gunship", "body", { layer: "air", vuln: "air", hp: 1000, size: [64, 72], hitbox: [80, 104], color: [70, 96, 60], contact: 25, score: 4000 }));
add(part("heli_gunship", "rotor", { ...SCENERY, layer: "air", vuln: "air", size: [96, 96], color: [40, 40, 40] }));
add(part("heli_gunship", "tail", { layer: "air", vuln: "air", hp: 240, size: [16, 40], hitbox: [24, 64], color: [80, 104, 66], explosion: "m" }));
add(part("heli_gunship", "gunpod", { layer: "air", vuln: "air", hp: 220, size: [20, 28], hitbox: [32, 44], color: [110, 110, 90], explosion: "m" }));
add(part("heli_gunship", "missilepod", { layer: "air", vuln: "air", hp: 180, size: [20, 20], hitbox: [30, 30], color: [150, 90, 70], explosion: "m" }));

// ---------------------------------------------------------------- land_fortress (ch3, ground)
add(part("land_fortress", "tread", { layer: "ground", vuln: "ground", hp: 240, size: [20, 160], hitbox: [36, 300], color: [60, 56, 50], explosion: "l", tags: ["vehicle"] }));
add(part("land_fortress", "body", { ...SCENERY, layer: "ground", vuln: "ground", size: [128, 160], color: [120, 100, 70] }));
add(part("land_fortress", "turret_big", { layer: "ground", vuln: "both", hp: 520, size: [40, 40], color: [140, 120, 90], rotates: true, explosion: "l" }));
add(part("land_fortress", "turret_small", { layer: "ground", vuln: "both", hp: 170, size: [20, 20], color: [150, 130, 100], rotates: true, explosion: "m", tags: ["aa"] }));
add(part("land_fortress", "core", { layer: "ground", vuln: "both", hp: 900, size: [32, 32], color: [255, 170, 60], score: 5000 }));

// ---------------------------------------------------------------- ice_dreadnought (ch4, flying ship)
add(part("ice_dreadnought", "hull", { ...SCENERY, layer: "air", vuln: "air", size: [96, 180], color: [150, 170, 190] }));
add(part("ice_dreadnought", "engine", { layer: "air", vuln: "air", hp: 280, size: [24, 24], hitbox: [40, 40], color: [90, 160, 220], explosion: "m" }));
add(part("ice_dreadnought", "cannon", { layer: "air", vuln: "air", hp: 400, size: [32, 32], hitbox: [52, 52], color: [120, 130, 150], explosion: "l" }));
add(part("ice_dreadnought", "drill", { layer: "air", vuln: "air", hp: 320, size: [24, 40], hitbox: [40, 70], color: [200, 210, 230], contact: 30, explosion: "m" }));
add(part("ice_dreadnought", "core", { layer: "air", vuln: "air", hp: 900, size: [28, 28], hitbox: [48, 48], color: [120, 230, 255], score: 6000 }));

// ---------------------------------------------------------------- citadel_core (ch5, final)
add(part("citadel_core", "emitter", { layer: "air", vuln: "air", hp: 600, size: [40, 40], hitbox: [64, 64], color: [200, 60, 90], explosion: "l" }));
add(part("citadel_core", "core", { layer: "air", vuln: "air", hp: 1400, size: [48, 48], hitbox: [80, 80], color: [255, 60, 100], contact: 30, score: 10000 }));
add(part("citadel_core", "ring", { ...SCENERY, layer: "air", vuln: "air", size: [160, 160], color: [90, 90, 110] }));
add(part("citadel_core", "shieldgen", { layer: "air", vuln: "air", hp: 360, size: [24, 24], hitbox: [42, 42], color: [80, 200, 255], explosion: "m" }));
add(part("citadel_core", "cannon", { layer: "air", vuln: "both", hp: 440, size: [32, 32], hitbox: [52, 52], color: [170, 170, 190], explosion: "l" }));

/** copy boss part defs into an EnemyDef record (e.g. enemySystem.defs). Idempotent; never overwrites. */
export function registerBossDefs(target: Record<string, EnemyDef>): void {
  for (const id in BOSS_PART_DEFS) {
    if (!target[id]) {
      try {
        target[id] = BOSS_PART_DEFS[id]!;
      } catch {
        /* frozen record: Engine will warn "unknown enemy def" */
      }
    }
  }
}
