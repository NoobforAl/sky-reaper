/**
 * Weapon-side types shared by src/weapons, src/player and src/core.
 * (Owned by the Engine agent. Not part of src/contracts.)
 */
import type { AirWeaponId, AircraftDef, BulletSpawn, Enemy, GroundWeaponId, SkinId, WorldAPI } from "../contracts";

/** Extra knobs only the engine understands (player projectiles). */
export interface PlayerBulletSpawn extends BulletSpawn {
  /** homing / accel: speed cap */
  maxSpeed?: number;
  /** pre-locked target enemy id (pmissile, homing salvo) */
  targetId?: number;
  /** lobbed/impact blast waits this many seconds (telegraph ring) before exploding */
  blastDelay?: number;
  /** blast hits air units too */
  blastHitsAir?: boolean;
  /** render hint: "bomb" | "heavy" | "rocket" | "pmissile" | "homing" | "vulcan" | "spread" */
  kind?: string;
}

/** Effective player stats computed from save data (upgrades + aircraft + unlocks). */
export interface Loadout {
  aircraft: AircraftDef;
  /** paint scheme for the selected aircraft (owned + selected in the save; "standard" fallback) */
  skin: SkinId;
  maxHp: number;
  maxShield: number;
  /** shield points regenerated per second once the delay has elapsed */
  shieldRegen: number;
  /** seconds without damage before the shield starts regenerating */
  shieldDelay: number;
  maxBombs: number;
  startBombs: number;
  /** player max speed, game units / s */
  speed: number;
  damageMult: number;
  fireRateMult: number;
  flareCooldown: number;
  hitRadius: number;
  airWeapons: AirWeaponId[];
  groundWeapons: GroundWeaponId[];
}

/**
 * What weapon fire logic and the player controller need from the world.
 * Implemented by core/world.ts `World`.
 */
export interface FireContext extends WorldAPI {
  spawnPlayerBullet(spec: PlayerBulletSpawn): void;
  /** rank-th nearest enemy that an "air" class bullet can hurt (on screen); rank wraps. */
  pickAirTarget(x: number, y: number, rank: number): Enemy | null;
  /** nearest on-screen enemy that ground ordnance can hurt, ahead of (or near) y */
  pickGroundTarget(x: number, y: number): Enemy | null;
  /** one tick of piercing beam damage in the strip x +- halfW above yBottom. */
  beamTick(x: number, halfW: number, yBottom: number, damage: number): void;
  /** deploy a flare burst at the player's position (diverts / destroys missiles, clears bullets) */
  deployFlare(x: number, y: number, radius: number): void;
}
