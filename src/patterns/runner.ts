/**
 * Data-driven pattern runner.
 *
 * Angle convention (documented in docs/ENEMY_NOTES.md):
 *   final heading = base + (bullet.angle - 90) + angleOffset + per-kind offsets
 *   base = aim "player"/"lead" -> angle from muzzle to (predicted) player
 *          aim "none"          -> owner.facing (default 90 = down)
 *   So `bullet.angle: 90` means "forward", -90 means "backwards".
 *
 * Owner position/facing are read live at every volley (and every bullet in it).
 */
import type { BulletSpawn, PatternDef, PatternInstance, PatternOwner, PatternRunner, WorldAPI, SfxId, FxKind } from "../contracts";

/** Fairness caps (ARCHITECTURE 3.4). */
export const MAX_BULLET_SPEED = 260;
export const MAX_AIMED_SINGLE_SPEED = 340;
export const MAX_MISSILE_TURN = 110;
export const MIN_MISSILE_ARM = 0.5;
export const MAX_MISSILE_LIFE = 6;

/** see shoot(): the Engine emits missileLaunched itself */
export let EMIT_MISSILE_EVENTS = false;
export function setEmitMissileEvents(v: boolean): void {
  EMIT_MISSILE_EVENTS = v;
}

let missileSeq = 1;
/** next id for the missileLaunched event (exported for tests) */
export function nextMissileId(): number {
  return missileSeq++;
}

const DEG = Math.PI / 180;
const angTo = (x0: number, y0: number, x1: number, y1: number) => Math.atan2(y1 - y0, x1 - x0) / DEG;

/**
 * Difficulty speed scaling is applied by the Engine in spawnBullet (spdScale), so the runner uses 1.
 * Kept as a hook in case that changes.
 */
function speedMul(_world: WorldAPI): number {
  return 1;
}

function volleysOf(p: PatternDef): number {
  switch (p.kind) {
    case "spiral":
    case "burst":
    case "sweep":
    case "homing":
      return Math.max(1, p.shots ?? (p.kind === "homing" ? 1 : 3));
    case "areaStrike":
    case "delayedBlast":
      return Math.max(1, p.shots ?? 1);
    default:
      return Math.max(1, p.shots ?? 1);
  }
}

function defaultAim(p: PatternDef): "none" | "player" | "lead" {
  if (p.aim) return p.aim;
  switch (p.kind) {
    case "aimed":
    case "burst":
    case "sweep":
    case "homing":
    case "delayedBlast":
    case "areaStrike":
      return "player";
    default:
      return "none";
  }
}

class Instance implements PatternInstance {
  private tMs = 0;
  private nextVolleyMs: number;
  private volley = 0;
  private readonly volleys: number;
  private finished = false;
  private telegraphed = false;
  private lastSfxMs = -1000;
  private nextTeleFxMs = 0;
  private readonly sMul: number;

  constructor(
    private readonly p: PatternDef,
    private readonly owner: PatternOwner,
    private readonly world: WorldAPI,
  ) {
    this.volleys = volleysOf(p);
    this.nextVolleyMs = Math.max(0, p.telegraphMs ?? 0);
    // missiles always telegraph (>= 600ms) so the launch is readable
    if (p.kind === "homing") this.nextVolleyMs = Math.max(600, this.nextVolleyMs);
    this.sMul = speedMul(world);
  }

  get done(): boolean {
    return this.finished;
  }

  cancel(): void {
    this.finished = true;
  }

  update(dt: number): void {
    if (this.finished) return;
    if (!this.telegraphed) {
      this.telegraphed = true;
      if (this.nextVolleyMs > 0) this.startTelegraph();
    }
    this.tMs += dt * 1000;
    // charging glow during the telegraph
    if (this.volley === 0 && this.tMs < this.nextVolleyMs && this.tMs >= this.nextTeleFxMs) {
      this.nextTeleFxMs = this.tMs + 220;
      this.fx("spark", this.owner.x, this.owner.y + 6, 0.8);
    }
    // multiple volleys can fall in one step for very small gaps
    let guard = 0;
    while (!this.finished && this.tMs >= this.nextVolleyMs && guard++ < 8) {
      this.fireVolley(this.volley);
      this.volley++;
      if (this.volley >= this.volleys) {
        this.finished = true;
      } else {
        this.nextVolleyMs += Math.max(16, this.p.gapMs ?? 120);
      }
    }
  }

  // ------------------------------------------------------------------ helpers

  private fx(kind: FxKind, x: number, y: number, scale = 1) {
    try {
      this.world.spawnFx(kind, x, y, { scale });
    } catch {
      /* engine stub */
    }
  }

  private sfx(id: string, volume = 0.6) {
    // throttle rapid-fire patterns to avoid machine-gunning the mixer
    if (this.tMs - this.lastSfxMs < 80) return;
    this.lastSfxMs = this.tMs;
    try {
      this.world.playSfx(id as SfxId, { volume });
    } catch {
      /* ignore */
    }
  }

  private startTelegraph() {
    const o = this.owner;
    this.fx("ring", o.x, o.y, 1.2);
    if (this.nextVolleyMs >= 600) {
      try {
        this.world.playSfx("warning", { volume: 0.5 });
      } catch {
        /* ignore */
      }
    }
  }

  private muzzles(): Array<[number, number]> {
    return this.p.muzzles && this.p.muzzles.length ? this.p.muzzles : [[0, 0]];
  }

  /** player target point; "lead" predicts with player velocity */
  private target(mx: number, my: number, speed: number, aim: "none" | "player" | "lead"): [number, number] {
    const pl = this.world.player;
    if (!pl) return [mx, my + 100];
    if (aim !== "lead") return [pl.x, pl.y];
    const vx = pl.vx || 0;
    const vy = pl.vy || 0;
    let tx = pl.x;
    let ty = pl.y;
    for (let i = 0; i < 2; i++) {
      const t = Math.min(1.0, Math.hypot(tx - mx, ty - my) / Math.max(1, speed));
      tx = pl.x + vx * t;
      ty = pl.y + vy * t;
    }
    return [tx, ty];
  }

  private baseAngle(mx: number, my: number, speed: number): number {
    const aim = defaultAim(this.p);
    let base: number;
    if (aim === "none") base = this.owner.facing ?? 90;
    else {
      const [tx, ty] = this.target(mx, my, speed, aim);
      base = angTo(mx, my, tx, ty);
    }
    return base + ((this.p.bullet.angle ?? 90) - 90) + (this.p.angleOffset ?? 0);
  }

  private capSpeed(speed: number, aimedSingle: boolean, missile: boolean): number {
    const cap = missile ? MAX_BULLET_SPEED : aimedSingle ? MAX_AIMED_SINGLE_SPEED : MAX_BULLET_SPEED;
    return Math.max(10, Math.min(cap, speed));
  }

  private shoot(x: number, y: number, angle: number, idx: number, aimedSingle: boolean) {
    const b = this.p.bullet;
    const missile = !!b.isMissile || this.p.kind === "homing";
    let speed = b.speed * this.sMul * (1 + (this.p.speedStep ?? 0) * idx);
    speed = this.capSpeed(speed, aimedSingle, missile);
    const spec: BulletSpawn = {
      ...b,
      damageClass: "enemy",
      x,
      y,
      angle,
      speed,
      ownerId: this.owner.id,
      visual: b.visual,
    };
    if (missile) {
      spec.motion = "homing";
      spec.isMissile = true;
      spec.decoyable = b.decoyable ?? true;
      spec.turnRate = Math.min(MAX_MISSILE_TURN, b.turnRate ?? 80);
      spec.armDelay = Math.max(MIN_MISSILE_ARM, b.armDelay ?? MIN_MISSILE_ARM);
      spec.life = Math.min(MAX_MISSILE_LIFE, b.life ?? 5);
      spec.blastRadius = b.blastRadius ?? 22;
      spec.hp = b.hp ?? 2;
      // NOTE: the Engine's spawnBullet emits `missileLaunched` (with the bullet id, matching missileLock)
      // and plays missile_launch + warning for every isMissile bullet, so the runner does not emit it
      // (emitting here too would double the HUD warning). Set EMIT_MISSILE_EVENTS if that changes.
      if (EMIT_MISSILE_EVENTS) {
        try {
          this.world.events.emit("missileLaunched", { x, y, id: nextMissileId() });
        } catch {
          /* ignore */
        }
      }
    }
    this.world.spawnBullet(spec);
  }

  /** fan of `count` bullets across `spread` deg centred on `center` */
  private fan(x: number, y: number, center: number, count: number, spread: number, aimedSingle = false) {
    const n = Math.max(1, count);
    if (n === 1) {
      this.shoot(x, y, center, 0, aimedSingle);
      return;
    }
    // a zero spread with several bullets would stack them invisibly: use a minimum 12 deg fan
    if (spread <= 0) spread = 12 * (n - 1);
    const step = spread / (n - 1);
    const start = center - spread / 2;
    for (let i = 0; i < n; i++) this.shoot(x, y, start + step * i, i, false);
  }

  private fireVolley(v: number) {
    const p = this.p;
    const o = this.owner;
    const sfx = p.sfx;
    let fired = false;

    for (const [dx, dy] of this.muzzles()) {
      const mx = o.x + dx;
      const my = o.y + dy;
      const count = p.count ?? 1;
      switch (p.kind) {
        case "straight": {
          // parallel line of `count` bullets, perpendicular spacing >= 28 (fairness)
          const a = this.baseAngle(mx, my, p.bullet.speed);
          const n = Math.max(1, count);
          const gap = Math.max(28, p.blastSpacing ?? 30);
          const px = -Math.sin(a * DEG);
          const py = Math.cos(a * DEG);
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * gap;
            this.shoot(mx + px * off, my + py * off, a, 0, false);
          }
          fired = true;
          break;
        }
        case "aimed":
        case "spread": {
          const a = this.baseAngle(mx, my, p.bullet.speed);
          const spread = p.spreadDeg ?? (p.kind === "spread" ? 60 : 0);
          if (spread === 0 && count > 1) {
            // stacked column: speedStep differentiates, or slight stagger
            for (let i = 0; i < count; i++) this.shoot(mx, my, a, p.speedStep ? i : 0, false);
          } else this.fan(mx, my, a, count, spread, p.kind === "aimed" && count === 1);
          fired = true;
          break;
        }
        case "circular": {
          const n = Math.max(1, count || 12);
          const a = this.baseAngle(mx, my, p.bullet.speed);
          for (let i = 0; i < n; i++) this.shoot(mx, my, a + (360 / n) * i, 0, false);
          fired = true;
          break;
        }
        case "spiral": {
          const n = Math.max(1, count);
          const a = this.baseAngle(mx, my, p.bullet.speed) + (p.rotationDeg ?? 12) * v;
          for (let i = 0; i < n; i++) this.shoot(mx, my, a + (360 / n) * i, 0, false);
          fired = true;
          break;
        }
        case "burst": {
          const a = this.baseAngle(mx, my, p.bullet.speed);
          this.fan(mx, my, a, count, p.spreadDeg ?? 0, count === 1 && defaultAim(p) !== "none");
          fired = true;
          break;
        }
        case "multi": {
          const offs = p.offsets && p.offsets.length ? p.offsets : [0, 90, 180, 270];
          const a = this.baseAngle(mx, my, p.bullet.speed) + (p.rotationDeg ?? 0) * v;
          for (const off of offs) this.fan(mx, my, a + off, count, p.spreadDeg ?? 0);
          fired = true;
          break;
        }
        case "homing": {
          // launch roughly forward-ish then steer; fan the salvo
          const a = (o.facing ?? 90) + ((p.bullet.angle ?? 90) - 90) + (p.angleOffset ?? 0);
          this.fan(mx, my, a, count, p.spreadDeg ?? (count > 1 ? 50 : 0));
          fired = true;
          break;
        }
        case "delayedBlast": {
          const h = p.hazard;
          if (!h) break;
          const n = Math.max(1, count);
          const aim = defaultAim(p);
          const [tx, ty] = aim === "none" ? [mx, my + 140] : this.target(mx, my, 200, aim);
          const scatter = p.blastSpacing ?? (n > 1 ? h.radius * 1.6 : 0);
          for (let i = 0; i < n; i++) {
            let x = tx;
            let y = ty;
            if (i > 0 || n > 1) {
              const ang = (360 / n) * i + this.world.rngRange(-20, 20);
              const r = scatter * (i === 0 && n % 2 === 1 ? 0 : 1);
              x += Math.cos(ang * DEG) * r;
              y += Math.sin(ang * DEG) * r;
            }
            this.world.spawnHazard({ ...h, telegraphMs: Math.max(600, h.telegraphMs), x, y });
          }
          fired = true;
          break;
        }
        case "areaStrike": {
          const h = p.hazard;
          if (!h) break;
          const n = Math.max(1, p.blasts ?? 5);
          const spacing = p.blastSpacing ?? Math.max(40, h.radius * 1.5);
          const aim = defaultAim(p);
          let a = o.facing ?? 90;
          if (aim !== "none") {
            const [tx, ty] = this.target(mx, my, 200, aim);
            a = angTo(mx, my, tx, ty);
          }
          a += p.angleOffset ?? 0;
          const stepMs = p.gapMs ?? 160;
          const start = spacing * 0.8;
          for (let i = 0; i < n; i++) {
            const d = start + i * spacing;
            this.world.spawnHazard({
              ...h,
              x: mx + Math.cos(a * DEG) * d,
              y: my + Math.sin(a * DEG) * d,
              telegraphMs: Math.max(600, h.telegraphMs) + i * stepMs,
            });
          }
          fired = true;
          // areaStrike volleys are one-shot sequences; additional shots repeat after gap
          break;
        }
        case "sweep": {
          const a0 = this.baseAngle(mx, my, p.bullet.speed);
          const total = Math.max(1, this.volleys - 1);
          const spread = p.spreadDeg ?? 90;
          const a = a0 - spread / 2 + (spread * v) / total;
          this.fan(mx, my, a, count, 0);
          fired = true;
          break;
        }
      }
      if (fired && p.kind !== "delayedBlast" && p.kind !== "areaStrike") {
        this.fx("muzzle", mx, my, 1);
      }
    }
    if (fired) {
      if (sfx) this.sfx(sfx, p.kind === "homing" ? 0.7 : 0.45);
      else if (p.kind === "homing" && EMIT_MISSILE_EVENTS) this.sfx("missile_launch", 0.7);
    }
  }
}

export const patternRunner: PatternRunner = {
  start(pattern: PatternDef, owner: PatternOwner, world: WorldAPI): PatternInstance {
    return new Instance(pattern, owner, world);
  },
};
