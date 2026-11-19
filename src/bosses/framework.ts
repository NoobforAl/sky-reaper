/**
 * Shared boss machinery: part rig, entry, phases, move scheduler, telegraphs, defeat sequence, HUD.
 *
 * Lifecycle of every boss:
 *   entry (parts invulnerable, rig glides in)  ->  phase 1 (core shielded)  ->  phase 2 (core open)  ->  phase 3
 *   -> core destroyed: bossDefeated + bullet clear + chain explosions + drops -> `done` after DEFEAT_SEC
 *   (the Engine sees `done`, adds the boss bonus and calls completeChapter(); if it does not, we call it ourselves).
 * Phases come from total live part HP vs initial (thresholds in BOSS_TUNING.phaseAt). A phase change emits `bossPhase`
 * (Engine: clear bullets + flash + shake + sfx; we also clear/flash/shake so it works without the Engine hook),
 * cancels running patterns, grants a short breather and drops a reward pickup.
 */
import { DESIGN_W, GAME_W, X_SCALE, type BossController, type BossHudInfo, type Enemy, type PatternDef, type PatternInstance, type PatternOwner, type PickupKind, type WorldAPI } from "../contracts";
import { patternRunner } from "../patterns";
import { tr } from "../levels/i18n";
import { BP } from "./attacks";
import { BOSS_PART_DEFS } from "./parts";

const SIM_STEP = 1 / 60;

/**
 * Boss pacing (QA #3; target 40-70 s per boss, every phase >= 10 s, see docs/LEVEL_NOTES.md):
 *  - HP scale = (hpBase + hpSlope * difficulty) * layout factor  (easy 0.7 -> x1.87, normal x2.2, hard 1.5 -> x2.75)
 *  - wide (desktop) fields divide by sqrt(X_SCALE), clamped to >= wideHpMin: the rig roams wider there, so the same
 *    HP lasts longer than on the 480 portrait field (QA: portrait fights were 30-50 % of the wide ones).
 *  - phase gate: a phase cannot end before `minPhaseSec`. If the HP threshold is reached earlier, the whole rig hardens
 *    (invulnerable, pulsing rings) until the phase has run its minimum, so the signature attacks always play.
 *  - the core cannot be destroyed before the final phase has run `minPhaseSec`: once it drops to `coreFloor` of its
 *    max HP it hardens until the current phase has run its minimum; before the final phase that also advances the
 *    phase (so focusing the core never stalls the fight).
 *
 * Round 5 DPS gate (docs/BALANCE_SPEC.md section 5, B1-B3): bosses are sized for the budgeted DPS (per-boss hpMul) and
 * a phase that outlasts its soft timer `softSec[phase-1]` ESCALATES: stage 1 at the timer, +1 stage every
 * `escalateEvery` s, up to `escalateMax` (move cooldowns x(1 - escalateCd * stage), boss bullets x(1 + escalateSpeed *
 * stage), banner "BOSS ENRAGED" / "ENRAGED II" / "ENRAGED III"; stage 3 adds a punish burst every `punishEvery` s).
 * THREAT (world.threat 0..3) speeds boss moves +10 % and boss bullets +8 % per level. The armour drain is now only a
 * last-resort anti-softlock after `maxPhaseSec` (50 s, by then the boss is at ENRAGED III).
 * QA R4-2: phase 2 used to end on the gate floor with an invulnerable rig: phase 2 now holds 30 % of the HP (was 25 %,
 * phaseAt [0.72, 0.42]) and the floor is 10 s; `gatedSec[]` counts the seconds each phase spent hardened.
 */
export const BOSS_TUNING = {
  /**
   * total-HP fractions where phase 2 / phase 3 start (P1 28 %, P2 30 %, P3 42 % of the HP). QA R4-2 asked for
   * [0.75, 0.42]; with the round-5 HP the godMode pass then gated phase 1 for 4-5.5 s instead, so P1 keeps a bit more.
   */
  phaseAt: [0.72, 0.42] as const,
  /** seconds of no attacks after a phase change */
  phaseBreather: 1.6,
  /** a phase lasts at least this long (s) before the next one (or the defeat) may start (QA R4-2: 11 -> 10) */
  minPhaseSec: 10,
  /** soft timers per phase (s): past this the boss escalates (B2) */
  softSec: [18, 16, 26] as const,
  /** seconds per extra escalation stage after the soft timer */
  escalateEvery: 6,
  escalateMax: 3,
  /** move cooldown cut per stage (x0.88 / 0.76 / 0.64) */
  escalateCd: 0.12,
  /** boss bullet speed per stage (x1.06 / 1.12 / 1.18) */
  escalateSpeed: 0.06,
  /** THREAT: boss move rate +10 % and boss bullet speed +8 % per level */
  threatMoveRate: 0.1,
  threatBulletSpeed: 0.08,
  /** ENRAGED III punish burst from the core (s) */
  punishEvery: 2.5,
  /** after this long in one phase the armour cracks (last-resort anti-softlock drain, B3: 24 -> 50) */
  maxPhaseSec: 50,
  /** share of each part's max HP lost per second while the armour is cracked (B3: 0.05 -> 0.03) */
  drainPerSec: 0.03,
  /** core hardens at this fraction of its HP until it is allowed to die */
  coreFloor: 0.2,
  /**
   * core shield drops anyway after this long in phase 1 (anti-stall). Round 5: 45 -> 30 (= softSec[0] + 2 escalation
   * stages): the godMode pass showed the gunship's phase 1 ending on this timer at 44 s, its pods being hard to track
   */
  shieldTimeout: 30,
  /** defeat sequence length before `done` */
  defeatSec: 2.4,
  /** min telegraph for big attacks (ms) */
  bigTelegraphMs: 900,
  /** bomb resupply while ground-only parts live */
  bombDropEvery: 14,
  /** hp multiplier: hpBase + hpSlope * difficulty (normal 1.0 -> x2.2) */
  hpBase: 1.1,
  hpSlope: 1.1,
  /** lower clamp of the wide-field HP factor 1/sqrt(X_SCALE) */
  wideHpMin: 0.6,
} as const;

/** HP factor for the live playfield (1 on the 480 portrait field) */
export const BOSS_LAYOUT_HP = Math.min(1, Math.max(BOSS_TUNING.wideHpMin, 1 / Math.sqrt(X_SCALE)));

export interface PartRT {
  name: string; // unique instance name, e.g. "turret_l1"
  kind: string; // part kind, e.g. "turret" (sprite suffix)
  e: Enemy;
  ox: number;
  oy: number;
  owner: PartOwner;
  maxHp: number;
  core: boolean;
  scenery: boolean;
  dead: boolean;
}

/** PatternOwner adapter reading a part's live position (allocated once per part) */
export class PartOwner implements PatternOwner {
  facing = 90;
  constructor(private part: { e: Enemy }, readonly layer: "air" | "ground") {}
  get x() {
    return this.part.e.x;
  }
  get y() {
    return this.part.e.y;
  }
  get id() {
    return this.part.e.id;
  }
}

export interface Move {
  id: string;
  /** phases (1-based) in which the move is used */
  phases: number[];
  /** seconds between uses (scaled by phase via `speedUp`) */
  cd: number;
  /** first use, seconds after the phase starts */
  first?: number;
  /** at least one of these parts (instance names or kinds) must be alive */
  needs?: string[];
  /** blocks other `big` moves for this many seconds */
  big?: number;
  fire(b: BossBase): void;
}

interface Running {
  inst: PatternInstance;
  part: PartRT | null;
}

interface Later {
  at: number;
  fn: () => void;
}

/**
 * Extra horizontal roam for boss rigs on wide (desktop) playfields: the rig sweeps across more of the screen so its
 * attacks cover the full width (0 on the 480 portrait field, ~230 at GAME_W 1518; 0.3 made the wide fights track-limited, QA #3).
 */
export const BOSS_ROAM_EXTRA = Math.max(0, (GAME_W - DESIGN_W) * 0.22);
export function roam(amp: number): number {
  return amp + BOSS_ROAM_EXTRA;
}

export abstract class BossBase implements BossController {
  readonly bossId: string;
  abstract readonly displayName: string;
  readonly phases = 3;

  world: WorldAPI;
  t = 0; // seconds since spawn
  phaseT = 0; // seconds since phase start
  phase = 1;
  x = GAME_W / 2;
  y = -300;
  /** anchor target the rig glides to during entry */
  protected holdX = GAME_W / 2;
  protected holdY = 220;
  protected entrySec = 3.5;
  entering = true;
  defeated = false;
  private defeatT = 0;
  private doneFlag = false;
  private doneT = 0;
  parts: PartRT[] = [];
  private byName = new Map<string, PartRT>();
  private running: Running[] = [];
  private later: Later[] = [];
  private nextUse = new Map<string, number>();
  private bigUntil = 0;
  private breatherUntil = 0;
  private bombT = 0;
  private shieldFxT = 0;
  private pending: Array<{ kind: string; name: string; ox: number; oy: number; core: boolean }> = [];
  private hpScale: number;
  private initialTotal = 0;
  private hudInfo: BossHudInfo & { gatedSec?: number[] } = { name: "", hp: 1, maxHp: 1, phase: 1, phases: 3, escalation: 0 };
  /** soft-timer escalation stage of the current phase 0..3 (B2) */
  escalation = 0;
  /** seconds each phase spent hardened by the min-phase gate (QA R4-2 telemetry; also on hud() as `gatedSec`) */
  readonly gatedSec = [0, 0, 0];
  /** seconds each phase lasted (the running phase counts up) */
  readonly phaseSec = [0, 0, 0];
  private punishT = 0;
  protected moves: Move[] = [];
  /** extra condition keeping the core shielded (e.g. shield generators alive) */
  protected coreShieldExtra(): boolean {
    return false;
  }

  /** hpMul: per-boss HP trim on top of BOSS_TUNING (ch1 stays gentle, see LEVEL_NOTES) */
  constructor(bossId: string, world: WorldAPI, hpMul = 1) {
    this.bossId = bossId;
    this.world = world;
    const d = typeof world.difficulty === "number" && Number.isFinite(world.difficulty) ? world.difficulty : 1;
    this.hpScale = (BOSS_TUNING.hpBase + BOSS_TUNING.hpSlope * Math.max(0, Math.min(1.5, d))) * BOSS_LAYOUT_HP * hpMul;
  }

  // ================================================================== rig
  /** spawn a part. kind = def suffix ("turret"), name = unique instance ("turret_l1"). Order = draw order. */
  protected addPart(kind: string, name: string, ox: number, oy: number, core = false): PartRT | null {
    const defId = `boss_${this.bossId}_${kind}`;
    const def = BOSS_PART_DEFS[defId];
    const e = this.world.spawnEnemy(defId, this.x + ox, this.y + oy, {
      bossId: this.bossId,
      drops: false,
      hpScale: this.hpScale,
      data: { part: name },
    });
    if (!e) {
      // pool full / def missing: retry during the entry instead of failing the fight
      if (!this.pending.some((q) => q.name === name)) this.pending.push({ kind, name, ox, oy, core });
      return null;
    }
    e.data.part = name;
    e.invuln = true; // during entry
    const scenery = def ? def.destructible === false : false;
    const p: PartRT = { name, kind, e, ox, oy, owner: null as unknown as PartOwner, maxHp: e.maxHp, core, scenery, dead: false };
    p.owner = new PartOwner(p, def?.layer ?? "air");
    this.parts.push(p);
    this.byName.set(name, p);
    if (core && !this.corePart) this.corePart = p;
    if (!scenery) this.initialTotal += e.maxHp;
    return p;
  }

  part(name: string): PartRT | undefined {
    return this.byName.get(name);
  }

  /** alive by instance name, or (if no instance has that name) any alive part of that kind */
  alive(nameOrKind: string): boolean {
    const p = this.byName.get(nameOrKind);
    if (p) return !p.dead && p.e.alive;
    for (const q of this.parts) if (q.kind === nameOrKind && !q.dead && q.e.alive) return true;
    return false;
  }

  aliveParts(kind: string): PartRT[] {
    return this.parts.filter((p) => p.kind === kind && !p.dead && p.e.alive);
  }

  get core(): PartRT | undefined {
    return this.corePart;
  }
  private corePart: PartRT | undefined;

  /** place every part at anchor + offset (subclasses may override `offsetOf` for rotating rigs) */
  protected placeParts(): void {
    const o = this.offs;
    for (const p of this.parts) {
      if (p.dead || !p.e.alive) continue;
      this.offsetOf(p, o);
      p.e.x = this.x + o.x;
      p.e.y = this.y + o.y;
      p.e.vx = 0;
      p.e.vy = 0;
    }
  }
  /** scratch for offsetOf (no per-part tuple allocation every step) */
  private offs = { x: 0, y: 0 };
  /** write the part's current offset from the anchor into `out` (override for rotating rigs) */
  protected offsetOf(p: PartRT, out: { x: number; y: number }): void {
    out.x = p.ox;
    out.y = p.oy;
  }
  /** ease the anchor toward (tx, ty) - avoids jumps when movement parameters change between phases */
  protected glide(tx: number, ty: number, dt: number, rate = 2.5): void {
    const k = Math.min(1, dt * rate);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  // ================================================================== attacks
  /** start a pattern from a part (or the anchor when part is null). Skips dead parts. */
  fire(pattern: PatternDef, from: PartRT | string | null, facing = 90): PatternInstance | null {
    const p = typeof from === "string" ? this.byName.get(from) : from;
    if (p && (p.dead || !p.e.alive)) return null;
    pattern = this.scaled(pattern);
    let owner: PatternOwner;
    if (p) {
      p.owner.facing = facing;
      owner = p.owner;
    } else {
      owner = { x: this.x, y: this.y, facing, id: 0, layer: "air" };
    }
    let inst: PatternInstance;
    try {
      inst = patternRunner.start(pattern, owner, this.world);
    } catch {
      return null;
    }
    this.running.push({ inst, part: p ?? null });
    return inst;
  }

  /** THREAT level 0..3 of the running world (WorldAPI.threat, optional) */
  get threat(): number {
    const t = this.world.threat;
    return typeof t === "number" && t > 0 ? Math.min(3, Math.floor(t)) : 0;
  }

  /**
   * `pattern` with boss bullet speed x(1 + escalateSpeed * escalation) x(1 + threatBulletSpeed * threat), cached per
   * (pattern, stage, threat) so steady state allocates nothing. Missiles and hazard patterns are never touched (same
   * rule as src/patterns/tiers.ts tieredPattern); telegraph times are unchanged. Runner speed caps still apply.
   */
  private scaled(pattern: PatternDef): PatternDef {
    const esc = this.escalation;
    const th = this.threat;
    if (esc === 0 && th === 0) return pattern;
    const b = pattern.bullet;
    if (!b || b.isMissile || pattern.kind === "homing" || pattern.kind === "delayedBlast" || pattern.kind === "areaStrike") return pattern;
    const key = esc * 4 + th;
    let arr = SCALED.get(pattern);
    if (!arr) {
      arr = [];
      SCALED.set(pattern, arr);
    }
    let out = arr[key];
    if (!out) {
      const mul = (1 + BOSS_TUNING.escalateSpeed * esc) * (1 + BOSS_TUNING.threatBulletSpeed * th);
      out = { ...pattern, bullet: { ...b, speed: Math.round(b.speed * mul) } };
      arr[key] = out;
    }
    return out;
  }

  /** run fn after `ms`, with a warning ring + sfx on the part now (telegraph >= 800 ms for big attacks) */
  telegraph(from: PartRT | string | null, ms: number, fn: () => void, scale = 1.6): void {
    const p = typeof from === "string" ? this.byName.get(from) : from;
    const x = p ? p.e.x : this.x;
    const y = p ? p.e.y : this.y;
    this.world.spawnFx("ring", x, y, { scale });
    this.world.spawnFx("spark", x, y, { scale: 1.2 });
    this.world.playSfx("warning", { volume: 0.6 });
    this.after(ms, () => {
      if (this.defeated) return;
      if (p && (p.dead || !p.e.alive)) return;
      fn();
    });
  }

  after(ms: number, fn: () => void): void {
    this.later.push({ at: this.t + ms / 1000, fn });
  }

  /** hazard helper (enemy damage) */
  blast(x: number, y: number, radius: number, telegraphMs: number, damage: number, color: [number, number, number] = [255, 80, 50]): void {
    this.world.spawnHazard({ x, y, radius, telegraphMs, damage, damageClass: "enemy", color, blastFx: "explosion_m" });
  }

  /** spawn helper units (adds) near the boss */
  summon(defId: string, x: number, y: number, opts?: Parameters<WorldAPI["spawnEnemy"]>[3]): Enemy | null {
    return this.world.spawnEnemy(defId, x, y, opts);
  }

  private cancelAll(): void {
    for (const r of this.running) r.inst.cancel();
    this.running.length = 0;
    this.later.length = 0;
  }

  // ================================================================== controller API
  get done(): boolean {
    return this.doneFlag;
  }

  hud(): BossHudInfo {
    const h = this.hudInfo;
    h.name = this.displayName;
    let hp = 0;
    for (const p of this.parts) if (!p.scenery && !p.dead && p.e.alive) hp += Math.max(0, p.e.hp);
    h.hp = this.defeated ? 0 : hp;
    h.maxHp = Math.max(1, this.initialTotal);
    h.phase = this.phase;
    h.phases = this.phases;
    h.escalation = this.escalation;
    h.gatedSec = this.gatedSec;
    return h;
  }

  onPartDestroyed(partName: string, world: WorldAPI): void {
    const p = this.byName.get(partName);
    if (!p || p.dead) return;
    p.dead = true;
    for (const r of this.running) if (r.part === p) r.inst.cancel();
    if (this.defeated) return;
    world.shake(5, 300);
    world.spawnFx("explosion_l", p.e.x, p.e.y, { scale: 1 });
    world.spawnFx("debris", p.e.x, p.e.y);
    if (p.core) {
      this.beginDefeat();
      return;
    }
    // reward for stripping weapons
    if (world.rng() < 0.5) world.spawnPickup(world.rng() < 0.5 ? "coin" : "bomb", p.e.x, p.e.y);
    this.onPartLost(p);
  }

  /** subclass hook: a non-core part died (change attack set, movement...) */
  protected onPartLost(_p: PartRT): void {}
  /** subclass hook: per-step movement of the anchor after entry */
  protected abstract move(dt: number): void;
  /** subclass hook: called once when a new phase starts (2 or 3) */
  protected onPhase(_phase: number): void {}

  update(dt: number, world: WorldAPI): void {
    this.world = world;
    this.t += dt;
    if (this.doneFlag) {
      // Engine normally completes the chapter as soon as `done` is set; never soft-lock if it does not.
      this.doneT += dt;
      if (this.doneT > 0.6) world.completeChapter();
      return;
    }
    if (this.defeated) {
      this.updateDefeat(dt);
      return;
    }

    // ---- entry
    if (this.entering) {
      if (this.pending.length) {
        const list = this.pending.splice(0);
        for (const q of list) this.addPart(q.kind, q.name, q.ox, q.oy, q.core);
        // give up on parts that still cannot spawn after a few seconds
        if (this.t > this.entrySec + 4) this.pending.length = 0;
        else if (this.t >= this.entrySec - SIM_STEP) {
          this.placeParts();
          return; // hold the entry until the rig is complete
        }
      }
      const k = Math.min(1, this.t / this.entrySec);
      const ease = 1 - (1 - k) * (1 - k);
      this.x = this.holdX;
      this.y = -320 + (this.holdY + 320) * ease;
      this.placeParts();
      if (k >= 1) {
        this.entering = false;
        this.phaseT = 0;
        for (const p of this.parts) if (!p.scenery) p.e.invuln = false;
        this.applyShield();
        this.breatherUntil = this.t + 0.8;
      }
      return;
    }

    this.phaseT += dt;
    this.phaseSec[this.phase - 1] = this.phaseT;
    this.move(dt);
    this.placeParts();

    // ---- phase from HP, gated by the minimum phase length (one phase at a time)
    const frac = this.hud().hp / Math.max(1, this.initialTotal);
    let want = frac <= BOSS_TUNING.phaseAt[1] ? 3 : frac <= BOSS_TUNING.phaseAt[0] ? 2 : 1;
    // a player focusing the core moves the fight on instead of stalling against its floor
    const c0 = this.core;
    if (c0 && !c0.dead && c0.e.hp <= c0.maxHp * BOSS_TUNING.coreFloor && this.phase < this.phases) want = Math.max(want, this.phase + 1);
    const early = this.phaseT < BOSS_TUNING.minPhaseSec;
    if (want > this.phase && !early) this.setPhase(this.phase + 1);
    this.gateHold = want > this.phase && early;
    if (this.gateHold) this.gatedSec[this.phase - 1] += dt;
    this.applyShield();
    this.updateEscalation(dt);
    if (this.phaseT > BOSS_TUNING.maxPhaseSec && !this.gateHold) this.drain(dt);
    // hardened / shielded parts pulse so the player reads "not yet"
    this.shieldFxT -= dt;
    if (this.shieldFxT <= 0) {
      this.shieldFxT = 0.8;
      if (this.gateHold) world.spawnFx("ring", this.x, this.y, { scale: 2.6 });
      const c = this.core;
      if (c && !c.dead && c.e.invuln) world.spawnFx("ring", c.e.x, c.e.y, { scale: 1.4 });
    }

    // ---- deferred actions (telegraphed attacks)
    if (this.later.length) {
      for (let i = 0; i < this.later.length; i++) {
        const l = this.later[i]!;
        if (l.at <= this.t) {
          this.later.splice(i--, 1);
          l.fn();
        }
      }
    }

    // ---- running patterns
    for (let i = this.running.length - 1; i >= 0; i--) {
      const r = this.running[i]!;
      if (r.part && (r.part.dead || !r.part.e.alive)) r.inst.cancel();
      if (!r.inst.done) r.inst.update(dt);
      if (r.inst.done) this.running.splice(i, 1);
    }

    // ---- move scheduler
    if (this.t >= this.breatherUntil) this.schedule();

    // ---- bomb resupply while ground-only parts remain
    this.bombT += dt;
    if (this.bombT >= BOSS_TUNING.bombDropEvery) {
      this.bombT = 0;
      if (this.needsBombs() && world.player.bombs < 3) world.spawnPickup("bomb", 60 + world.rng() * (GAME_W - 120), -10);
    }

    // fallback: everything destroyable is gone but no core flagged
    if (!this.core && this.pending.length === 0 && this.hud().hp <= 0) this.beginDefeat();
  }

  private needsBombs(): boolean {
    for (const p of this.parts) if (!p.scenery && !p.dead && p.e.alive && p.e.def.vulnerableTo === "ground") return true;
    return false;
  }

  private schedule(): void {
    for (const m of this.moves) {
      if (!m.phases.includes(this.phase)) continue;
      if (m.needs && !m.needs.some((n) => this.alive(n))) continue;
      const key = m.id;
      let next = this.nextUse.get(key);
      if (next === undefined) {
        next = this.t + (m.first ?? m.cd * 0.5);
        this.nextUse.set(key, next);
      }
      if (this.t < next) continue;
      if (m.big && this.t < this.bigUntil) continue;
      // phase factor x escalation (B2) / THREAT move rate
      const speed = ((this.phase === 3 ? 0.8 : this.phase === 2 ? 0.9 : 1) * (1 - BOSS_TUNING.escalateCd * this.escalation)) / (1 + BOSS_TUNING.threatMoveRate * this.threat);
      this.nextUse.set(key, this.t + m.cd * speed);
      if (m.big) this.bigUntil = this.t + m.big;
      try {
        m.fire(this);
      } catch (err) {
        console.error(`[bosses] move ${this.bossId}.${m.id}`, err);
      }
    }
  }

  /**
   * Per-step invulnerability of every live part:
   *  - gate hold (phase threshold reached before minPhaseSec): the whole rig;
   *  - core: shielded in phase 1 (or while a subclass keeps it shielded), and hardened at `coreFloor` of its HP until
   *    the final phase has run minPhaseSec (the defeat can never skip the final phase).
   */
  /** phase-1 core shield anti-stall timer (s); per-boss override (round 6, QA R5-3: the gunship uses a shorter one) */
  protected shieldTimeout: number = BOSS_TUNING.shieldTimeout;

  private applyShield(): void {
    const c = this.core;
    const T = BOSS_TUNING;
    let coreInv = false;
    if (c && !c.dead && c.e.alive) {
      const shielded = (this.phase === 1 && this.phaseT < this.shieldTimeout) || this.coreShieldExtra();
      if (shielded !== this.coreShielded) {
        this.coreShielded = shielded;
        if (!shielded) {
          this.world.events.emit("banner", { text: tr("bossBanner.coreExposed", "CORE EXPOSED"), subtext: tr("bossBanner.coreExposed.sub", "HIT THE WEAK POINT"), ms: 1800 });
          this.world.spawnFx("ring", c.e.x, c.e.y, { scale: 2.5 });
          this.world.playSfx("shield_hit");
        }
      }
      const low = c.e.hp <= c.maxHp * T.coreFloor;
      coreInv = shielded || (low && this.phaseT < T.minPhaseSec);
    }
    for (const p of this.parts) {
      if (p.scenery || p.dead || !p.e.alive) continue;
      p.e.invuln = this.gateHold || (p === c && coreInv);
    }
  }
  /**
   * Anti-stall (QA #3: ice dreadnought wide P3 ran 76-84 s at low weapon power): after maxPhaseSec in one phase the
   * rig's armour cracks and every exposed part bleeds drainPerSec of its max HP per second. Parts never die from it
   * (floor 1 HP; the core stops at coreFloor before the final phase, which moves the fight on), so the player still
   * lands every kill and its score.
   */
  private drain(dt: number): void {
    if (!this.drainNotified) {
      this.drainNotified = true;
      this.world.events.emit("banner", { text: tr("bossBanner.armourCracking", "ARMOUR CRACKING"), subtext: tr("bossBanner.armourCracking.sub", "FINISH IT"), ms: 1600 });
    }
    const c = this.core;
    const k = BOSS_TUNING.drainPerSec * dt;
    for (const p of this.parts) {
      if (p.scenery || p.dead || !p.e.alive || p.e.invuln) continue;
      const floor = p === c && this.phase < this.phases ? p.maxHp * BOSS_TUNING.coreFloor * 0.98 : 1;
      if (p.e.hp > floor) p.e.hp = Math.max(floor, p.e.hp - p.maxHp * k);
    }
  }
  private drainNotified = false;

  /**
   * B2 soft timer: past softSec[phase-1] the boss escalates one stage, then one more every escalateEvery s (max 3).
   * Not while the rig is gate-held (the player cannot hurt it then). ENRAGED III adds a punish burst from the core
   * every punishEvery s (framework-wide, not per boss).
   */
  private updateEscalation(dt: number): void {
    const T = BOSS_TUNING;
    const soft = T.softSec[this.phase - 1] ?? T.softSec[T.softSec.length - 1]!;
    const esc = this.phaseT < soft ? 0 : Math.min(T.escalateMax, 1 + Math.floor((this.phaseT - soft) / T.escalateEvery));
    if (esc > this.escalation && !this.gateHold) {
      this.escalation = esc;
      const text = esc === 1 ? tr("bossBanner.enraged1", "BOSS ENRAGED") : esc === 2 ? tr("bossBanner.enraged2", "ENRAGED II") : tr("bossBanner.enraged3", "ENRAGED III");
      this.world.events.emit("banner", { text, ms: 1200 });
      this.world.playSfx("warning");
      this.punishT = 0.8;
    }
    if (this.escalation >= 3 && this.t >= this.breatherUntil) {
      this.punishT -= dt;
      if (this.punishT <= 0) {
        this.punishT = T.punishEvery;
        const c = this.core;
        this.fire(BP.burst3, c && !c.dead && c.e.alive ? c : null);
      }
    }
  }
  private coreShielded = true;
  /** phase threshold reached before the phase ran its minimum: the rig is hardened */
  private gateHold = false;

  private setPhase(p: number): void {
    this.phase = p;
    this.phaseT = 0;
    this.escalation = 0;
    this.cancelAll();
    this.nextUse.clear();
    this.bigUntil = 0;
    this.breatherUntil = this.t + BOSS_TUNING.phaseBreather;
    const w = this.world;
    w.events.emit("bossPhase", { bossId: this.bossId, phase: p });
    w.clearEnemyBullets(-1);
    w.shake(7, 450);
    w.flash([255, 255, 255], 220);
    w.spawnPickup(p === 2 ? "power" : "shield", this.x, this.y + 60);
    this.onPhase(p);
  }

  // ================================================================== defeat
  private beginDefeat(): void {
    if (this.defeated) return;
    this.defeated = true;
    this.defeatT = 0;
    this.cancelAll();
    const w = this.world;
    w.clearEnemyBullets(-1);
    w.events.emit("bossDefeated", { bossId: this.bossId });
    w.flash([255, 240, 200], 500);
    w.shake(10, 900);
    w.playSfx("explode_l");
    for (let i = 0; i < 10; i++) w.spawnPickup("coin", this.x + (w.rng() - 0.5) * 120, this.y + (w.rng() - 0.5) * 80);
    w.spawnPickup("repair", this.x, this.y);
  }

  private chainT = 0;
  private updateDefeat(dt: number): void {
    const w = this.world;
    this.defeatT += dt;
    this.chainT -= dt;
    // the wreck sinks / drifts
    this.y += 14 * dt;
    this.placeParts();
    if (this.chainT <= 0) {
      this.chainT = 0.12;
      const live = this.parts.filter((p) => !p.dead && p.e.alive);
      const src = live.length ? live[Math.floor(w.rng() * live.length)]!.e : null;
      const x = (src ? src.x : this.x) + (w.rng() - 0.5) * 70;
      const y = (src ? src.y : this.y) + (w.rng() - 0.5) * 70;
      w.spawnFx(w.rng() < 0.35 ? "explosion_l" : "explosion_m", x, y);
      w.playSfx(w.rng() < 0.5 ? "explode_m" : "explode_l", { volume: 0.8 });
      w.shake(5, 150);
      // knock out remaining weapon parts one by one (no score)
      const weapon = live.find((p) => !p.scenery && !p.core);
      if (weapon && w.rng() < 0.4) w.killEnemy(weapon.e, false);
    }
    if (this.defeatT >= BOSS_TUNING.defeatSec) {
      for (const p of this.parts) if (!p.dead && p.e.alive) w.killEnemy(p.e, false);
      w.spawnFx("explosion_l", this.x, this.y, { scale: 2.2 });
      w.spawnFx("ring", this.x, this.y, { scale: 4 });
      w.playSfx("explode_l");
      this.doneFlag = true;
    }
  }
}

/** escalated / THREAT-scaled copies of boss patterns: index = escalation * 4 + threat */
const SCALED = new WeakMap<PatternDef, PatternDef[]>();

/** pickup kinds helper for subclasses */
export const PK = (k: PickupKind) => k;
