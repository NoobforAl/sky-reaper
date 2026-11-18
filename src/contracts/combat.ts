/**
 * Combat contracts: bullets, patterns, hazards, damage classes. OWNER: Orchestrator.
 */
import type { AirWeaponId, GroundWeaponId } from "./consts";

/** Which layer an entity lives on. Air units fly; ground units are glued to the scrolling world. */
export type Layer = "air" | "ground";

/**
 * Damage class of a projectile/blast.
 *  - "air"    : air-to-air weapons (vulcan, spread, homing, laser). Hit air units; hit ground units ONLY if
 *               the ground unit's `vulnerableTo` includes "air".
 *  - "ground" : air-to-ground ordnance (bomb, rocket, pmissile, heavy). Hit ground units; hit air units only
 *               if explicitly flagged `hitsAir` (rockets/heavy blast can).
 *  - "enemy"  : hurts the player.
 */
export type DamageClass = "air" | "ground" | "enemy";

/** Which weapon classes can hurt an enemy. */
export type Vulnerability = "air" | "ground" | "both";

export type BulletMotion =
  | "linear" // vx, vy fixed
  | "homing" // steers toward target, limited by turnRate
  | "accel" // speeds up over time (accel units/s^2 along heading)
  | "sine" // linear + lateral sine wobble
  | "lobbed" // ground ordnance: travels to (tx,ty) then detonates
  | "orbit"; // reserved

export interface BulletVisual {
  /** sprite key (see assets.ts) e.g. "ebullet_orb" */
  sprite: string;
  /** fallback color when the sprite is missing or for glow rings [r,g,b] */
  color: [number, number, number];
  /** hitbox radius in game units (also used for fallback draw) */
  radius: number;
  /** optional trail sprite key (e.g. "fx_trail") spawned every ~trailEveryMs */
  trail?: string;
  trailEveryMs?: number;
  /** rotate sprite to heading (default true for non-round bullets) */
  rotate?: boolean;
  /** scale multiplier on top of PIXEL_SCALE */
  scale?: number;
}

/** Everything the engine needs to spawn and simulate one bullet. */
export interface BulletSpec {
  damageClass: DamageClass;
  damage: number;
  /** speed in units/s (initial) */
  speed: number;
  /** heading in DEGREES. 0 = right, 90 = DOWN (screen), -90 = up. */
  angle: number;
  motion?: BulletMotion;
  /** lifetime seconds (default 8) */
  life?: number;
  visual: BulletVisual;

  // ---- homing / missiles ----
  /** turn rate deg/s (homing). Keep low (<= 120) so missiles are evadable. */
  turnRate?: number;
  /** for homing: seconds before it starts steering (launch phase) */
  armDelay?: number;
  /** can be diverted/destroyed by flares and shield burst */
  decoyable?: boolean;
  /** show a launch warning HUD arrow + lock-on indicator (enemy missiles) */
  isMissile?: boolean;
  /** missile explodes in this radius on hit/expiry (0 = none) */
  blastRadius?: number;
  /** can this bullet be shot down by the player (flak, missiles)? hp > 0 => yes */
  hp?: number;

  // ---- misc ----
  accel?: number;
  sineAmp?: number;
  sineFreq?: number;
  /** lobbed: target point; detonates on arrival */
  tx?: number;
  ty?: number;
  /** ground/air hit flags for player ordnance */
  hitsAir?: boolean;
  hitsGround?: boolean;
  /** pierce count: how many enemies it passes through (laser) */
  pierce?: number;
  /** for explosions that should show warning ring first */
  spawnFx?: string;
}

export interface BulletSpawn extends BulletSpec {
  x: number;
  y: number;
  /** id of owner entity (enemy id) for kill attribution; 0 for player */
  ownerId?: number;
}

/**
 * Delayed area attacks (carpet bomb markers, artillery, boss slams).
 * Engine draws a warning ring for `telegraphMs`, then deals damage once in `radius`.
 */
export interface HazardSpawn {
  x: number;
  y: number;
  radius: number;
  telegraphMs: number;
  damage: number;
  /** damage class; "enemy" hurts the player. "ground"/"air" are for player-created blasts. */
  damageClass: DamageClass;
  /** hazard moves with scrolling world (ground-anchored)? */
  anchored?: boolean;
  /** fx key played on blast (default fx_explosion_m) */
  blastFx?: string;
  color?: [number, number, number];
}

// =====================================================================================
// PATTERN FRAMEWORK  (data-driven; implemented in src/patterns by the Enemy agent)
// =====================================================================================

export type PatternKind =
  | "straight" // `count` bullets in a column/line, same angle
  | "aimed" // at the player (aim:"player") - count bullets, optional spread
  | "spread" // fan of `count` bullets across `spreadDeg`
  | "circular" // full ring of `count` bullets
  | "spiral" // repeated rings rotating by `rotationDeg` each shot, `shots` times
  | "burst" // `shots` rapid volleys of a sub-pattern, `gapMs` apart
  | "multi" // several emitters at fixed angle offsets (e.g. 4-way cross)
  | "homing" // missile launch(es): warning first
  | "delayedBlast" // spawns Hazards at/near the target after telegraph
  | "areaStrike" // series of hazards walking toward the player (carpet bombing)
  | "sweep"; // aimed volleys sweeping from -spreadDeg/2 to +spreadDeg/2 over `shots`

export type AimMode = "none" | "player" | "lead";

export interface PatternDef {
  id: string;
  kind: PatternKind;
  bullet: BulletSpec; // `angle` is the base angle; overridden/added by pattern logic (relative to aim/owner facing)
  /** bullets per volley (ring size, fan size, ...) */
  count?: number;
  spreadDeg?: number;
  aim?: AimMode;
  /** angle offset added to base/aim angle (deg) */
  angleOffset?: number;
  /** for spiral/sweep/burst: number of volleys */
  shots?: number;
  /** ms between volleys for burst/spiral/sweep */
  gapMs?: number;
  /** degrees added per volley (spiral) */
  rotationDeg?: number;
  /** speed multiplier per bullet index (for "fan with varied speeds") */
  speedStep?: number;
  /** multi: list of angle offsets (deg) for each emitter */
  offsets?: number[];
  /** warning time BEFORE the first bullet (ms). Required (> 0) for strong attacks. */
  telegraphMs?: number;
  /** muzzle offsets relative to the owner's center in game units (default [0,0]); one volley per entry */
  muzzles?: Array<[number, number]>;
  /** delayedBlast / areaStrike parameters */
  hazard?: Omit<HazardSpawn, "x" | "y">;
  /** areaStrike: number of blasts and spacing units */
  blasts?: number;
  blastSpacing?: number;
  /** fire sfx id (see SfxId) */
  sfx?: string;
}

/** A running (possibly multi-volley) pattern. Owned by whoever started it. */
export interface PatternInstance {
  readonly done: boolean;
  /** advance by dt seconds, spawn bullets through the world */
  update(dt: number): void;
  cancel(): void;
}

export interface PatternOwner {
  /** current world position & facing; patterns read these each volley */
  x: number;
  y: number;
  /** facing in degrees (90 = down). Defaults to 90 */
  facing?: number;
  id: number;
  layer: Layer;
}

/** Implemented by src/patterns/index.ts */
export interface PatternRunner {
  start(pattern: PatternDef, owner: PatternOwner, world: import("./world").WorldAPI): PatternInstance;
}

// Player weapon descriptors (data-driven too; implemented in src/weapons by the Engine agent)

export interface PlayerWeaponDef {
  id: AirWeaponId | GroundWeaponId;
  kind: "air" | "ground";
  name: string;
  /** one-line description for the shop */
  desc: string;
  /** shots per second at level 1 / base upgrade */
  fireRate: number;
  /** damage per bullet at level 1 */
  damage: number;
  /** price to unlock in the shop (0 = owned from the start) */
  unlockCost: number;
  /** ordnance cost (ground weapons consume bombs; air weapons 0) */
  ammoCost?: number;
}
