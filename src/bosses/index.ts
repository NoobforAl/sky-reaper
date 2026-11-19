/**
 * Boss module (Level agent): `bosses: BossFactory` with the five campaign bosses.
 *
 * Boss parts are EnemyDefs (src/bosses/parts.ts, ids `boss_<bossId>_<part>`, movement "scripted") registered into
 * `enemySystem.defs` at import time via `registerBossDefs()` (and again on create, idempotent), so
 * `world.spawnEnemy("boss_carrier_turret", ...)` works through the normal Engine path.
 * The Engine calls `create(id, world)` from `world.startBoss(id)`, `update()` each sim step, `onPartDestroyed(part)`
 * when a part (opts.data.part) dies, and reads `hud()` for the boss bar. See docs/LEVEL_NOTES.md (phase tables).
 */
import { BOSS_IDS, type BossController, type BossFactory, type WorldAPI } from "../contracts";
import { enemySystem } from "../enemies";
import { CarrierBoss } from "./carrier";
import { CitadelCoreBoss } from "./citadel_core";
import { HeliGunshipBoss } from "./heli_gunship";
import { IceDreadnoughtBoss } from "./ice_dreadnought";
import { LandFortressBoss } from "./land_fortress";
import { registerBossDefs } from "./parts";

export { BOSS_PART_DEFS, registerBossDefs } from "./parts";
export { BOSS_TUNING } from "./framework";

registerBossDefs(enemySystem.defs as Record<string, import("../contracts").EnemyDef>);

const CTORS: Record<string, new (w: WorldAPI) => BossController> = {
  carrier: CarrierBoss,
  heli_gunship: HeliGunshipBoss,
  land_fortress: LandFortressBoss,
  ice_dreadnought: IceDreadnoughtBoss,
  citadel_core: CitadelCoreBoss,
};

export const bosses: BossFactory = {
  ids: [...BOSS_IDS],
  create(bossId: string, world: WorldAPI): BossController {
    registerBossDefs(enemySystem.defs as Record<string, import("../contracts").EnemyDef>);
    const C = CTORS[bossId] ?? CarrierBoss;
    return new C(world);
  },
};
