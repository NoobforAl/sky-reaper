/**
 * Weapons module (Engine agent): data tables, progression helpers and fire logic.
 *  - PLAYER_WEAPONS / UPGRADES / AIRCRAFT tables (ARCHITECTURE.md 3.1 / 3.6)
 *  - shopCost(def, level), computeLoadout(save.data)
 *  - fire logic lives in ./fire.ts (re-exported)
 */
import type { AircraftDef, AirWeaponId, GroundWeaponId, PlayerWeaponDef, SaveData, UpgradeDef, UpgradeId } from "../contracts";
import { AIR_WEAPON_IDS, GROUND_WEAPON_IDS } from "../contracts";
import type { Loadout } from "./types";

export * from "./types";
export * from "./fire";

export const PLAYER_WEAPONS: PlayerWeaponDef[] = [
  { id: "vulcan", kind: "air", name: "VULCAN", desc: "Rapid twin stream. Widens to 4 barrels + wing guns at max power.", fireRate: 12, damage: 3, unlockCost: 0 },
  { id: "spread", kind: "air", name: "SPREAD", desc: "3 to 7-way fan. Devastating up close, short range.", fireRate: 5, damage: 3, unlockCost: 400 },
  { id: "homing", kind: "air", name: "HOMING", desc: "Slow missiles that hunt the nearest target.", fireRate: 3, damage: 9, unlockCost: 900 },
  { id: "laser", kind: "air", name: "LASER", desc: "Continuous piercing beam. Hits everything in line.", fireRate: 10, damage: 5, unlockCost: 1500 },
  { id: "bomb", kind: "ground", name: "BOMB", desc: "Lobbed ahead, blasts ground targets in an area. 1 ordnance.", fireRate: 2, damage: 75, unlockCost: 0, ammoCost: 1 },
  { id: "rocket", kind: "ground", name: "ROCKET", desc: "Two fast rockets. Hits ground AND air. 1 ordnance.", fireRate: 1.8, damage: 18, unlockCost: 600, ammoCost: 1 },
  { id: "pmissile", kind: "ground", name: "SEEKER", desc: "Locks the nearest ground target. High damage. 1 ordnance.", fireRate: 1.25, damage: 100, unlockCost: 1200, ammoCost: 1 },
  { id: "heavy", kind: "ground", name: "HEAVY BOMB", desc: "Slow, huge delayed blast that also hits air. 2 ordnance.", fireRate: 0.55, damage: 240, unlockCost: 1800, ammoCost: 2 },
];

export const UPGRADES: UpgradeDef[] = [
  { id: "damage", name: "DAMAGE", desc: "+8% weapon damage per level", maxLevel: 8, baseCost: 90, perLevel: 0.08 },
  { id: "fireRate", name: "FIRE RATE", desc: "+6% fire rate per level", maxLevel: 8, baseCost: 100, perLevel: 0.06 },
  { id: "hull", name: "HULL", desc: "+10 hull HP per level", maxLevel: 8, baseCost: 70, perLevel: 10 },
  { id: "shield", name: "SHIELD", desc: "+8 shield and faster regeneration per level", maxLevel: 8, baseCost: 80, perLevel: 8 },
  { id: "bombs", name: "ORDNANCE", desc: "+1 bomb capacity per level", maxLevel: 8, baseCost: 120, perLevel: 1 },
  { id: "speed", name: "ENGINES", desc: "+4% speed per level", maxLevel: 8, baseCost: 60, perLevel: 0.04 },
  { id: "flares", name: "FLARES", desc: "-0.8 s flare cooldown per level", maxLevel: 8, baseCost: 60, perLevel: 0.8 },
];

export const AIRCRAFT: AircraftDef[] = [
  { id: "falcon", name: "FALCON", desc: "Balanced all-rounder.", unlockCost: 0, speed: 1, hp: 1, shield: 1, fireRate: 1, hitRadius: 4, bombs: 5 },
  { id: "raptor", name: "RAPTOR", desc: "Fast and agile, fragile hull, +10% fire rate, tiny hitbox.", unlockCost: 2500, speed: 1.25, hp: 0.75, shield: 1, fireRate: 1.1, hitRadius: 3.5, bombs: 5 },
  { id: "bulwark", name: "BULWARK", desc: "Slow flying fortress: +50% hull, +40% shield, +2 ordnance.", unlockCost: 3500, speed: 0.85, hp: 1.5, shield: 1.4, fireRate: 1, hitRadius: 4, bombs: 7 },
];

// ------------------------------------------------------------------ progression helpers

export const BASE_HP = 100;
export const BASE_SHIELD = 40;
export const BASE_SPEED = 270;
export const BASE_SHIELD_REGEN = 10;
export const BASE_SHIELD_DELAY = 3;
export const BASE_FLARE_CD = 12;
export const MIN_FLARE_CD = 7;

/** cost of buying the NEXT level of an upgrade, given its current level (Infinity when maxed). */
export function shopCost(def: UpgradeDef, level: number): number {
  if (level >= def.maxLevel) return Infinity;
  return Math.round(def.baseCost * Math.pow(level + 1, 1.4));
}

function lvl(save: SaveData, id: UpgradeId): number {
  const v = save.upgrades?.[id];
  return typeof v === "number" && v > 0 ? Math.floor(v) : 0;
}

export function getAircraft(id: string): AircraftDef {
  return AIRCRAFT.find((a) => a.id === id) ?? AIRCRAFT[0]!;
}

export function getWeapon(id: string): PlayerWeaponDef {
  return PLAYER_WEAPONS.find((w) => w.id === id) ?? PLAYER_WEAPONS[0]!;
}

/** Turn SaveData (upgrades, aircraft, unlocks) into effective player stats. */
export function computeLoadout(save: SaveData): Loadout {
  const ac = getAircraft(save.selectedAircraft);
  const up = (id: UpgradeId) => UPGRADES.find((u) => u.id === id)!;
  const lShield = lvl(save, "shield");
  const air = AIR_WEAPON_IDS.filter((id) => id === "vulcan" || save.unlockedAir?.includes(id)) as AirWeaponId[];
  const ground = GROUND_WEAPON_IDS.filter((id) => id === "bomb" || save.unlockedGround?.includes(id)) as GroundWeaponId[];
  const maxBombs = ac.bombs + lvl(save, "bombs") * up("bombs").perLevel;
  return {
    aircraft: ac,
    maxHp: Math.round(BASE_HP * ac.hp + lvl(save, "hull") * up("hull").perLevel),
    maxShield: Math.round(BASE_SHIELD * ac.shield + lShield * up("shield").perLevel),
    shieldRegen: BASE_SHIELD_REGEN + lShield * 1.5,
    shieldDelay: BASE_SHIELD_DELAY,
    maxBombs,
    startBombs: maxBombs,
    speed: BASE_SPEED * ac.speed * (1 + lvl(save, "speed") * up("speed").perLevel),
    damageMult: 1 + lvl(save, "damage") * up("damage").perLevel,
    fireRateMult: ac.fireRate * (1 + lvl(save, "fireRate") * up("fireRate").perLevel),
    flareCooldown: Math.max(MIN_FLARE_CD, BASE_FLARE_CD - lvl(save, "flares") * up("flares").perLevel),
    hitRadius: ac.hitRadius,
    airWeapons: air,
    groundWeapons: ground,
  };
}
