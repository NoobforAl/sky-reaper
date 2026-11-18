/**
 * SKY REAPER - shared constants. OWNER: Orchestrator. Do not edit without Orchestrator approval.
 */

/** Virtual (logical) resolution in game units. Origin top-left, +x right, +y DOWN. */
export const GAME_W = 480;
export const GAME_H = 854;

/**
 * Art is authored at native pixels and drawn at PIXEL_SCALE x so that one art-pixel == 2 game units.
 * A sprite of native size 24x24 occupies 48x48 game units. Always draw with integer scale.
 */
export const PIXEL_SCALE = 2;

/** Fixed simulation step (seconds). Engine runs the sim with an accumulator at this step. */
export const SIM_DT = 1 / 60;

/** Bitmap font name registered by the Asset agent (fallback: "monospace"). */
export const FONT = "sr_font";

/** Scene names (KAPLAY `scene()` ids). */
export const SCENES = {
  boot: "boot",
  menu: "menu",
  chapters: "chapters",
  shop: "shop",
  settings: "settings",
  game: "game",
  results: "results",
} as const;
export type SceneName = (typeof SCENES)[keyof typeof SCENES];

/** Chapter ids, in campaign order. */
export const CHAPTER_IDS = ["pacific", "jungle", "desert", "arctic", "citadel"] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

/** Biomes (one per chapter). Background tile keys follow the convention in assets.ts. */
export const BIOMES = ["ocean", "jungle", "desert", "arctic", "citadel"] as const;
export type Biome = (typeof BIOMES)[number];

/** Boss ids, one per chapter (the Level agent may add extra mid-bosses; ids are plain strings). */
export const BOSS_IDS = ["carrier", "heli_gunship", "land_fortress", "ice_dreadnought", "citadel_core"] as const;

/** Aircraft variants. */
export const AIRCRAFT_IDS = ["falcon", "raptor", "bulwark"] as const;
export type AircraftId = (typeof AIRCRAFT_IDS)[number];

/** Player primary (air-to-air) weapons. */
export const AIR_WEAPON_IDS = ["vulcan", "spread", "homing", "laser"] as const;
export type AirWeaponId = (typeof AIR_WEAPON_IDS)[number];

/** Player secondary (air-to-ground) ordnance. */
export const GROUND_WEAPON_IDS = ["bomb", "rocket", "pmissile", "heavy"] as const;
export type GroundWeaponId = (typeof GROUND_WEAPON_IDS)[number];

/** Pickups. */
export const PICKUP_KINDS = [
  "coin", // currency
  "power", // primary weapon level +1
  "bomb", // +1 ordnance stock
  "repair", // heal hull
  "shield", // refill shield
  "rapid", // TEMP: +fire rate
  "overdrive", // TEMP: x2 damage
  "magnet", // TEMP: pulls pickups
] as const;
export type PickupKind = (typeof PICKUP_KINDS)[number];

/**
 * Minimum enemy roster (ids are plain strings so agents can add more; additions MUST be
 * announced in docs/ASSET_REQUESTS.md so the Asset agent draws them).
 */
export const REQUIRED_AIR_ENEMIES = [
  "fighter_basic",
  "interceptor",
  "fighter_heavy",
  "bomber",
  "helicopter",
  "drone_kamikaze",
  "missile_carrier",
] as const;
export const REQUIRED_GROUND_ENEMIES = [
  "tank_light",
  "tank_heavy",
  "aa_turret",
  "missile_launcher",
  "radar_station",
  "military_base",
  "armored_vehicle",
] as const;
/** Extra enemies the Orchestrator expects (naval / chapter flavor). */
export const EXTRA_ENEMIES = ["gunboat", "destroyer", "oil_tank", "hangar", "ice_turret", "citadel_turret"] as const;
