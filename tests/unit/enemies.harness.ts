/**
 * Pure-logic harness for src/enemies + src/patterns against a mock WorldAPI.
 * Run:  npx esbuild tests/unit/enemies.harness.ts --bundle --platform=node --format=esm --outfile=<tmp>/h.mjs && node <tmp>/h.mjs
 * Exits non-zero on failure.
 */
import {
  EXTRA_ENEMIES,
  GAME_H,
  GAME_W,
  REQUIRED_AIR_ENEMIES,
  REQUIRED_GROUND_ENEMIES,
  type BulletSpawn,
  type Enemy,
  type EnemySpawnOpts,
  type GameEventName,
  type GameEvents,
  type HazardSpawn,
  type PatternDef,
  type WorldAPI,
} from "../../src/contracts";
import { enemySystem, describeEnemy } from "../../src/enemies";
import { PATTERNS, patternRunner, MAX_AIMED_SINGLE_SPEED, MAX_BULLET_SPEED, MAX_MISSILE_TURN } from "../../src/patterns";

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) {
    failures++;
    console.error("FAIL:", msg);
  }
}

// ----------------------------------------------------------------------------- mock world
interface Mock extends WorldAPI {
  bullets: BulletSpawn[];
  hazards: HazardSpawn[];
  fx: string[];
  sfx: string[];
  ev: Array<{ name: string; payload: unknown }>;
  list: Enemy[];
  step(dt: number): void;
  playerDamage: number;
  _time: number;
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeWorld(): Mock {
  const rng = mulberry(42);
  let nextId = 1;
  const player = {
    x: GAME_W / 2, y: GAME_H - 140, vx: 0, vy: 0, hp: 100, maxHp: 100, shield: 50, maxShield: 50, bombs: 3, maxBombs: 5,
    power: 1, airWeapon: "vulcan", groundWeapon: "bomb", aircraft: "falcon", invuln: 0, flareCd: 0, rapid: 0, overdrive: 0,
    magnet: 0, alive: true, lives: 3, hitRadius: 4, bank: 0,
  } as WorldAPI["player"];
  const w: Mock = {
    bullets: [], hazards: [], fx: [], sfx: [], ev: [], list: [], playerDamage: 0, _time: 0,
    get time() { return w._time; },
    scrollY: 0, scrollSpeed: 40, difficulty: 1,
    setScrollSpeed() {}, setWind() {},
    player,
    stats: {} as WorldAPI["stats"],
    get enemies() { return w.list; },
    events: {
      on: () => () => {},
      emit<K extends GameEventName>(name: K, payload: GameEvents[K]) { w.ev.push({ name, payload }); },
    },
    audio: {} as WorldAPI["audio"],
    rng,
    rngRange: (a: number, b: number) => a + (b - a) * rng(),
    spawnEnemy(defId: string, x: number, y: number, opts: EnemySpawnOpts = {}) {
      const def = enemySystem.defs[defId];
      if (!def) return null;
      const e: Enemy = { id: nextId++, def, alive: true, x, y, vx: 0, vy: 0, hp: def.hp, maxHp: def.hp, t: 0, tOn: 0,
        onScreen: false, facing: 90, flash: 0, frame: 0, invuln: false, opts, data: {} };
      w.list.push(e);
      enemySystem.onSpawn(e, w);
      return e;
    },
    spawnBullet(s) { w.bullets.push(s); },
    spawnHazard(h) { w.hazards.push(h); },
    spawnPickup() {},
    spawnFx(kind) { w.fx.push(kind); },
    damageEnemy(e, amt) { if (!e.alive) return; e.hp -= amt; enemySystem.onHit?.(e, amt, w); if (e.hp <= 0) w.killEnemy(e); },
    killEnemy(e) { if (!e.alive) return; e.alive = false; e.hp = Math.min(e.hp, 0); enemySystem.onDeath(e, w); },
    damagePlayer(a) { w.playerDamage += a; },
    clearEnemyBullets() {}, shake() {}, flash() {},
    playSfx(id) { w.sfx.push(id); },
    startBoss() {}, completeChapter() {},
    step(dt: number) {
      w._time += dt;
      for (const e of [...w.list]) {
        if (!e.alive) continue;
        e.t += dt;
        enemySystem.update(e, dt, w);
        if (e.def.layer === "ground" && e.def.anchored !== false) e.y += w.scrollSpeed * dt;
      }
    },
  };
  return w;
}

// ----------------------------------------------------------------------------- tests
const DT = 1 / 60;

// 1. roster completeness
for (const id of [...REQUIRED_AIR_ENEMIES, ...REQUIRED_GROUND_ENEMIES, ...EXTRA_ENEMIES]) {
  check(enemySystem.defs[id], `missing def ${id}`);
}
for (const [id, d] of Object.entries(enemySystem.defs)) {
  check(d.id === id, `def id mismatch ${id}`);
  check(d.hp > 0 && d.size[0] > 0, `bad stats ${id}`);
  for (const a of d.attacks) {
    if (typeof a.pattern === "string") check(PATTERNS[a.pattern], `${id} refs unknown pattern ${a.pattern}`);
    check(a.interval > 0.5, `${id} attack interval too low`);
  }
  check(!describeEnemy(id).includes("unknown"), `describe ${id}`);
}
console.log(`defs: ${Object.keys(enemySystem.defs).length}, patterns: ${Object.keys(PATTERNS).length}`);

// 2. every pattern fires, respects caps, finishes
const kinds = new Set<string>();
for (const p of Object.values(PATTERNS)) {
  kinds.add(p.kind);
  const w = makeWorld();
  const owner = { x: 240, y: 150, facing: 90, id: 99, layer: "air" as const };
  const inst = patternRunner.start(p, owner, w);
  let t = 0;
  while (!inst.done && t < 10) {
    inst.update(DT);
    t += DT;
  }
  check(inst.done, `pattern ${p.id} never finished`);
  const out = w.bullets.length + w.hazards.length;
  check(out > 0, `pattern ${p.id} produced nothing`);
  for (const b of w.bullets) {
    check(b.damageClass === "enemy", `${p.id} wrong class`);
    const cap = p.kind === "aimed" && (p.count ?? 1) === 1 ? MAX_AIMED_SINGLE_SPEED : MAX_BULLET_SPEED;
    check(b.speed <= cap + 1e-6, `${p.id} speed ${b.speed} > ${cap}`);
    if (b.isMissile) {
      check((b.turnRate ?? 0) <= MAX_MISSILE_TURN, `${p.id} turnRate`);
      check((b.armDelay ?? 0) >= 0.5, `${p.id} armDelay`);
      check((b.life ?? 99) <= 6, `${p.id} life`);
      check(b.decoyable, `${p.id} decoyable`);
    }
  }
  if (p.kind === "homing") {
    // missileLaunched is emitted by the Engine's spawnBullet for isMissile bullets
    check(w.bullets.every((b) => b.isMissile), `${p.id}: all homing bullets flagged isMissile`);
    check(w.sfx.includes("warning"), `${p.id}: warning sfx`);
  }
  for (const h of w.hazards) check(h.telegraphMs >= 600, `${p.id}: hazard telegraph ${h.telegraphMs}`);
  if ((p.telegraphMs ?? 0) >= 600) check(w.sfx.includes("warning"), `${p.id}: strong attack must warn`);
  if (p.sfx) check(w.sfx.includes(p.sfx), `${p.id}: sfx ${p.sfx} not played`);
}
for (const k of ["straight", "aimed", "spread", "circular", "spiral", "burst", "multi", "homing", "delayedBlast", "areaStrike", "sweep"]) {
  check(kinds.has(k), `no pattern of kind ${k}`);
}

// 3. aimed shot heads at the player; owner position read live per volley
{
  const w = makeWorld();
  const owner = { x: 100, y: 100, facing: 90, id: 1, layer: "air" as const };
  const p: PatternDef = { id: "t", kind: "burst", bullet: PATTERNS.aimed_slow.bullet, count: 1, shots: 2, gapMs: 100 };
  const inst = patternRunner.start(p, owner, w);
  inst.update(DT);
  owner.x = 300;
  for (let i = 0; i < 20; i++) inst.update(DT);
  check(w.bullets.length === 2, "burst produced 2");
  check(w.bullets[0].x === 100 && w.bullets[1].x === 300, "owner position read live");
  const b = w.bullets[0];
  const want = (Math.atan2(w.player.y - 100, w.player.x - 100) * 180) / Math.PI;
  check(Math.abs(b.angle - want) < 0.01, `aimed angle ${b.angle} vs ${want}`);
  // cancel stops further volleys
  const inst2 = patternRunner.start(PATTERNS.spiral_slow, owner, w);
  const n0 = w.bullets.length;
  inst2.cancel();
  inst2.update(1);
  check(inst2.done && w.bullets.length === n0, "cancel stops pattern");
}

// 4. fan gaps: adjacent bullet columns >= 28u at 150u travel for base patterns
for (const id of ["fan3_slow", "fan5", "fan5_aimed", "fan7_aimed", "ring12", "ring16"]) {
  const w = makeWorld();
  const inst = patternRunner.start(PATTERNS[id], { x: 240, y: 100, facing: 90, id: 1, layer: "air" }, w);
  for (let i = 0; i < 120 && !inst.done; i++) inst.update(DT);
  const angs = w.bullets.map((b) => b.angle).sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < angs.length; i++) minGap = Math.min(minGap, (((angs[i] - angs[i - 1]) * Math.PI) / 180) * 150);
  check(minGap >= 28 - 1e-6, `${id} gap ${minGap.toFixed(1)} < 28`);
}

// 5. simulate every enemy for 12 s: moves, attacks, no exceptions; cancel on death
for (const id of Object.keys(enemySystem.defs)) {
  const w = makeWorld();
  const e = w.spawnEnemy(id, GAME_W / 2, enemySystem.defs[id].layer === "ground" ? 60 : -20)!;
  const x0 = e.x;
  const y0 = e.y;
  try {
    for (let i = 0; i < 60 * 12; i++) w.step(DT);
  } catch (err) {
    check(false, `${id} threw ${(err as Error).stack}`);
  }
  const moved = Math.hypot(e.x - x0, e.y - y0) > 5;
  check(moved, `${id} did not move`);
  check(Number.isFinite(e.x) && Number.isFinite(e.y), `${id} NaN position`);
  if (enemySystem.defs[id].attacks.length) check(w.bullets.length + w.hazards.length > 0, `${id} never attacked`);
  // death cancels running patterns
  w.killEnemy(e);
  const own = () => w.bullets.filter((b) => b.ownerId === e.id).length;
  const n = own();
  for (let i = 0; i < 60; i++) w.step(DT);
  check(own() === n, `${id} fired after death`);
}

// 6. formation lone-survivor fallback
{
  const w = makeWorld();
  const lead = w.spawnEnemy("fighter_basic", 240, -20)!;
  const wing = w.spawnEnemy("fighter_basic", 270, -40, { formation: { leaderId: lead.id, dx: 30, dy: -20 } })!;
  wing.def = { ...wing.def, movement: { kind: "formation", speed: 80 } };
  for (let i = 0; i < 60; i++) w.step(DT);
  check(Math.abs(wing.x - (lead.x + 30)) < 0.01 && Math.abs(wing.y - (lead.y - 20)) < 0.01, "formation keeps offset");
  w.killEnemy(lead);
  const y = wing.y;
  for (let i = 0; i < 120; i++) w.step(DT);
  check(wing.y > y + 40, "lone survivor keeps flying down");
}

// 7. kamikaze dive hits player
{
  const w = makeWorld();
  const d = w.spawnEnemy("drone_kamikaze", 240, -10)!;
  let t = 0;
  let minD = Infinity;
  while (t < 8) {
    w.step(DT);
    t += DT;
    minD = Math.min(minD, Math.hypot(d.x - w.player.x, d.y - w.player.y));
  }
  check(minD < 16, `kamikaze reached player (min dist ${minD.toFixed(1)})`);
}

// 8. radar buff + military base launches + oil chain
{
  const w = makeWorld();
  const radar = w.spawnEnemy("radar_station", 240, 100)!;
  const tank = w.spawnEnemy("tank_light", 260, 120)!;
  w.step(DT);
  w.step(DT);
  check(((tank.data.ai as { buffUntil: number }).buffUntil ?? 0) > w.time, "radar buffs nearby");
  w.killEnemy(radar);
  const base = w.spawnEnemy("military_base", 240, 60)!;
  const before = w.list.length;
  for (let i = 0; i < 60 * 8; i++) w.step(DT);
  check(w.list.length > before, "base launched defenders");
  const oil = w.spawnEnemy("oil_tank", 100, 200)!;
  const t2 = w.spawnEnemy("tank_light", 140, 220)!;
  const hp = t2.hp;
  w.killEnemy(oil);
  check(t2.hp < hp, "oil tank chain damage");
  void base;
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("enemies harness: all checks passed");
