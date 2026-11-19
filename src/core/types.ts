/** Internal entity shapes used by the engine (pooled plain objects). */
import type { BulletMotion, BulletVisual, DamageClass, Enemy, FxKind, PickupKind } from "../contracts";
import type { EnemyKeys } from "./spritekeys";

export interface Bullet {
  id: number;
  /** true = player projectile */
  player: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** heading, degrees (0 right, 90 down) */
  angle: number;
  speed: number;
  maxSpeed: number;
  accel: number;
  dmgClass: DamageClass;
  damage: number;
  motion: BulletMotion;
  life: number;
  age: number;
  visual: BulletVisual;
  radius: number;
  turnRate: number;
  armDelay: number;
  decoyable: boolean;
  isMissile: boolean;
  blastRadius: number;
  blastDelay: number;
  blastHitsAir: boolean;
  hp: number;
  hitsAir: boolean;
  hitsGround: boolean;
  pierce: number;
  ownerId: number;
  kind: string;
  // sine
  sineAmp: number;
  sineFreq: number;
  bx: number;
  by: number;
  nx: number;
  ny: number;
  // lobbed
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  lobT: number;
  // homing
  targetId: number;
  retargetT: number;
  /** >0: following a flare decoy for this many more seconds */
  divert: number;
  locked: boolean;
  trailT: number;
  /** pierce bookkeeping: ids of enemies already damaged by this bullet */
  hitIds: number[];
  hitN: number;
  /** render rotation (deg) for spinning visuals */
  rot: number;
  /**
   * enemy bullets only: removal was requested while a pass was iterating `eBullets` by index
   * (World.clearEnemyBullets during a bullet loop). Skipped by every pass and swept at the end of the loop.
   */
  dead: boolean;
}

export interface EnemyRT extends Enemy {
  /** half hitbox (game units) */
  hw: number;
  hh: number;
  immuneCd: number;
  smokeT: number;
  /** killed / removed, waiting for cleanup */
  removed: boolean;
  /** graveyard timer before the object may be recycled */
  graveT: number;
  /** counts toward killRate */
  counted: boolean;
  /** animation clock (s, scaled by movement for tracked ground units) + per-enemy phase offset (frames) */
  animT: number;
  animPhase: number;
  /** last sim-step position (ground-relative motion / banking) */
  lastX: number;
  lastY: number;
  /** smoothed bank -1..1 from lateral motion (selects `_bankl` / `_bankr` art when present) */
  bank: number;
  /** cached sprite keys for `def` (set at spawn; see spritekeys.ts) */
  keys: EnemyKeys;
}

export type FxInternalKind = FxKind | "ping" | "wreck";

export interface Fx {
  kind: FxInternalKind;
  sprite: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  t: number;
  life: number;
  delay: number;
  scale: number;
  rot: number;
  vrot: number;
  /** attached to scrolling ground */
  scroll: boolean;
  r: number;
  g: number;
  b: number;
  /** wreck: frame etc. */
  frame: number;
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  /** collected flying toward the player */
  magnetized: boolean;
}

export interface Hazard {
  x: number;
  y: number;
  radius: number;
  telegraph: number;
  t: number;
  damage: number;
  /** "enemy" hurts the player; "air"/"ground" are player-made blasts */
  cls: DamageClass;
  anchored: boolean;
  blastFx: string;
  r: number;
  g: number;
  b: number;
  /** 0 telegraphing, 1 exploded (fading) */
  state: 0 | 1;
  blastT: number;
  hitsAir: boolean;
  hitsGround: boolean;
}

export interface FlareDecoy {
  active: boolean;
  x: number;
  y: number;
  t: number;
  radius: number;
}
