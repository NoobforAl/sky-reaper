/**
 * Enemy contracts. OWNER: Orchestrator. Defs authored by the Enemy agent in src/enemies.
 */
import type { Layer, PatternDef, Vulnerability } from "./combat";
import type { PickupKind } from "./consts";

export type MovementKind =
  | "straight" // vx/vy constant (default: downward at `speed`)
  | "sine" // downward + lateral sine
  | "diagonal" // fixed diagonal, bounces off side walls optionally
  | "circular" // orbits a moving center that descends
  | "follow" // steers toward the player with limited turn rate
  | "formation" // follows leader offset (see EnemySpawnOpts.formation)
  | "strafe" // enters, then sweeps horizontally firing, then leaves
  | "stationary" // holds screen position (air) or is glued to the ground (ground)
  | "dive" // slow approach then fast dive at player (kamikaze)
  | "hover" // enters to a hover point then drifts
  | "scripted"; // custom fn in EnemySystem (used by bosses)

export interface MovementDef {
  kind: MovementKind;
  /** base speed units/s (air: relative to screen; ground: relative to world, added to scroll) */
  speed: number;
  amp?: number; // sine amplitude
  freq?: number; // sine frequency (Hz)
  angle?: number; // diagonal heading (deg)
  radius?: number; // circular radius
  turnRate?: number; // follow/dive deg/s
  /** strafe/hover: y (screen) the enemy stops at */
  holdY?: number;
  /** seconds spent holding before leaving (strafe/hover) */
  holdTime?: number;
}

export interface AttackDef {
  pattern: PatternDef | string; // inline def or id from PATTERNS
  /** seconds between starts of this attack */
  interval: number;
  /** seconds after spawn (or after entering the screen) before first use */
  delay?: number;
  /** only fire while on screen between these y bounds (default 0..GAME_H) */
  minY?: number;
  maxY?: number;
  /** only fire if the player is within this distance */
  range?: number;
}

export interface DropDef {
  kind: PickupKind;
  /** probability 0..1 */
  chance: number;
  min?: number;
  max?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  layer: Layer;
  /** which player weapon classes can hurt it (ground units usually "ground" or "both"). */
  vulnerableTo: Vulnerability;
  hp: number;
  /** contact damage to the player */
  contactDamage: number;
  /** score on kill */
  score: number;
  /** native sprite size in px (draw at PIXEL_SCALE). Hitbox derived from `hitbox` or size*PIXEL_SCALE*0.8 */
  size: [number, number];
  /** override hitbox size in game units */
  hitbox?: [number, number];
  /** sprite key (default: "enemy_" + id) */
  sprite?: string;
  /** fallback color if sprite missing */
  color: [number, number, number];
  movement: MovementDef;
  attacks: AttackDef[];
  drops: DropDef[];
  /** destruction effect: size of explosion + sfx */
  explosion: "s" | "m" | "l";
  /** armor: flat damage reduction per hit (min 1 damage always applies) */
  armor?: number;
  /** flash white when hit (default true) */
  /** can this enemy be shot down by the player? false => invulnerable scenery (rare) */
  destructible?: boolean;
  /** ground only: mounts on the scrolling world; set false for naval units that drift */
  anchored?: boolean;
  /** ground turret: rotates its barrel to the player (visual only) */
  rotatesToPlayer?: boolean;
  /** extra tags for objectives, e.g. "radar", "aa", "naval", "vehicle", "structure" */
  tags?: string[];
}

export interface EnemySpawnOpts {
  /** override hp multiplier (difficulty scaling) */
  hpScale?: number;
  /** for "formation": leader entity id and local offset */
  formation?: { leaderId: number; dx: number; dy: number };
  /** movement overrides (e.g. mirrored sine) */
  phase?: number;
  dir?: 1 | -1;
  /** drop override */
  drops?: boolean;
  /** attach to boss as a part */
  bossId?: string;
  /** free-form data for scripted behaviours */
  data?: Record<string, unknown>;
}

/** Runtime enemy entity. The Engine owns the pool and mutates core fields; behaviours mutate x/y/vx/vy/data. */
export interface Enemy {
  id: number;
  def: EnemyDef;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  /** seconds since spawn */
  t: number;
  /** seconds since first on-screen */
  tOn: number;
  onScreen: boolean;
  /** facing degrees for sprite rotation / pattern aim (90 = down) */
  facing: number;
  /** hit-flash timer (s) */
  flash: number;
  /** current sprite frame (animation) */
  frame: number;
  /** boss part linkage */
  bossId?: string;
  /** invulnerable until time (boss shields) */
  invuln: boolean;
  /** spawn opts that matter at runtime */
  opts: EnemySpawnOpts;
  /** behaviour-private state (movement phases, attack timers, running PatternInstances) */
  data: Record<string, unknown>;
}

/**
 * Implemented by src/enemies/index.ts (Enemy agent). Engine calls these.
 * Movement for ground units is added to world scroll automatically by the Engine when `def.anchored !== false`
 * (i.e. the behaviour only needs to apply the unit's OWN motion; the Engine applies scrollSpeed).
 *
 * Position ownership: `update()` integrates the unit's own motion directly into e.x/e.y and writes e.vx/e.vy as
 * informational velocity. The Engine must NOT integrate vx/vy for enemies; it only adds scrollSpeed*dt for anchored ground units.
 * Hit order: `onHit` is called AFTER hp has been reduced, and only while the enemy is still alive.
 * Death: `onDeath` is also called for enemies culled off-screen (hp > 0) — check `e.hp <= 0` for real kills.
 * Boss parts: set `e.data.part = "<partName>"` on spawn; the Engine passes it to BossController.onPartDestroyed.
 * Missiles: the Engine's spawnBullet emits `missileLaunched` for every isMissile bullet; pattern code must not emit it again.
 */
export interface EnemySystem {
  readonly defs: Record<string, EnemyDef>;
  onSpawn(e: Enemy, world: import("./world").WorldAPI): void;
  update(e: Enemy, dt: number, world: import("./world").WorldAPI): void;
  onHit?(e: Enemy, damage: number, world: import("./world").WorldAPI): void;
  onDeath(e: Enemy, world: import("./world").WorldAPI): void;
}
