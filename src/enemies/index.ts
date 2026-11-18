/**
 * Enemy system (Enemy/AI agent): defs + movement + attack scheduling + signature behaviours.
 *
 * Position ownership: `update()` integrates the unit's OWN motion into e.x/e.y (e.vx/e.vy mirror it,
 * informational). The Engine adds scroll for anchored ground units.
 */
import {
  GAME_H,
  GAME_W,
  type AttackDef,
  type Enemy,
  type EnemyDef,
  type EnemySystem,
  type PatternInstance,
  type PatternOwner,
  type WorldAPI,
} from "../contracts";
import { patternRunner, resolvePattern } from "../patterns";
import { ENEMY_DEFS, ENEMY_META } from "./defs";
import { stepMovement } from "./movement";

export { ENEMY_DEFS } from "./defs";

// ------------------------------------------------------------------------------------------ state

interface AttackState {
  def: AttackDef;
  /** seconds until the next start (counts only while eligible) */
  timer: number;
}

interface AIState {
  attacks: AttackState[];
  running: PatternInstance[];
  owner: PatternOwner;
  /** seconds visible on screen (own fallback when the engine doesn't track tOn) */
  vis: number;
  /** signature behaviour timers */
  sigT: number;
  launched: number;
  /** radar buff: world.time until which fire rate is boosted */
  buffUntil: number;
  /** shield-drone protection until world.time */
  shieldUntil: number;
  /** extra local rng-based jitter so formations don't fire in lockstep */
  jitter: number;
}

const RADAR_RADIUS = 220;
const RADAR_RATE = 1.35;
const SHIELD_RADIUS = 130;
const OIL_CHAIN_RADIUS = 90;
const OIL_CHAIN_DAMAGE = 40;

function ai(e: Enemy): AIState | undefined {
  return e.data.ai as AIState | undefined;
}

function makeOwner(e: Enemy): PatternOwner {
  return {
    get x() {
      return e.x;
    },
    get y() {
      return e.y;
    },
    get facing() {
      return e.facing ?? 90;
    },
    get id() {
      return e.id;
    },
    get layer() {
      return e.def.layer;
    },
  };
}

function onScreen(e: Enemy, minY = 0, maxY = GAME_H): boolean {
  return e.x >= -8 && e.x <= GAME_W + 8 && e.y >= minY && e.y <= maxY;
}

function difficulty(world: WorldAPI): number {
  const d = world.difficulty;
  return typeof d === "number" && isFinite(d) ? Math.max(0, Math.min(1.5, d)) : 1;
}

function hasTag(d: EnemyDef, t: string) {
  return !!d.tags && d.tags.includes(t);
}

function safeFx(world: WorldAPI, kind: Parameters<WorldAPI["spawnFx"]>[0], x: number, y: number, scale = 1) {
  try {
    world.spawnFx(kind, x, y, { scale });
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------------------------------ signature behaviours

function radarTick(e: Enemy, st: AIState, dt: number, world: WorldAPI) {
  if (!onScreen(e, -20, GAME_H + 20)) return;
  st.sigT -= dt;
  if (st.sigT <= 0) {
    st.sigT = 2;
    safeFx(world, "ring", e.x, e.y, 2.2);
  }
  const until = world.time + 0.25;
  for (const o of world.enemies) {
    if (o === e || !o.alive) continue;
    const s = ai(o);
    if (!s) continue;
    if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= RADAR_RADIUS * RADAR_RADIUS) s.buffUntil = until;
  }
}

function shieldTick(e: Enemy, st: AIState, dt: number, world: WorldAPI) {
  if (!onScreen(e, -20, GAME_H)) return;
  st.sigT -= dt;
  if (st.sigT <= 0) {
    st.sigT = 1.2;
    safeFx(world, "ring", e.x, e.y, SHIELD_RADIUS / 20);
  }
  const until = world.time + 0.25;
  for (const o of world.enemies) {
    if (o === e || !o.alive || o.def.id === "shield_drone") continue;
    const s = ai(o);
    if (!s) continue;
    if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= SHIELD_RADIUS * SHIELD_RADIUS) s.shieldUntil = until;
  }
}

function launcherTick(e: Enemy, st: AIState, dt: number, world: WorldAPI, child: string, max: number, every: number, maxY: number) {
  if (!onScreen(e, 10, maxY) || st.launched >= max) return;
  st.sigT -= dt;
  if (st.sigT > 0) return;
  st.sigT = every;
  st.launched++;
  safeFx(world, "ring", e.x, e.y, 1.4);
  try {
    world.playSfx("warning", { volume: 0.3 });
  } catch {
    /* ignore */
  }
  const dir = world.rng() < 0.5 ? 1 : -1;
  world.spawnEnemy(child, e.x + dir * 10, e.y - 6, { dir: dir as 1 | -1, phase: world.rng(), drops: true, data: { launchedBy: e.id } });
}

// Kamikaze contact: the Engine's contact check (core/bullets.ts) hurts the player and kills units whose movement is
// "dive" or tagged "kamikaze", so no extra handling is needed here.

// ------------------------------------------------------------------------------------------ attacks

function tickAttacks(e: Enemy, st: AIState, dt: number, world: WorldAPI) {
  const p = world.player;
  const diff = difficulty(world);
  let rate = 0.8 + 0.2 * diff; // easy 0.8x .. hard 1.1x
  if (st.buffUntil > world.time) rate *= RADAR_RATE;
  const playerAlive = !!p && p.alive !== false;

  for (const a of st.attacks) {
    const minY = a.def.minY ?? 0;
    const maxY = a.def.maxY ?? GAME_H - 60;
    if (!onScreen(e, minY, maxY)) continue;
    if (st.vis < (a.def.delay ?? 0.8)) continue;
    a.timer -= dt * rate;
    if (a.timer > 0) continue;
    if (!playerAlive) {
      a.timer = 0.5;
      continue;
    }
    if (a.def.range !== undefined && p && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 > a.def.range * a.def.range) {
      a.timer = 0.3;
      continue;
    }
    a.timer = a.def.interval;
    const pat = resolvePattern(a.def.pattern);
    st.running.push(patternRunner.start(pat, st.owner, world));
  }

  for (let i = st.running.length - 1; i >= 0; i--) {
    const inst = st.running[i];
    inst.update(dt);
    if (inst.done) st.running.splice(i, 1);
  }
}

// ------------------------------------------------------------------------------------------ system

export const enemySystem: EnemySystem = {
  defs: ENEMY_DEFS,

  onSpawn(e: Enemy, world: WorldAPI) {
    if (!e.data) e.data = {};
    if (e.facing === undefined || e.facing === null) e.facing = 90;
    const d = e.def;
    const jitter = world.rng();
    const st: AIState = {
      attacks: d.attacks.map((a, i) => ({ def: a, timer: jitter * 0.4 + i * 0.35 })),
      running: [],
      owner: makeOwner(e),
      vis: 0,
      sigT: d.id === "military_base" ? 1.2 : d.id === "hangar" ? 0.8 : 0.5,
      launched: 0,
      buffUntil: 0,
      shieldUntil: 0,
      jitter,
    };
    e.data.ai = st;
  },

  update(e: Enemy, dt: number, world: WorldAPI) {
    let st = ai(e);
    if (!st) {
      enemySystem.onSpawn(e, world);
      st = ai(e)!;
    }
    stepMovement(e, e.def.movement, dt, world);
    if (onScreen(e)) st.vis += dt;

    switch (e.def.id) {
      case "radar_station":
        radarTick(e, st, dt, world);
        break;
      case "shield_drone":
        shieldTick(e, st, dt, world);
        break;
      case "military_base":
        launcherTick(e, st, dt, world, "drone_kamikaze", 4, 5, GAME_H * 0.6);
        break;
      case "hangar":
        launcherTick(e, st, dt, world, "fighter_basic", 2, 4, GAME_H * 0.5);
        break;
    }
    tickAttacks(e, st, dt, world);
  },

  onHit(e: Enemy, damage: number, world: WorldAPI) {
    const st = ai(e);
    if (!st || !e.alive || e.hp <= 0) return;
    if (st.shieldUntil > world.time && damage > 0) {
      // Aegis drone: refund half the damage (never above max)
      e.hp = Math.min(e.maxHp, e.hp + Math.floor(damage * 0.5));
      if (world.rng() < 0.3) safeFx(world, "spark", e.x, e.y, 0.7);
    }
  },

  onDeath(e: Enemy, world: WorldAPI) {
    const st = ai(e);
    if (st) {
      for (const inst of st.running) inst.cancel();
      st.running.length = 0;
    }
    // only a real kill (hp <= 0) chains - culling off-screen also calls onDeath
    if (e.def.id === "oil_tank" && e.hp <= 0) {
      safeFx(world, "explosion_l", e.x, e.y, 1.2);
      safeFx(world, "fire", e.x, e.y, 1.5);
      for (const o of world.enemies) {
        if (o === e || !o.alive || o.def.layer !== "ground" || o.bossId) continue;
        if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= OIL_CHAIN_RADIUS * OIL_CHAIN_RADIUS) world.damageEnemy(o, OIL_CHAIN_DAMAGE, true);
      }
    }
  },
};

// ------------------------------------------------------------------------------------------ describe

/** Human-readable one-paragraph summary of an enemy def (Level agent / docs). */
export function describeEnemy(id: string): string {
  const d = ENEMY_DEFS[id];
  if (!d) return `${id}: unknown enemy`;
  const meta = ENEMY_META[id];
  const atks = d.attacks.length
    ? d.attacks.map((a) => `${typeof a.pattern === "string" ? a.pattern : a.pattern.id}/${a.interval}s`).join(", ")
    : "none";
  const m = d.movement;
  const mv = `${m.kind}${m.speed ? ` ${m.speed}u/s` : ""}`;
  return (
    `${d.id} (${d.name}) - ${d.layer}, vulnerable to ${d.vulnerableTo}, hp ${d.hp}${d.armor ? ` armor ${d.armor}` : ""}, ` +
    `size ${d.size[0]}x${d.size[1]}, score ${d.score}, move ${mv}, attacks: ${atks}` +
    (d.tags?.length ? `, tags: ${d.tags.join("/")}` : "") +
    (d.anchored === false ? ", drifts (anchored:false)" : "") +
    (meta ? `. Chapters ${meta.chapters}. ${meta.notes}` : "")
  );
}
