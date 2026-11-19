/**
 * SKY REAPER - shared constants. OWNER: Orchestrator. Do not edit without Orchestrator approval.
 */

/**
 * Virtual (logical) resolution in game units. Origin top-left, +x right, +y DOWN.
 *
 * GAME_H is fixed. GAME_W is chosen ONCE at module load:
 *  - portrait / narrow windows (phones): DESIGN_W = 480  -> classic 480x854 portrait field
 *  - landscape desktop windows: the playfield fills the screen width, GAME_W = 854 * aspect (480..MAX_GAME_W, even)
 * Override for testing with the URL query `?layout=portrait` or `?layout=wide`.
 * NEVER cache GAME_W-derived values in module-level code that runs before this module (it is always first) - fine as-is.
 * Content (level event x, formation offsets) is AUTHORED in DESIGN_W space; the level runner maps it to GAME_W.
 */
export const DESIGN_W = 480;
export const GAME_H = 854;
export const MAX_GAME_W = 1520;
/** minimum window width (CSS px) and aspect for the wide desktop layout */
export const WIDE_MIN_PX = 900;
export const WIDE_MIN_ASPECT = 1.05;

function computeGameW(): number {
  if (typeof window === "undefined") return DESIGN_W;
  try {
    const q = new URLSearchParams(window.location.search).get("layout");
    const w = window.innerWidth || DESIGN_W;
    const h = window.innerHeight || GAME_H;
    const wantWide = q === "wide" ? true : q === "portrait" ? false : w >= WIDE_MIN_PX && w / h >= WIDE_MIN_ASPECT;
    if (!wantWide) return DESIGN_W;
    const raw = Math.round((GAME_H * Math.max(w / h, WIDE_MIN_ASPECT)) / 2) * 2;
    return Math.min(MAX_GAME_W, Math.max(DESIGN_W, raw));
  } catch {
    return DESIGN_W;
  }
}

export const GAME_W = computeGameW();
/** true when the wide (desktop full-screen) playfield is active */
export const WIDE = GAME_W > DESIGN_W;
/** factor to map DESIGN_W-space x coordinates to the live playfield */
export const X_SCALE = GAME_W / DESIGN_W;

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

/**
 * Aircraft skins (paint schemes). Sprite key: `player_<aircraft>_<skin>` (+ `_dmg`), same size/frames as
 * `player_<aircraft>`. Skin "standard" = the plain `player_<aircraft>` sprite. Renderer falls back to standard.
 */
export const SKIN_IDS = ["standard", "arctic", "desert", "nightfall", "crimson", "tiger", "gold"] as const;
export type SkinId = (typeof SKIN_IDS)[number];

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
