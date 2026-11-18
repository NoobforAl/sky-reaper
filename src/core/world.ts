/**
 * World: the simulation. Implements WorldAPI + EventBus + the weapon/player host interfaces.
 * Fixed step (SIM_DT). All entity storage is pooled; per-step code allocates nothing.
 * See docs/ENGINE_NOTES.md for the per-step order and hot-path rules.
 */
import {
  GAME_H,
  GAME_W,
  PIXEL_SCALE,
  SCENES,
  type AudioService,
  type BossController,
  type BossFactory,
  type BulletSpawn,
  type ChapterDef,
  type DamageClass,
  type Enemy,
  type EnemyDef,
  type EnemySpawnOpts,
  type EnemySystem,
  type EventBus,
  type FxKind,
  type GameEventName,
  type GameEvents,
  type GameSceneParams,
  type HazardSpawn,
  type HudData,
  type InputState,
  type LevelRunner,
  type PickupKind,
  type RunStats,
  type Services,
  type SfxId,
  type WorldAPI,
} from "../contracts";
import { PlayerController, type PlayerHost } from "../player";
import { computeLoadout, type FireContext, type PlayerBulletSpawn } from "../weapons";
import { FXDEF } from "./fxdefs";
import { Pool, makeRng } from "./pool";
import type { Bullet, EnemyRT, FlareDecoy, Fx, FxInternalKind, Hazard, Pickup } from "./types";
import { collideAll, updateBullets } from "./bullets";

export const WORLD_TUNING = {
  pools: { playerBullets: 320, enemyBullets: 1400, enemies: 160, fx: 700, pickups: 96, hazards: 96 },
  /** difficulty: enemy bullet damage = base * (dmgBase + dmgSlope*difficulty); speed likewise */
  dmgBase: 0.5,
  dmgSlope: 0.5,
  spdBase: 0.92,
  spdSlope: 0.08,
  scrollEase: 220,
  comboWindow: 2,
  comboStep: 0.1,
  comboMax: 2,
  flashEnemy: 0.06,
  bossDefeatBonus: 2000,
  completeDelay: 3.2,
  failDelay: 2.4,
  flareDivertSec: 2.6,
  graveSec: 2.5,
  pickupCollect: 24,
  pickupAttract: 54,
  magnetRadius: 160,
  magnetSpeed: 460,
  pickupFall: 62,
  enemyCullBottom: 170,
  enemyCullSide: 220,
  enemyCullTop: 700,
} as const;

const EMPTY_OPTS: EnemySpawnOpts = {};
const NULL_DEF: EnemyDef = {
  id: "_null",
  name: "",
  layer: "air",
  vulnerableTo: "air",
  hp: 1,
  contactDamage: 0,
  score: 0,
  size: [8, 8],
  color: [255, 0, 255],
  movement: { kind: "straight", speed: 0 },
  attacks: [],
  drops: [],
  explosion: "s",
};

export interface RunStatsRT extends RunStats {
  /** score multiplier 1..2 (not part of the contract; HUD may read it) */
  combo: number;
  comboTimer: number;
}

type Listener = (p: never) => void;

class Bus implements EventBus {
  private map = new Map<string, Listener[]>();
  on<K extends GameEventName>(name: K, fn: (payload: GameEvents[K]) => void): () => void {
    let a = this.map.get(name);
    if (!a) this.map.set(name, (a = []));
    a.push(fn as Listener);
    return () => {
      const arr = this.map.get(name);
      if (!arr) return;
      const i = arr.indexOf(fn as Listener);
      if (i >= 0) arr.splice(i, 1);
    };
  }
  emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    const a = this.map.get(name);
    if (!a) return;
    for (let i = 0; i < a.length; i++) {
      try {
        (a[i] as (p: GameEvents[K]) => void)(payload);
      } catch (err) {
        console.error("[bus]", name, err);
      }
    }
  }
  has(name: GameEventName): boolean {
    const a = this.map.get(name);
    return !!a && a.length > 0;
  }
}

export interface WorldInit {
  svc: Services;
  chapter: ChapterDef;
  runner: LevelRunner;
  enemySys: EnemySystem;
  bosses: BossFactory;
  /** fallback boss factory when the real one fails */
  fallbackBosses?: BossFactory;
  params: GameSceneParams;
  /** true when running on built-in DEV demo content */
  demo: boolean;
  onFinish: (victory: boolean) => void;
}

export type RunState = "playing" | "complete" | "failed" | "done";

const SFX_MIN_GAP: Partial<Record<SfxId, number>> = {
  hit: 0.045,
  hit_metal: 0.07,
  explode_s: 0.05,
  explode_m: 0.07,
  explode_l: 0.12,
  shot_vulcan: 0.04,
  shot_spread: 0.05,
  pickup_coin: 0.03,
  warning: 0.8,
  lock_on: 0.4,
  missile_launch: 0.15,
};

export class World implements WorldAPI, FireContext, PlayerHost {
  // ------------------------------------------------------------ services
  readonly svc: Services;
  readonly audio: AudioService;
  readonly chapter: ChapterDef;
  readonly runner: LevelRunner;
  readonly enemySys: EnemySystem;
  readonly bossFactory: BossFactory;
  readonly fallbackBosses?: BossFactory;
  readonly params: GameSceneParams;
  readonly demo: boolean;
  readonly bus = new Bus();
  readonly events: EventBus = this.bus;
  private onFinish: (victory: boolean) => void;

  // ------------------------------------------------------------ clocks / scroll
  time = 0;
  scrollY = 0;
  scrollSpeed: number;
  private scrollTarget: number;
  wind = 0;
  readonly difficulty: number;
  readonly dmgScale: number;
  readonly spdScale: number;
  god = false;
  state: RunState = "playing";
  stateT = 0;
  private sfxClock = 0;
  private sfxLast: Partial<Record<SfxId, number>> = {};

  // ------------------------------------------------------------ rng
  private rngFn: () => number;
  /** cosmetic rng (fx jitter) so visuals never desync gameplay determinism */
  readonly frng: () => number;
  readonly seed: number;

  // ------------------------------------------------------------ entities
  readonly pc: PlayerController;
  readonly stats: RunStatsRT;
  readonly pBullets: Pool<Bullet>;
  readonly eBullets: Pool<Bullet>;
  readonly enemyPool: Pool<EnemyRT>;
  readonly fxPool: Pool<Fx>;
  readonly pickups: Pool<Pickup>;
  readonly hazards: Pool<Hazard>;
  private graveyard: EnemyRT[] = [];
  boss: BossController | null = null;
  bossId: string | null = null;
  private bossDefeatedEmitted = false;
  private bossDeadX = GAME_W / 2;
  private bossDeadY = 200;
  readonly flare: FlareDecoy = { active: false, x: 0, y: 0, t: 0, radius: 0 };
  /** number of enemy bullets with hp > 0 (shoot-down-able) */
  shootables = 0;
  private nextId = 1;
  private killedCounted = 0;
  private warned = new Set<string>();
  private errCount: Record<string, number> = {};
  /** gameplay pause of fx timers (hitstop) */
  hitstop = 0;

  // ------------------------------------------------------------ presentation state
  shakePow = 0;
  shakeT = 0;
  shakeTotal = 0.001;
  flashColor: [number, number, number] = [255, 255, 255];
  flashT = 0;
  flashTotal = 0.001;
  banner: { text: string; subtext?: string; t: number; ms: number } | null = null;
  lockSoundCd = 0;
  /** true while at least one missile is locked on the player */
  anyLock = false;
  private missileList: Array<{ id: number; x: number; y: number; locked: boolean }> = [];
  private missilePool: Array<{ id: number; x: number; y: number; locked: boolean }> = [];
  private hud: HudData;
  fps = 60;
  private bossRoarT = 0;
  private chainT = 0;

  constructor(init: WorldInit) {
    const T = WORLD_TUNING;
    this.svc = init.svc;
    this.audio = init.svc.audio;
    this.chapter = init.chapter;
    this.runner = init.runner;
    this.enemySys = init.enemySys;
    this.bossFactory = init.bosses;
    this.fallbackBosses = init.fallbackBosses;
    this.params = init.params;
    this.demo = init.demo;
    this.onFinish = init.onFinish;
    this.seed = init.params.seed ?? (Math.random() * 0x7fffffff) | 0;
    this.rngFn = makeRng(this.seed);
    this.frng = makeRng(this.seed ^ 0x5bd1e995);
    const settings = init.svc.save.data.settings;
    this.difficulty = settings.difficulty ?? 1;
    this.dmgScale = T.dmgBase + T.dmgSlope * this.difficulty;
    this.spdScale = T.spdBase + T.spdSlope * this.difficulty;
    this.god = !!init.params.godMode;
    this.scrollSpeed = this.scrollTarget = init.chapter.scrollSpeed;

    const loadout = computeLoadout(init.svc.save.data);
    this.pc = new PlayerController(loadout, 3);
    this.stats = {
      score: 0,
      kills: 0,
      airKills: 0,
      groundKills: 0,
      tagKills: {},
      damageTaken: 0,
      deaths: 0,
      coins: 0,
      bombsUsed: 0,
      flaresUsed: 0,
      timeSec: 0,
      bossDefeated: false,
      killRate: 1,
      spawned: 0,
      combo: 1,
      comboTimer: 0,
    };

    this.pBullets = new Pool(T.pools.playerBullets, makeBullet);
    this.eBullets = new Pool(T.pools.enemyBullets, makeBullet);
    this.enemyPool = new Pool(T.pools.enemies, makeEnemy);
    this.fxPool = new Pool(T.pools.fx, makeFx);
    this.pickups = new Pool(T.pools.pickups, () => ({ id: 0, kind: "coin", x: 0, y: 0, vx: 0, vy: 0, t: 0, magnetized: false }));
    this.hazards = new Pool(T.pools.hazards, makeHazard);
    for (let i = 0; i < 24; i++) this.missilePool.push({ id: 0, x: 0, y: 0, locked: false });

    this.hud = {
      player: this.pc.state,
      stats: this.stats,
      boss: null,
      progress: 0,
      chapterName: init.chapter.name,
      hint: null,
      incomingMissiles: this.missileList,
      banner: null,
      fps: 60,
    };

    // internal event hooks
    this.bus.on("banner", (b) => {
      this.banner = { text: b.text, subtext: b.subtext, t: 0, ms: b.ms };
    });
    this.bus.on("bossPhase", () => {
      this.clearEnemyBullets(-1);
      this.flash([255, 255, 255], 260);
      this.shake(8, 400);
      this.playSfx("boss_phase");
    });
    this.bus.on("bossDefeated", () => {
      this.bossDefeatedEmitted = true;
      this.stats.bossDefeated = true;
    });
  }

  // ================================================================== WorldAPI getters
  get player() {
    return this.pc.state;
  }
  get enemies(): ReadonlyArray<Enemy> {
    return this.enemyPool.items;
  }
  get autoFire(): boolean {
    return !!this.svc.save.data.settings.autoFire;
  }
  get mutStats(): RunStats {
    return this.stats;
  }
  get settings() {
    return this.svc.save.data.settings;
  }

  rng(): number {
    return this.rngFn();
  }
  rngRange(min: number, max: number): number {
    return min + (max - min) * this.rngFn();
  }
  setScrollSpeed(v: number): void {
    this.scrollTarget = v;
  }
  setWind(ax: number): void {
    this.wind = ax;
  }
  shake(power: number, ms: number): void {
    if (!this.settings.screenShake) return;
    const t = ms / 1000;
    if (power >= this.shakePow * (this.shakeT / this.shakeTotal)) {
      this.shakePow = power;
      this.shakeT = t;
      this.shakeTotal = Math.max(0.001, t);
    }
  }
  flash(color: [number, number, number], ms: number): void {
    this.flashColor = color;
    this.flashT = ms / 1000;
    this.flashTotal = Math.max(0.001, ms / 1000);
  }
  playSfx(id: SfxId, opts?: { volume?: number; pitch?: number }): void {
    const gap = SFX_MIN_GAP[id] ?? 0.02;
    const last = this.sfxLast[id] ?? -9;
    if (this.sfxClock - last < gap) return;
    this.sfxLast[id] = this.sfxClock;
    this.audio.playSfx(id, opts);
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn("[core] " + msg);
  }
  private logErr(label: string, err: unknown): void {
    const n = (this.errCount[label] = (this.errCount[label] ?? 0) + 1);
    if (n <= 3) console.error(`[core] error in ${label}`, err);
  }

  // ================================================================== fixed step
  step(dt: number, input: InputState): void {
    const T = WORLD_TUNING;
    this.time += dt;
    this.sfxClock += dt;
    this.stateT += dt;
    this.stats.timeSec = this.time;

    // scroll easing
    if (this.scrollSpeed !== this.scrollTarget) {
      const d = this.scrollTarget - this.scrollSpeed;
      const s = T.scrollEase * dt;
      this.scrollSpeed = Math.abs(d) <= s ? this.scrollTarget : this.scrollSpeed + Math.sign(d) * s;
    }
    this.scrollY += this.scrollSpeed * dt;

    // combo window
    if (this.stats.comboTimer > 0) {
      this.stats.comboTimer -= dt;
      if (this.stats.comboTimer <= 0) this.stats.combo = 1;
    }

    // presentation timers
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t * 1000 >= this.banner.ms) this.banner = null;
    }
    if (this.lockSoundCd > 0) this.lockSoundCd -= dt;

    // 1. player
    if (this.state === "complete") this.pc.state.invuln = Math.max(this.pc.state.invuln, 0.5);
    this.pc.update(dt, this.state === "failed" ? NEUTRAL_INPUT : input, this);

    // 2. level + boss
    if (this.state === "playing") {
      try {
        this.runner.update(dt, this);
      } catch (err) {
        this.logErr("levelRunner.update", err);
      }
      if (this.boss) {
        try {
          this.boss.update(dt, this);
          if (this.boss.done && this.state === "playing") this.onBossDone();
        } catch (err) {
          this.logErr("boss.update", err);
        }
      }
    }

    // 3. enemies
    this.updateEnemies(dt);

    // 4/5. bullets + collisions
    updateBullets(this, dt);
    collideAll(this, dt);

    // 6. hazards, 7. pickups, 8. fx
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.updateFx(dt);

    // 9. cleanup
    this.cleanupEnemies(dt);

    // flow
    this.updateFlow(dt);
  }

  private updateFlow(dt: number): void {
    const T = WORLD_TUNING;
    if (this.state === "playing") {
      if (this.pc.defeated) {
        this.state = "failed";
        this.stateT = 0;
        this.events.emit("chapterFailed", { chapterId: this.chapter.id });
        this.events.emit("banner", { text: "MISSION FAILED", ms: 2400 });
      }
    } else if (this.state === "complete") {
      // chain explosions over the wreck
      if (this.stats.bossDefeated && this.stateT < 2.4) {
        this.chainT -= dt;
        if (this.chainT <= 0) {
          this.chainT = 0.09;
          const x = this.bossDeadX + (this.frng() - 0.5) * 150;
          const y = this.bossDeadY + (this.frng() - 0.5) * 150;
          this.boom(x, y, this.frng() < 0.3 ? "l" : "m", false);
          this.shake(6, 160);
        }
      }
      if (this.stateT >= T.completeDelay) {
        this.state = "done";
        this.onFinish(true);
      }
    } else if (this.state === "failed") {
      if (this.stateT >= T.failDelay) {
        this.state = "done";
        this.onFinish(false);
      }
    }
  }

  // ================================================================== boss / chapter flow
  startBoss(bossId: string): void {
    if (this.boss || this.state !== "playing") return;
    const factory = this.bossFactory.ids.length > 0 ? this.bossFactory : (this.fallbackBosses ?? this.bossFactory);
    try {
      this.boss = factory.create(bossId, this);
    } catch (err) {
      this.logErr("bosses.create", err);
      if (this.fallbackBosses) {
        try {
          this.boss = this.fallbackBosses.create(bossId, this);
        } catch (e2) {
          this.logErr("fallback boss", e2);
        }
      }
    }
    if (!this.boss) {
      // nothing to fight: finish the chapter so the run cannot soft-lock
      this.completeChapter();
      return;
    }
    this.bossId = bossId;
    this.events.emit("bossSpawned", { bossId });
    this.events.emit("banner", { text: "WARNING", subtext: this.boss.hud().name, ms: 2600 });
    this.audio.playMusic(bossId === "citadel_core" ? "boss_final" : "boss");
    this.playSfx("boss_roar");
    this.playSfx("warning");
    this.flash([255, 60, 40], 400);
    this.shake(5, 500);
  }

  private onBossDone(): void {
    if (!this.bossDefeatedEmitted && this.bossId) this.events.emit("bossDefeated", { bossId: this.bossId });
    this.stats.bossDefeated = true;
    this.stats.score += WORLD_TUNING.bossDefeatBonus;
    this.completeChapter();
  }

  completeChapter(): void {
    if (this.state !== "playing") return;
    if (this.boss && !this.stats.bossDefeated) {
      this.stats.bossDefeated = true;
      if (!this.bossDefeatedEmitted && this.bossId) this.events.emit("bossDefeated", { bossId: this.bossId });
    }
    this.state = "complete";
    this.stateT = 0;
    this.clearEnemyBullets(-1);
    // anything still alive goes down with the boss
    const list = this.enemyPool.items;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (e.alive) this.killEnemy(e, false);
    }
    this.hazards.clear();
    this.events.emit("chapterComplete", { chapterId: this.chapter.id });
    this.events.emit("banner", { text: "MISSION COMPLETE", subtext: this.chapter.name, ms: 3000 });
    this.audio.playMusic(null, { fadeMs: 800 });
    this.playSfx("stage_clear");
    this.flash([255, 255, 255], 350);
  }

  /** QA: skip ahead on the timeline (see GameSceneParams.startAt) */
  fastForward(toTime: number): void {
    let t = 0;
    const chunk = 0.25;
    const prevGod = this.god;
    this.god = true;
    while (t < toTime && !this.boss) {
      const d = Math.min(chunk, toTime - t);
      t += d;
      this.time += d;
      this.scrollY += this.scrollSpeed * d;
      try {
        this.runner.update(d, this);
      } catch (err) {
        this.logErr("fastForward", err);
        break;
      }
      if (this.boss) break;
      // silently drop anything spawned meanwhile
      const list = this.enemyPool.items;
      for (let i = list.length - 1; i >= 0; i--) this.removeEnemySilent(list[i]!, i);
      this.eBullets.clear();
      this.hazards.clear();
    }
    this.god = prevGod;
    this.scrollSpeed = this.scrollTarget;
  }

  // ================================================================== enemies
  spawnEnemy(defId: string, x: number, y: number, opts?: EnemySpawnOpts): Enemy | null {
    const def = this.enemySys.defs[defId];
    if (!def) {
      this.warnOnce("def:" + defId, `unknown enemy def "${defId}"`);
      return null;
    }
    const e = this.enemyPool.acquire();
    if (!e) {
      this.warnOnce("enemyPool", "enemy pool exhausted");
      return null;
    }
    const o = opts ?? EMPTY_OPTS;
    e.id = this.nextId++;
    e.def = def;
    e.alive = true;
    e.removed = false;
    e.x = x;
    e.y = y;
    e.vx = 0;
    e.vy = 0;
    e.maxHp = e.hp = Math.max(1, def.hp * (o.hpScale ?? 1));
    e.t = 0;
    e.tOn = 0;
    e.onScreen = false;
    e.facing = 90;
    e.flash = 0;
    e.frame = 0;
    e.bossId = o.bossId;
    e.invuln = false;
    e.opts = o;
    e.data = {};
    const hb = def.hitbox;
    e.hw = (hb ? hb[0] : def.size[0] * PIXEL_SCALE * 0.8) / 2;
    e.hh = (hb ? hb[1] : def.size[1] * PIXEL_SCALE * 0.8) / 2;
    e.immuneCd = 0;
    e.smokeT = 0;
    e.graveT = 0;
    e.counted = def.destructible !== false && !o.bossId;
    if (e.counted) this.stats.spawned++;
    try {
      this.enemySys.onSpawn(e, this);
    } catch (err) {
      this.logErr("enemySystem.onSpawn", err);
    }
    if (this.bus.has("enemySpawned")) this.events.emit("enemySpawned", { enemy: e });
    return e;
  }

  private updateEnemies(dt: number): void {
    const list = this.enemyPool.items;
    const n = list.length;
    const T = WORLD_TUNING;
    const reg = this.svc.sprites;
    for (let i = 0; i < n; i++) {
      const e = list[i]!;
      if (!e.alive) continue;
      const def = e.def;
      e.t += dt;
      if (def.layer === "ground" && def.anchored !== false) e.y += this.scrollSpeed * dt;
      try {
        this.enemySys.update(e, dt, this);
      } catch (err) {
        this.logErr("enemySystem.update", err);
      }
      if (!e.alive) continue;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
      if (e.immuneCd > 0) e.immuneCd -= dt;
      const on = e.x > -e.hw && e.x < GAME_W + e.hw && e.y > -e.hh && e.y < GAME_H + e.hh;
      e.onScreen = on;
      if (on) e.tOn += dt;
      // animation frame
      const info = reg.info(def.sprite ?? "enemy_" + def.id);
      if (info && info.frames > 1) e.frame = Math.floor(e.t * (info.fps ?? 8)) % info.frames;
      // damage smoke / fire
      if (on && def.destructible !== false) {
        const f = e.hp / e.maxHp;
        if (f < 0.5) {
          e.smokeT -= dt;
          if (e.smokeT <= 0) {
            e.smokeT = f < 0.25 ? 0.07 : 0.14;
            this.spawnFxI(f < 0.25 && this.frng() < 0.6 ? "fire" : "smoke", e.x + (this.frng() - 0.5) * e.hw, e.y + (this.frng() - 0.5) * e.hh, 1, def.layer === "ground");
          }
        }
      }
      // cull
      if (!e.bossId) {
        if (e.y > GAME_H + T.enemyCullBottom + e.hh || e.y < -T.enemyCullTop || ((e.x < -T.enemyCullSide || e.x > GAME_W + T.enemyCullSide) && e.t > 1)) {
          this.cullEnemy(e);
        }
      }
    }
  }

  private cullEnemy(e: EnemyRT): void {
    e.alive = false;
    e.removed = true;
    try {
      this.enemySys.onDeath(e, this);
    } catch (err) {
      this.logErr("enemySystem.onDeath(cull)", err);
    }
  }

  private removeEnemySilent(e: EnemyRT, idx: number): void {
    e.alive = false;
    e.removed = true;
    try {
      this.enemySys.onDeath(e, this);
    } catch {
      /* ignore */
    }
    this.enemyPool.spliceAt(idx);
    this.graveyard.push(e);
    e.graveT = WORLD_TUNING.graveSec;
  }

  private cleanupEnemies(dt: number): void {
    const list = this.enemyPool.items;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]!;
      if (!e.alive || e.removed) {
        this.enemyPool.spliceAt(i);
        e.graveT = WORLD_TUNING.graveSec;
        this.graveyard.push(e);
      }
    }
    const g = this.graveyard;
    for (let i = g.length - 1; i >= 0; i--) {
      const e = g[i]!;
      e.graveT -= dt;
      if (e.graveT <= 0) {
        g[i] = g[g.length - 1]!;
        g.pop();
        this.enemyPool.recycle(e);
      }
    }
  }

  // ------------------------------------------------------------------ damage rules
  /** can a projectile of this class hurt the enemy? (ARCHITECTURE.md 3.2) */
  canHurt(cls: DamageClass, hitsAir: boolean, e: EnemyRT): boolean {
    const d = e.def;
    if (d.destructible === false || e.invuln) return false;
    const v = d.vulnerableTo;
    if (cls === "air") return v === "air" || v === "both";
    if (d.layer === "ground") return v === "ground" || v === "both";
    return hitsAir;
  }

  /** apply (armor-reduced) projectile damage and all feedback */
  hitEnemy(e: EnemyRT, dmg: number, cls: "air" | "ground", x: number, y: number): void {
    if (!e.alive) return;
    const armor = e.def.armor ?? 0;
    const d = Math.max(1, dmg - armor);
    e.hp -= d;
    e.flash = WORLD_TUNING.flashEnemy;
    this.spawnFxI("hit", x, y, 1, false);
    this.playSfx("hit", { volume: 0.5 });
    if (this.bus.has("enemyHit")) this.events.emit("enemyHit", { enemy: e, damage: d, byClass: cls });
    try {
      this.enemySys.onHit?.(e, d, this);
    } catch (err) {
      this.logErr("enemySystem.onHit", err);
    }
    if (e.hp <= 0 && e.alive) this.killEnemy(e, true);
  }

  /** wrong weapon class: grey ping + hit_metal + enemyImmune */
  pingImmune(e: EnemyRT, cls: "air" | "ground", x: number, y: number): void {
    if (e.immuneCd > 0) return;
    e.immuneCd = 0.22;
    this.spawnFxI("ping", x, y, 1, false);
    this.playSfx("hit_metal", { volume: 0.55 });
    this.events.emit("enemyImmune", { enemy: e, byClass: cls, x, y });
  }

  damageEnemy(e: Enemy, amount: number, byPlayer = true): void {
    const er = e as EnemyRT;
    if (!er.alive || er.invuln || er.def.destructible === false || amount <= 0) return;
    er.hp -= amount;
    er.flash = WORLD_TUNING.flashEnemy;
    if (this.bus.has("enemyHit")) this.events.emit("enemyHit", { enemy: er, damage: amount, byClass: "ground" });
    try {
      this.enemySys.onHit?.(er, amount, this);
    } catch (err) {
      this.logErr("enemySystem.onHit", err);
    }
    if (er.hp <= 0 && er.alive) this.killEnemy(er, byPlayer);
  }

  killEnemy(e: Enemy, byPlayer = true): void {
    const er = e as EnemyRT;
    if (!er.alive) return;
    const def = er.def;
    er.alive = false;
    er.hp = Math.min(er.hp, 0);
    try {
      this.enemySys.onDeath(er, this);
    } catch (err) {
      this.logErr("enemySystem.onDeath", err);
    }
    const sz = def.explosion;
    this.boom(er.x, er.y, sz, def.layer === "ground");
    if (def.layer === "ground" && this.svc.sprites.has("enemy_" + def.id + "_dead")) {
      const w = this.spawnFxI("wreck", er.x, er.y, 1, true);
      if (w) w.sprite = "enemy_" + def.id + "_dead";
    }
    let score = 0;
    if (byPlayer) {
      const st = this.stats;
      if (st.comboTimer > 0) st.combo = Math.min(WORLD_TUNING.comboMax, st.combo + WORLD_TUNING.comboStep);
      else st.combo = 1;
      st.comboTimer = WORLD_TUNING.comboWindow;
      score = Math.round(def.score * st.combo);
      st.score += score;
      st.kills++;
      if (def.layer === "air") st.airKills++;
      else st.groundKills++;
      if (def.tags) for (let i = 0; i < def.tags.length; i++) st.tagKills[def.tags[i]!] = (st.tagKills[def.tags[i]!] ?? 0) + 1;
      if (er.counted) {
        this.killedCounted++;
        st.killRate = Math.min(1, this.killedCounted / Math.max(1, st.spawned));
      }
      if (er.opts.drops !== false) this.dropsFor(er);
    }
    if (this.bus.has("enemyKilled")) this.events.emit("enemyKilled", { enemy: er, score, byPlayer });
    if (er.bossId) {
      this.bossDeadX = er.x;
      this.bossDeadY = er.y;
      if (this.boss?.onPartDestroyed) {
        const part = String((er.data.part as string | undefined) ?? (er.opts.data?.part as string | undefined) ?? def.id);
        try {
          this.boss.onPartDestroyed(part, this);
        } catch (err) {
          this.logErr("boss.onPartDestroyed", err);
        }
      }
    }
  }

  private dropsFor(e: EnemyRT): void {
    const drops = e.def.drops;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i]!;
      if (this.rngFn() > d.chance) continue;
      const lo = d.min ?? 1;
      const hi = d.max ?? lo;
      const n = lo + Math.floor(this.rngFn() * (hi - lo + 1));
      for (let j = 0; j < n; j++) this.spawnPickup(d.kind, e.x + (this.rngFn() - 0.5) * 24, e.y + (this.rngFn() - 0.5) * 24);
    }
  }

  // ================================================================== bullets / hazards / pickups / fx API
  /** enemy (or scripted) bullet from patterns / bosses */
  spawnBullet(spec: BulletSpawn): void {
    const pool = spec.damageClass === "enemy" ? this.eBullets : this.pBullets;
    const b = pool.acquire();
    if (!b) return;
    const isEnemy = spec.damageClass === "enemy";
    this.initBullet(b, spec, !isEnemy);
    if (isEnemy) {
      b.damage = spec.damage * this.dmgScale;
      b.speed = spec.speed * this.spdScale;
      this.setVel(b);
      if (b.hp > 0) this.shootables++;
      if (b.isMissile) {
        if (this.bus.has("missileLaunched")) this.events.emit("missileLaunched", { x: b.x, y: b.y, id: b.id });
        this.playSfx("missile_launch", { volume: 0.7 });
        this.playSfx("warning", { volume: 0.7 });
      }
    }
  }

  /** player projectile (weapons module) */
  spawnPlayerBullet(spec: PlayerBulletSpawn): void {
    const b = this.pBullets.acquire();
    if (!b) return;
    this.initBullet(b, spec, true);
    b.maxSpeed = spec.maxSpeed ?? 0;
    b.targetId = spec.targetId ?? 0;
    b.blastDelay = spec.blastDelay ?? 0;
    b.blastHitsAir = spec.blastHitsAir ?? false;
    b.kind = spec.kind ?? "";
  }

  private initBullet(b: Bullet, s: BulletSpawn, player: boolean): void {
    b.id = this.nextId++;
    b.player = player;
    b.x = s.x;
    b.y = s.y;
    b.angle = s.angle;
    b.speed = s.speed;
    b.maxSpeed = 0;
    b.accel = s.accel ?? 0;
    b.dmgClass = s.damageClass;
    b.damage = s.damage;
    b.motion = s.motion ?? "linear";
    b.life = s.life ?? 8;
    b.age = 0;
    b.visual = s.visual;
    b.radius = s.visual.radius;
    b.turnRate = s.turnRate ?? 0;
    b.armDelay = s.armDelay ?? 0;
    b.decoyable = s.decoyable ?? false;
    b.isMissile = s.isMissile ?? false;
    b.blastRadius = s.blastRadius ?? 0;
    b.blastDelay = 0;
    b.blastHitsAir = false;
    b.hp = s.hp ?? 0;
    b.hitsAir = s.hitsAir ?? false;
    b.hitsGround = s.hitsGround ?? s.damageClass === "ground";
    b.pierce = s.pierce ?? 0;
    b.ownerId = s.ownerId ?? 0;
    b.kind = "";
    b.sineAmp = s.sineAmp ?? 0;
    b.sineFreq = s.sineFreq ?? 0;
    b.bx = s.x;
    b.by = s.y;
    b.sx = s.x;
    b.sy = s.y;
    b.tx = s.tx ?? s.x;
    b.ty = s.ty ?? s.y;
    b.lobT = 0;
    b.targetId = 0;
    b.retargetT = 0;
    b.divert = 0;
    b.locked = false;
    b.trailT = 0;
    b.hitN = 0;
    b.rot = 0;
    this.setVel(b);
    if (b.motion === "sine") {
      // perpendicular unit vector
      const r = (b.angle + 90) * D2R;
      b.nx = Math.cos(r);
      b.ny = Math.sin(r);
    }
    if (b.motion === "lobbed") {
      const dx = b.tx - b.x;
      const dy = b.ty - b.y;
      const dist = Math.hypot(dx, dy);
      b.lobT = Math.max(0.05, dist / Math.max(1, b.speed));
      b.life = Math.max(b.life, b.lobT + 0.5);
    }
  }

  setVel(b: Bullet): void {
    const r = b.angle * D2R;
    b.vx = Math.cos(r) * b.speed;
    b.vy = Math.sin(r) * b.speed;
  }

  spawnHazard(spec: HazardSpawn): void {
    const h = this.hazards.acquire();
    if (!h) return;
    h.x = spec.x;
    h.y = spec.y;
    h.radius = spec.radius;
    h.telegraph = Math.max(0.05, spec.telegraphMs / 1000);
    h.t = 0;
    h.damage = spec.damageClass === "enemy" ? spec.damage * this.dmgScale : spec.damage;
    h.cls = spec.damageClass;
    h.anchored = spec.anchored ?? false;
    h.blastFx = spec.blastFx ?? "fx_explosion_m";
    const c = spec.color ?? (spec.damageClass === "enemy" ? [255, 70, 50] : [255, 190, 60]);
    h.r = c[0];
    h.g = c[1];
    h.b = c[2];
    h.state = 0;
    h.blastT = 0;
    h.hitsAir = spec.damageClass === "air";
    h.hitsGround = spec.damageClass !== "air";
  }

  /** delayed player blast (heavy bomb) */
  private spawnPlayerHazard(x: number, y: number, radius: number, damage: number, delay: number, hitsAir: boolean): void {
    const h = this.hazards.acquire();
    if (!h) return;
    h.x = x;
    h.y = y;
    h.radius = radius;
    h.telegraph = delay;
    h.t = 0;
    h.damage = damage;
    h.cls = "ground";
    h.anchored = true;
    h.blastFx = "fx_explosion_l";
    h.r = 255;
    h.g = 190;
    h.b = 60;
    h.state = 0;
    h.blastT = 0;
    h.hitsAir = hitsAir;
    h.hitsGround = true;
  }

  spawnPickup(kind: PickupKind, x: number, y: number): void {
    const p = this.pickups.acquire();
    if (!p) return;
    p.id = this.nextId++;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = (this.frng() - 0.5) * 90;
    p.vy = -60 - this.frng() * 40;
    p.t = 0;
    p.magnetized = false;
  }

  spawnFx(kind: FxKind, x: number, y: number, opts?: { scale?: number; delay?: number; vx?: number; vy?: number }): void {
    const f = this.spawnFxI(kind, x, y, opts?.scale ?? 1, FXDEF[kind].scroll);
    if (!f) return;
    if (opts) {
      if (opts.delay) f.delay = opts.delay > 10 ? opts.delay / 1000 : opts.delay;
      if (opts.vx !== undefined || opts.vy !== undefined) {
        f.vx = opts.vx ?? 0;
        f.vy = opts.vy ?? 0;
      }
    }
  }

  /** internal particle spawn; returns the fx (or null if pool full) */
  spawnFxI(kind: FxInternalKind, x: number, y: number, scale: number, scroll: boolean): Fx | null {
    const f = this.fxPool.acquire();
    if (!f) return null;
    const d = FXDEF[kind];
    f.kind = kind;
    f.sprite = d.sprite;
    f.x = x;
    f.y = y;
    f.t = 0;
    f.life = d.life;
    f.delay = 0;
    f.scale = scale;
    f.rot = 0;
    f.vrot = 0;
    f.gravity = d.gravity;
    f.scroll = scroll;
    f.r = d.r;
    f.g = d.g;
    f.b = d.b;
    f.frame = 0;
    if (d.spread > 0) {
      const a = this.frng() * 6.2832;
      const s = d.spread * (0.4 + this.frng() * 0.6);
      f.vx = Math.cos(a) * s;
      f.vy = Math.sin(a) * s + d.vy;
    } else {
      f.vx = 0;
      f.vy = d.vy;
    }
    if (kind === "debris") f.vy -= 60;
    return f;
  }

  /** composite explosion: sprite + sparks + debris + shake + sfx */
  boom(x: number, y: number, size: "s" | "m" | "l", ground: boolean, sfx = true): void {
    this.spawnFxI(size === "s" ? "explosion_s" : size === "m" ? "explosion_m" : "explosion_l", x, y, 1, ground);
    const n = size === "s" ? 3 : size === "m" ? 6 : 12;
    if (this.fxPool.size < this.fxPool.capacity * 0.8) {
      for (let i = 0; i < n; i++) this.spawnFxI("spark", x, y, 1, false);
      for (let i = 0; i < (n >> 1); i++) this.spawnFxI("debris", x, y, 1, false);
    }
    if (size === "l") this.spawnFxI("ring", x, y, 2.2, false);
    if (sfx) this.playSfx(size === "s" ? "explode_s" : size === "m" ? "explode_m" : "explode_l");
    if (size === "m") this.shake(2.5, 140);
    else if (size === "l") this.shake(6, 320);
  }

  // ================================================================== player glue
  damagePlayer(amount: number, source: string): void {
    this.pc.hurt(amount * this.dmgScale, source, this);
  }
  onPlayerHit(): void {
    this.stats.combo = 1;
    this.stats.comboTimer = 0;
  }

  clearEnemyBullets(x = -1, y = -1, radius = -1): void {
    const list = this.eBullets.items;
    const all = radius < 0 || x < 0;
    const r2 = radius * radius;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]!;
      if (!all) {
        const dx = b.x - x;
        const dy = b.y - y;
        if (dx * dx + dy * dy > r2) continue;
      }
      this.freeEnemyBullet(i, b);
    }
  }

  /** remove an enemy bullet from the pool, keeping missile-lock bookkeeping */
  freeEnemyBullet(i: number, b: Bullet): void {
    if (b.hp > 0) this.shootables--;
    if (b.locked) {
      b.locked = false;
      if (this.bus.has("missileLock")) this.events.emit("missileLock", { id: b.id, active: false });
    }
    this.eBullets.releaseAt(i);
  }

  deployFlare(x: number, y: number, radius: number): void {
    const f = this.flare;
    f.active = true;
    f.x = x;
    f.y = y;
    f.t = WORLD_TUNING.flareDivertSec;
    f.radius = radius;
    this.spawnFxI("flare", x, y, 1.6, false);
    this.spawnFxI("ring", x, y, 3, false);
    for (let i = 0; i < 10; i++) this.spawnFxI("spark", x, y, 1, false);
    this.playSfx("flare");
    this.flash([255, 255, 220], 120);
    const list = this.eBullets.items;
    const r2 = radius * radius;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]!;
      const dx = b.x - x;
      const dy = b.y - y;
      const inside = dx * dx + dy * dy <= r2;
      if (b.decoyable || b.isMissile) {
        if (inside) {
          this.spawnFxI("explosion_s", b.x, b.y, 1, false);
          this.playSfx("explode_s", { volume: 0.5 });
          this.freeEnemyBullet(i, b);
        } else if (b.turnRate > 0) {
          b.divert = WORLD_TUNING.flareDivertSec;
        }
      } else if (inside && b.hp <= 0 && b.radius <= 9) {
        this.spawnFxI("spark", b.x, b.y, 1, false);
        this.freeEnemyBullet(i, b);
      }
    }
  }

  // ================================================================== targeting (weapons)
  private cand: EnemyRT[] = [];
  private candD: number[] = [];

  pickAirTarget(x: number, y: number, rank: number): Enemy | null {
    const list = this.enemyPool.items;
    const cand = this.cand;
    const cd = this.candD;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (!e.alive || !e.onScreen || e.y + e.hh < 0 || !this.canHurt("air", false, e)) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      // prefer targets ahead (above) of the player
      const d = dx * dx + dy * dy + (e.y > y + 20 ? 90000 : 0);
      let j = n++;
      while (j > 0 && cd[j - 1]! > d) {
        cd[j] = cd[j - 1]!;
        cand[j] = cand[j - 1]!;
        j--;
      }
      cd[j] = d;
      cand[j] = e;
    }
    if (n === 0) return null;
    return cand[rank % n]!;
  }

  pickGroundTarget(x: number, y: number): Enemy | null {
    const list = this.enemyPool.items;
    let best: EnemyRT | null = null;
    let bd = 1e12;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (!e.alive || !e.onScreen || e.def.layer !== "ground" || !this.canHurt("ground", false, e)) continue;
      if (e.y > y + 60) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy * 0.6;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  findEnemy(id: number): EnemyRT | null {
    const list = this.enemyPool.items;
    for (let i = 0; i < list.length; i++) if (list[i]!.id === id) return list[i]!;
    return null;
  }

  /** laser: one tick of damage on every hurtable target in the vertical strip above yBottom */
  beamTick(x: number, halfW: number, yBottom: number, damage: number): void {
    const list = this.enemyPool.items;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (!e.alive || !e.onScreen) continue;
      if (e.y - e.hh > yBottom || Math.abs(e.x - x) > halfW + e.hw) continue;
      const hy = Math.min(yBottom, e.y + e.hh);
      if (this.canHurt("air", false, e)) {
        this.hitEnemy(e, damage, "air", x + (this.frng() - 0.5) * halfW, hy);
      } else if (e.def.layer === "ground" || e.invuln) {
        this.pingImmune(e, "air", x, hy);
      }
    }
    // shoot down flak / missiles caught in the beam
    if (this.shootables > 0) {
      const eb = this.eBullets.items;
      for (let i = eb.length - 1; i >= 0; i--) {
        const b = eb[i]!;
        if (b.hp <= 0 || Math.abs(b.x - x) > halfW + b.radius || b.y > yBottom) continue;
        b.hp -= damage;
        if (b.hp <= 0) this.destroyShot(i, b);
      }
    }
  }

  /** an enemy bullet with hp was shot down */
  destroyShot(i: number, b: Bullet): void {
    this.spawnFxI("explosion_s", b.x, b.y, 1, false);
    this.playSfx("explode_s", { volume: 0.5 });
    this.stats.score += 50;
    this.freeEnemyBullet(i, b);
  }

  // ================================================================== blasts
  detonate(b: Bullet): void {
    if (b.player) {
      if (b.blastDelay > 0) {
        this.spawnPlayerHazard(b.x, b.y, b.blastRadius, b.damage, b.blastDelay, b.blastHitsAir || b.hitsAir);
      } else {
        this.playerBlast(b.x, b.y, b.blastRadius, b.damage, b.blastHitsAir || b.hitsAir, b.dmgClass === "air" ? "air" : "ground");
      }
    } else {
      this.enemyBlast(b.x, b.y, b.blastRadius, b.damage);
    }
  }

  playerBlast(x: number, y: number, radius: number, damage: number, hitsAir: boolean, cls: "air" | "ground"): void {
    const list = this.enemyPool.items;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const e = list[i]!;
      if (!e.alive || !e.onScreen) continue;
      const dx = Math.max(Math.abs(x - e.x) - e.hw, 0);
      const dy = Math.max(Math.abs(y - e.y) - e.hh, 0);
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      if (this.canHurt(cls, hitsAir, e)) {
        const falloff = 1 - 0.4 * Math.sqrt(d2) / radius;
        this.hitEnemy(e, damage * falloff, cls, Math.max(e.x - e.hw, Math.min(x, e.x + e.hw)), Math.max(e.y - e.hh, Math.min(y, e.y + e.hh)));
      } else if (e.def.layer === "ground") {
        this.pingImmune(e, "ground", e.x, e.y);
      }
    }
    // shoot down bullets inside the blast
    if (this.shootables > 0) {
      const eb = this.eBullets.items;
      for (let i = eb.length - 1; i >= 0; i--) {
        const b = eb[i]!;
        if (b.hp <= 0) continue;
        const dx = b.x - x;
        const dy = b.y - y;
        if (dx * dx + dy * dy <= radius * radius) this.destroyShot(i, b);
      }
    }
    const big = radius >= 60;
    if (cls === "ground" && !hitsAir) {
      this.spawnFxI("blast_ground", x, y, (radius * 2) / FXDEF.blast_ground.size, true);
      this.spawnFxI("explosion_m", x, y, (radius * 1.5) / FXDEF.explosion_m.size, true);
    } else {
      this.spawnFxI(big ? "explosion_l" : "explosion_m", x, y, (radius * 2) / FXDEF[big ? "explosion_l" : "explosion_m"].size, false);
    }
    for (let i = 0; i < 4; i++) this.spawnFxI("spark", x, y, 1, false);
    this.playSfx("bomb_explode", { volume: radius > 60 ? 1 : 0.8, pitch: radius > 60 ? 0.8 : 1 });
    this.shake(big ? 7 : 3, big ? 320 : 160);
  }

  enemyBlast(x: number, y: number, radius: number, damage: number): void {
    const p = this.pc.state;
    if (p.alive) {
      const dx = p.x - x;
      const dy = p.y - y;
      const rr = radius + p.hitRadius;
      if (dx * dx + dy * dy <= rr * rr) this.pc.hurt(damage, "blast", this);
    }
    const kind: FxInternalKind = radius >= 60 ? "explosion_l" : radius >= 28 ? "explosion_m" : "explosion_s";
    this.spawnFxI(kind, x, y, (radius * 2) / FXDEF[kind].size, false);
    this.playSfx(radius >= 28 ? "explode_m" : "explode_s", { volume: 0.7 });
    this.shake(radius >= 40 ? 4 : 1.5, 140);
  }

  private updateHazards(dt: number): void {
    const list = this.hazards.items;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i]!;
      if (h.anchored) h.y += this.scrollSpeed * dt;
      if (h.state === 0) {
        h.t += dt;
        if (h.t >= h.telegraph) {
          h.state = 1;
          h.blastT = 0;
          if (h.cls === "enemy") {
            this.enemyBlast(h.x, h.y, h.radius, h.damage);
          } else {
            this.playerBlast(h.x, h.y, h.radius, h.damage, h.hitsAir, h.cls === "air" ? "air" : "ground");
          }
        }
      } else {
        h.blastT += dt;
        if (h.blastT > 0.3) this.hazards.releaseAt(i);
      }
      if (h.y > GAME_H + h.radius + 20) this.hazards.releaseAt(i);
    }
  }

  // ================================================================== pickups
  private updatePickups(dt: number): void {
    const T = WORLD_TUNING;
    const list = this.pickups.items;
    const p = this.pc.state;
    for (let i = list.length - 1; i >= 0; i--) {
      const k = list[i]!;
      k.t += dt;
      // damped pop then slow fall
      k.vx -= k.vx * Math.min(1, 2.2 * dt);
      k.vy += (T.pickupFall - k.vy) * Math.min(1, 1.6 * dt);
      if (p.alive) {
        const dx = p.x - k.x;
        const dy = p.y - k.y;
        const d2 = dx * dx + dy * dy;
        const att = p.magnet > 0 ? T.magnetRadius : T.pickupAttract;
        if (!k.magnetized && k.t > 0.3 && d2 < att * att) k.magnetized = true;
        if (k.magnetized) {
          const d = Math.sqrt(d2) || 1;
          const sp = T.magnetSpeed;
          k.x += (dx / d) * sp * dt;
          k.y += (dy / d) * sp * dt;
        }
        const cr = T.pickupCollect + p.hitRadius;
        if (d2 < cr * cr && k.t > 0.15) {
          this.pc.collect(k.kind, this);
          this.pickups.releaseAt(i);
          continue;
        }
      }
      k.x += k.vx * dt;
      k.y += (k.vy + this.scrollSpeed * 0.35) * dt;
      if (k.y > GAME_H + 30 || k.x < -30 || k.x > GAME_W + 30) this.pickups.releaseAt(i);
    }
  }

  // ================================================================== fx
  private updateFx(dt: number): void {
    const list = this.fxPool.items;
    const sp = this.scrollSpeed;
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i]!;
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt;
      if (f.t >= f.life) {
        this.fxPool.releaseAt(i);
        continue;
      }
      if (f.gravity !== 0) f.vy += f.gravity * dt;
      f.x += f.vx * dt;
      f.y += (f.vy + (f.scroll ? sp : 0)) * dt;
      f.rot += f.vrot * dt;
    }
    // player damage smoke
    const p = this.pc.state;
    if (p.alive) {
      const fr = p.hp / p.maxHp;
      if (fr < 0.5) {
        this.pSmokeT -= dt;
        if (this.pSmokeT <= 0) {
          this.pSmokeT = fr < 0.25 ? 0.06 : 0.12;
          this.spawnFxI(fr < 0.25 && this.frng() < 0.5 ? "fire" : "smoke", p.x + (this.frng() - 0.5) * 10, p.y + 8, 1, false);
        }
      }
    }
    // flare decoy lifetime
    if (this.flare.active) {
      this.flare.t -= dt;
      this.flare.y += 55 * dt;
      if (this.flare.t <= 0) this.flare.active = false;
    }
  }
  private pSmokeT = 0;

  // ================================================================== HUD
  buildHud(): HudData {
    const h = this.hud;
    h.progress = this.boss ? 1 : Math.max(0, Math.min(1, this.runner.progress));
    h.hint = this.runner.hint;
    h.boss = this.boss ? this.boss.hud() : null;
    h.fps = this.fps;
    // banner
    const b = this.banner;
    if (b) {
      const total = b.ms / 1000;
      const a = Math.min(1, b.t / 0.2, (total - b.t) / 0.45);
      h.banner = { text: b.text, subtext: b.subtext, alpha: Math.max(0, a) };
    } else h.banner = null;
    // missiles
    const list = this.missileList;
    list.length = 0;
    let lock = false;
    const eb = this.eBullets.items;
    let used = 0;
    for (let i = 0; i < eb.length && used < this.missilePool.length; i++) {
      const m = eb[i]!;
      if (!m.isMissile) continue;
      const e = this.missilePool[used++]!;
      e.id = m.id;
      e.x = m.x;
      e.y = m.y;
      e.locked = m.locked;
      if (m.locked) lock = true;
      list.push(e);
    }
    this.anyLock = lock && this.pc.state.alive;
    return h;
  }

  // ================================================================== debug / QA
  cheatKillAll(): void {
    const list = this.enemyPool.items;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (e.alive) {
        e.invuln = false;
        this.killEnemy(e, true);
      }
    }
    this.clearEnemyBullets(-1);
  }

  cheatWin(): void {
    this.cheatKillAll();
    if (this.state === "playing") {
      this.stats.bossDefeated = this.stats.bossDefeated || !!this.boss;
      this.completeChapter();
    }
  }

  setGod(v: boolean): void {
    this.god = v;
  }

  /** abort via pause menu */
  get scene(): string {
    return SCENES.game;
  }
}

const D2R = Math.PI / 180;

const NEUTRAL_INPUT: InputState = {
  moveX: 0,
  moveY: 0,
  fire: false,
  bomb: false,
  special: false,
  bombPressed: false,
  specialPressed: false,
  weaponPrev: false,
  weaponNext: false,
  groundNext: false,
  pausePressed: false,
  dragTarget: null,
};

function makeBullet(): Bullet {
  return {
    id: 0,
    player: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    speed: 0,
    maxSpeed: 0,
    accel: 0,
    dmgClass: "enemy",
    damage: 0,
    motion: "linear",
    life: 0,
    age: 0,
    visual: { sprite: "", color: [255, 255, 255], radius: 3 },
    radius: 3,
    turnRate: 0,
    armDelay: 0,
    decoyable: false,
    isMissile: false,
    blastRadius: 0,
    blastDelay: 0,
    blastHitsAir: false,
    hp: 0,
    hitsAir: false,
    hitsGround: false,
    pierce: 0,
    ownerId: 0,
    kind: "",
    sineAmp: 0,
    sineFreq: 0,
    bx: 0,
    by: 0,
    nx: 0,
    ny: 0,
    sx: 0,
    sy: 0,
    tx: 0,
    ty: 0,
    lobT: 0,
    targetId: 0,
    retargetT: 0,
    divert: 0,
    locked: false,
    trailT: 0,
    hitIds: [0, 0, 0, 0, 0, 0, 0, 0],
    hitN: 0,
    rot: 0,
  };
}

function makeEnemy(): EnemyRT {
  return {
    id: 0,
    def: NULL_DEF,
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 1,
    maxHp: 1,
    t: 0,
    tOn: 0,
    onScreen: false,
    facing: 90,
    flash: 0,
    frame: 0,
    invuln: false,
    opts: EMPTY_OPTS,
    data: {},
    hw: 8,
    hh: 8,
    immuneCd: 0,
    smokeT: 0,
    removed: false,
    graveT: 0,
    counted: false,
  };
}

function makeFx(): Fx {
  return { kind: "hit", sprite: "", x: 0, y: 0, vx: 0, vy: 0, gravity: 0, t: 0, life: 1, delay: 0, scale: 1, rot: 0, vrot: 0, scroll: false, r: 255, g: 255, b: 255, frame: 0 };
}

function makeHazard(): Hazard {
  return { x: 0, y: 0, radius: 10, telegraph: 1, t: 0, damage: 0, cls: "enemy", anchored: false, blastFx: "", r: 255, g: 0, b: 0, state: 0, blastT: 0, hitsAir: false, hitsGround: true };
}
