/**
 * World contracts: the API gameplay modules use to affect the simulation, plus the event bus.
 * OWNER: Orchestrator. Implemented by the Engine agent (src/core).
 */
import type { BulletSpawn, HazardSpawn } from "./combat";
import type { Enemy, EnemySpawnOpts } from "./enemies";
import type { AircraftId, AirWeaponId, GroundWeaponId, PickupKind, SkinId } from "./consts";
import type { AudioService, SfxId } from "./assets";

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  /** ordnance stock for ground weapons */
  bombs: number;
  maxBombs: number;
  /** weapon level 1..5 for the air weapon */
  power: number;
  airWeapon: AirWeaponId;
  groundWeapon: GroundWeaponId;
  aircraft: AircraftId;
  /** paint scheme; sprite key `player_<aircraft>_<skin>` unless "standard" */
  skin: SkinId;
  /** i-frames remaining (s) */
  invuln: number;
  /** flare/countermeasure cooldown remaining (s) */
  flareCd: number;
  /** temporary power-up timers (s) */
  rapid: number;
  overdrive: number;
  magnet: number;
  alive: boolean;
  lives: number;
  /** player hit radius (game units; tiny, bullet-hell style) */
  hitRadius: number;
  /** bank angle -1..1 for sprite frames */
  bank: number;
}

/** Cumulative stats for the current run; drive results + objectives. */
export interface RunStats {
  score: number;
  kills: number;
  airKills: number;
  groundKills: number;
  tagKills: Record<string, number>;
  damageTaken: number;
  deaths: number;
  coins: number;
  bombsUsed: number;
  flaresUsed: number;
  timeSec: number;
  bossDefeated: boolean;
  /** 0..1 fraction of spawned destructible enemies killed */
  killRate: number;
  spawned: number;
  /** current combo multiplier (1..2) and seconds left in the chain; optional (engine fills them at runtime) */
  combo?: number;
  comboTimer?: number;
  /** round 5: highest THREAT rank reached this run (results screen) */
  threatMax?: number;
}

export type FxKind =
  | "explosion_s"
  | "explosion_m"
  | "explosion_l"
  | "smoke"
  | "fire"
  | "spark"
  | "ring"
  | "flare"
  | "muzzle"
  | "hit"
  | "blast_ground"
  | "debris";

// ------------------------- event bus -------------------------

export interface GameEvents {
  enemySpawned: { enemy: Enemy };
  enemyHit: { enemy: Enemy; damage: number; byClass: "air" | "ground" };
  enemyKilled: { enemy: Enemy; score: number; byPlayer: boolean };
  /** a weapon class could not damage this target (show "immune" feedback) */
  enemyImmune: { enemy: Enemy; byClass: "air" | "ground"; x: number; y: number };
  playerHit: { damage: number; source: string };
  playerDied: { lives: number };
  playerRespawned: {};
  pickup: { kind: PickupKind };
  /** an enemy missile has been launched at the player; HUD shows the warning arrow */
  missileLaunched: { x: number; y: number; id: number };
  missileLock: { id: number; active: boolean };
  flareUsed: {};
  bombUsed: {};
  weaponChanged: { air: AirWeaponId; ground: GroundWeaponId };
  bossSpawned: { bossId: string };
  bossPhase: { bossId: string; phase: number };
  bossDefeated: { bossId: string };
  waveStarted: { label: string };
  chapterComplete: { chapterId: string };
  chapterFailed: { chapterId: string };
  banner: { text: string; subtext?: string; ms: number };
}
export type GameEventName = keyof GameEvents;

export interface EventBus {
  on<K extends GameEventName>(name: K, fn: (payload: GameEvents[K]) => void): () => void;
  emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void;
}

// ------------------------- world API -------------------------

export interface WorldAPI {
  /** simulation time since the chapter started (s) */
  readonly time: number;
  /** total distance scrolled (game units) */
  readonly scrollY: number;
  /** current scroll speed (units/s); Level agent may change via setScrollSpeed */
  readonly scrollSpeed: number;
  setScrollSpeed(v: number): void;
  /** wind pushes the player horizontally (desert/arctic); units/s^2, default 0 */
  setWind(ax: number): void;
  readonly player: Readonly<PlayerState>;
  readonly stats: Readonly<RunStats>;
  readonly enemies: ReadonlyArray<Enemy>;
  readonly events: EventBus;
  readonly audio: AudioService;
  /** deterministic RNG (0..1). Use this, never Math.random(), in gameplay code. */
  rng(): number;
  rngRange(min: number, max: number): number;

  spawnEnemy(defId: string, x: number, y: number, opts?: EnemySpawnOpts): Enemy | null;
  spawnBullet(spec: BulletSpawn): void;
  spawnHazard(spec: HazardSpawn): void;
  spawnPickup(kind: PickupKind, x: number, y: number): void;
  /** `delay` is in SECONDS (values > 10 are treated as ms for safety). */
  spawnFx(kind: FxKind, x: number, y: number, opts?: { scale?: number; delay?: number; vx?: number; vy?: number }): void;
  /** damage an enemy directly (boss scripts, chain explosions). byPlayer false => no score */
  damageEnemy(e: Enemy, amount: number, byPlayer?: boolean): void;
  killEnemy(e: Enemy, byPlayer?: boolean): void;
  /** hurt the player (contact, lasers). Respects shield/i-frames. */
  damagePlayer(amount: number, source: string): void;
  /** remove all enemy bullets in radius (flare, boss phase change). -1 = whole screen */
  clearEnemyBullets(x?: number, y?: number, radius?: number): void;
  shake(power: number, ms: number): void;
  flash(color: [number, number, number], ms: number): void;
  playSfx(id: SfxId, opts?: { volume?: number; pitch?: number }): void;
  /** Level agent hands control to a boss. Engine calls createBoss(). */
  startBoss(bossId: string): void;
  /** called by LevelRunner/Boss when the chapter is won */
  completeChapter(): void;
  /** current difficulty multiplier (from settings; 1 = normal) */
  readonly difficulty: number;
  /** round 5: ChapterDef.index (0-based) */
  readonly chapterIndex?: number;
  /** round 5: THREAT rank 0..3 (BALANCE_SPEC §7); enemies/bosses read it to scale fire rate / bullet speed */
  readonly threat?: number;
}
