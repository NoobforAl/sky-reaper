/**
 * DEV ONLY - built-in demo content used when src/enemies or src/levels are still stubs.
 * Lets the engine be tested end-to-end (collisions, vulnerability, pickups, missiles, boss flow) on its own.
 * Nothing here ships as gameplay once the real Enemy/Level modules land (core/index.ts prefers them).
 */
import {
  GAME_H,
  GAME_W,
  type BossController,
  type BossFactory,
  type BulletSpawn,
  type BulletVisual,
  type ChapterDef,
  type EnemyDef,
  type EnemySystem,
  type LevelRunner,
  type WorldAPI,
} from "../contracts";
import type { Enemy } from "../contracts";

const vis = (sprite: string, color: [number, number, number], radius: number): BulletVisual => ({ sprite, color, radius });
const V_ORB = vis("ebullet_orb", [255, 90, 160], 5);
const V_SMALL = vis("ebullet_small", [255, 230, 90], 3.5);
const V_MISSILE = vis("ebullet_missile", [255, 150, 60], 5);

const base = {
  contactDamage: 20,
  drops: [] as EnemyDef["drops"],
  attacks: [] as EnemyDef["attacks"],
  anchored: true,
};

export const DEMO_DEFS: Record<string, EnemyDef> = {
  demo_fighter: { ...base, id: "demo_fighter", name: "Fighter (DEV)", layer: "air", vulnerableTo: "air", hp: 8, score: 100, size: [20, 20], color: [210, 70, 70], movement: { kind: "sine", speed: 95, amp: 60, freq: 0.5 }, explosion: "s", drops: [{ kind: "coin", chance: 0.5 }] },
  demo_heavy: { ...base, id: "demo_heavy", name: "Heavy (DEV)", layer: "air", vulnerableTo: "air", hp: 70, score: 400, size: [32, 32], armor: 1, color: [150, 60, 170], movement: { kind: "straight", speed: 50 }, explosion: "m", drops: [{ kind: "power", chance: 0.6 }, { kind: "coin", chance: 1, min: 3, max: 5 }] },
  demo_drone: { ...base, id: "demo_drone", name: "Kamikaze (DEV)", layer: "air", vulnerableTo: "air", hp: 4, score: 80, size: [12, 12], contactDamage: 25, color: [255, 160, 40], movement: { kind: "dive", speed: 120 }, explosion: "s", tags: ["kamikaze"] },
  demo_tank: { ...base, id: "demo_tank", name: "Tank (DEV)", layer: "ground", vulnerableTo: "ground", hp: 30, score: 200, size: [16, 16], color: [90, 130, 70], movement: { kind: "stationary", speed: 0 }, explosion: "m", tags: ["vehicle"], drops: [{ kind: "coin", chance: 1, min: 2, max: 3 }, { kind: "bomb", chance: 0.3 }] },
  demo_aa: { ...base, id: "demo_aa", name: "AA Turret (DEV)", layer: "ground", vulnerableTo: "both", hp: 16, score: 150, size: [16, 16], color: [200, 190, 60], movement: { kind: "stationary", speed: 0 }, explosion: "s", tags: ["aa"], drops: [{ kind: "coin", chance: 0.7 }] },
  demo_launcher: { ...base, id: "demo_launcher", name: "Missile Launcher (DEV)", layer: "ground", vulnerableTo: "ground", hp: 35, score: 300, size: [20, 20], color: [220, 120, 50], movement: { kind: "stationary", speed: 0 }, explosion: "m", tags: ["launcher"], drops: [{ kind: "shield", chance: 0.5 }] },
  demo_base: { ...base, id: "demo_base", name: "Base (DEV)", layer: "ground", vulnerableTo: "ground", hp: 140, score: 800, size: [48, 48], color: [120, 120, 130], movement: { kind: "stationary", speed: 0 }, explosion: "l", tags: ["structure"], drops: [{ kind: "coin", chance: 1, min: 6, max: 8 }, { kind: "repair", chance: 1 }] },
  demo_boss: { ...base, id: "demo_boss", name: "DEV BOSS", layer: "air", vulnerableTo: "air", hp: 520, score: 5000, size: [48, 40], hitbox: [96, 70], color: [90, 90, 200], movement: { kind: "scripted", speed: 0 }, explosion: "l", contactDamage: 30 },
};

function aimedAt(w: WorldAPI, e: Enemy, speed: number, spreadDeg: number, n: number, v: BulletVisual, dmg = 10): void {
  const p = w.player;
  const a = (Math.atan2(p.y - e.y, p.x - e.x) * 180) / Math.PI;
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spreadDeg;
    const s: BulletSpawn = { x: e.x, y: e.y + 6, damageClass: "enemy", damage: dmg, speed, angle: a + off, visual: v };
    w.spawnBullet(s);
  }
}

function ring(w: WorldAPI, e: Enemy, n: number, speed: number, rot: number, v: BulletVisual): void {
  for (let i = 0; i < n; i++) w.spawnBullet({ x: e.x, y: e.y, damageClass: "enemy", damage: 10, speed, angle: rot + (i * 360) / n, visual: v });
}

export const demoEnemySystem: EnemySystem = {
  defs: DEMO_DEFS,
  onSpawn(e) {
    e.data.x0 = e.x;
    e.data.fireT = 0.6 + (e.id % 5) * 0.2;
  },
  update(e, dt, w) {
    const d = e.data as { x0: number; fireT: number };
    const id = e.def.id;
    const p = w.player;
    switch (id) {
      case "demo_fighter": {
        e.y += 95 * dt;
        e.x = d.x0 + Math.sin(e.t * 3) * 60;
        d.fireT -= dt;
        if (d.fireT <= 0 && e.onScreen && e.y < 500) {
          d.fireT = 1.6;
          aimedAt(w, e, 190, 0, 1, V_SMALL, 8);
        }
        break;
      }
      case "demo_heavy": {
        e.y += 45 * dt;
        d.fireT -= dt;
        if (d.fireT <= 0 && e.onScreen) {
          d.fireT = 2.2;
          aimedAt(w, e, 170, 50, 5, V_ORB, 10);
        }
        break;
      }
      case "demo_drone": {
        if (e.t < 0.8) e.y += 80 * dt;
        else {
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          const cur = Math.atan2(e.vy || 1, e.vx);
          let da = a - cur;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          const na = cur + Math.max(-3 * dt, Math.min(3 * dt, da));
          e.vx = Math.cos(na) * 260;
          e.vy = Math.sin(na) * 260;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
        }
        break;
      }
      case "demo_tank":
      case "demo_aa":
      case "demo_base":
      case "demo_launcher": {
        e.facing = (Math.atan2(p.y - e.y, p.x - e.x) * 180) / Math.PI;
        d.fireT -= dt;
        if (d.fireT <= 0 && e.onScreen && e.y > 20 && e.y < 600) {
          if (id === "demo_tank") {
            d.fireT = 2;
            aimedAt(w, e, 170, 0, 1, V_ORB, 10);
          } else if (id === "demo_aa") {
            d.fireT = 0.9;
            aimedAt(w, e, 210, 24, 3, V_SMALL, 6);
          } else if (id === "demo_base") {
            d.fireT = 3;
            ring(w, e, 10, 120, e.t * 40, V_ORB);
          } else {
            d.fireT = 5;
            w.spawnBullet({
              x: e.x,
              y: e.y,
              damageClass: "enemy",
              damage: 25,
              speed: 130,
              angle: -90,
              motion: "homing",
              turnRate: 80,
              armDelay: 0.5,
              life: 6,
              decoyable: true,
              isMissile: true,
              blastRadius: 34,
              visual: { ...V_MISSILE, trail: "fx_trail", trailEveryMs: 60 },
            });
          }
        }
        break;
      }
      default:
        break;
    }
  },
  onDeath() {},
};

export const DEMO_CHAPTER: ChapterDef = {
  id: "pacific",
  index: 0,
  name: "DEV DEMO",
  subtitle: "Built-in test wave",
  briefing: "Engine self-test content. Real chapters not loaded.",
  biome: "ocean",
  music: "pacific",
  scrollSpeed: 70,
  palette: { bg: "#0b2a4a", mid: "#14497a", accent: "#ffcc33", fg: "#ffffff" },
  events: [],
  boss: "demo_boss",
  objectives: [
    { id: "d1", text: "Destroy 5 vehicles", stat: "tag:vehicle", goal: 3, cmp: "gte", reward: 50 },
    { id: "d2", text: "Take less than 100 damage", stat: "damageTaken", goal: 100, cmp: "lte", reward: 50 },
    { id: "d3", text: "Defeat the boss", stat: "bossDefeated", goal: 1, cmp: "gte", reward: 100 },
  ],
  reward: 200,
  medalScores: [3000, 6000, 9000, 12000],
};

type Ev = { t: number; run: (w: WorldAPI) => void };

function line(t: number, id: string, n: number, y: number, x0 = 80, dx = 90): Ev[] {
  const out: Ev[] = [];
  for (let i = 0; i < n; i++) out.push({ t: t + i * 0.25, run: (w) => void w.spawnEnemy(id, x0 + i * dx, y) });
  return out;
}

/** demo id -> real roster id (when the real Enemy module is present but levels are not) */
const REAL_MAP: Record<string, string> = {
  demo_fighter: "fighter_basic",
  demo_heavy: "fighter_heavy",
  demo_drone: "drone_kamikaze",
  demo_tank: "tank_light",
  demo_aa: "aa_turret",
  demo_launcher: "missile_launcher",
  demo_base: "military_base",
};

/** real enemy system + demo boss/defs (used while src/levels is a stub) */
export function composeEnemySystem(real: EnemySystem): EnemySystem {
  if (Object.keys(real.defs).length === 0) return demoEnemySystem;
  const isDemo = (e: Enemy) => e.def.id in DEMO_DEFS;
  return {
    defs: { ...real.defs, ...DEMO_DEFS },
    onSpawn: (e, w) => (isDemo(e) ? demoEnemySystem.onSpawn(e, w) : real.onSpawn(e, w)),
    update: (e, dt, w) => (isDemo(e) ? demoEnemySystem.update(e, dt, w) : real.update(e, dt, w)),
    onHit: (e, d, w) => (isDemo(e) ? undefined : real.onHit?.(e, d, w)),
    onDeath: (e, w) => (isDemo(e) ? undefined : real.onDeath(e, w)),
  };
}

export function createDemoRunner(useReal = false): LevelRunner {
  const wrapW = (w: WorldAPI): WorldAPI =>
    useReal
      ? (new Proxy(w, {
          get(t, k) {
            if (k === "spawnEnemy") return (id: string, x: number, y: number, o?: never) => t.spawnEnemy(REAL_MAP[id] ?? id, x, y, o);
            const v = (t as never)[k as never] as unknown;
            return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
          },
        }) as WorldAPI)
      : w;
  const evs: Ev[] = [
    { t: 0.5, run: (w) => w.events.emit("banner", { text: "DEV DEMO", subtext: "engine self-test", ms: 2200 }) },
    ...line(1, "demo_fighter", 4, -30, 90, 100),
    { t: 2, run: (w) => void w.spawnEnemy("demo_tank", 130, -30) },
    { t: 2.5, run: (w) => void w.spawnEnemy("demo_aa", 360, -30) },
    { t: 3.5, run: (w) => void w.spawnEnemy("demo_tank", 250, -30) },
    { t: 5, run: (w) => void w.spawnEnemy("demo_heavy", 240, -40) },
    { t: 6, run: (w) => void w.spawnEnemy("demo_launcher", 100, -30) },
    { t: 6.5, run: (w) => void w.spawnEnemy("demo_launcher", 380, -30) },
    ...line(8, "demo_drone", 5, -20, 60, 90),
    { t: 10, run: (w) => void w.spawnEnemy("demo_base", 240, -50) },
    { t: 11, run: (w) => w.spawnPickup("power", 240, 60) },
    { t: 12, run: (w) => w.spawnPickup("bomb", 120, 60) },
    ...line(13, "demo_fighter", 6, -30, 60, 72),
    { t: 15, run: (w) => void w.spawnEnemy("demo_heavy", 160, -40) },
    { t: 15.5, run: (w) => void w.spawnEnemy("demo_heavy", 320, -40) },
    { t: 19, run: (w) => w.startBoss("demo_boss") },
  ];
  let idx = 0;
  let time = 0;
  const bgTile = (k: import("kaplay").KAPLAYCtx, scrollY: number) => {
    const s = 64;
    const off = scrollY % s;
    k.drawRect({ width: GAME_W, height: GAME_H, color: k.rgb(11, 42, 74) });
    for (let gy = -1; gy < GAME_H / s + 1; gy++) {
      for (let gx = 0; gx < GAME_W / s + 1; gx++) {
        if ((gx + gy + Math.floor(scrollY / s)) % 2 === 0) continue;
        k.drawRect({ pos: k.vec2(gx * s, gy * s + off), width: s, height: s, color: k.rgb(14, 52, 90) });
      }
    }
  };
  return {
    chapter: DEMO_CHAPTER,
    background: {
      drawBack(k, scrollY) {
        bgTile(k, scrollY);
      },
      drawFront() {},
    },
    get progress() {
      return Math.min(1, time / 19);
    },
    hint: null,
    update(dt, w) {
      time += dt;
      while (idx < evs.length && evs[idx]!.t <= time) evs[idx++]!.run(wrapW(w));
    },
  };
}

export const demoBosses: BossFactory = {
  ids: ["demo_boss"],
  create(_id, w): BossController {
    const boss = w.spawnEnemy("demo_boss", GAME_W / 2, -80, { bossId: "demo_boss" })!;
    let phase = 0;
    let t = 0;
    let fire = 1.5;
    return {
      bossId: "demo_boss",
      get done() {
        return !boss.alive;
      },
      update(dt) {
        if (!boss.alive) return;
        t += dt;
        boss.y += (150 - boss.y) * Math.min(1, dt * 1.5);
        boss.x = GAME_W / 2 + Math.sin(t * 0.8) * 130;
        const f = boss.hp / boss.maxHp;
        const np = f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
        if (np !== phase) {
          phase = np;
          w.events.emit("bossPhase", { bossId: "demo_boss", phase });
        }
        fire -= dt;
        if (fire <= 0) {
          fire = phase === 0 ? 1.4 : phase === 1 ? 1 : 0.7;
          ring(w, boss, 12 + phase * 4, 130 + phase * 20, t * 30, V_ORB);
          aimedAt(w, boss, 200, 40, 3 + phase * 2, V_SMALL, 8);
        }
      },
      hud() {
        return { name: "DEV BOSS", hp: Math.max(0, boss.hp), maxHp: boss.maxHp, phase: phase + 1, phases: 3 };
      },
    };
  },
};
