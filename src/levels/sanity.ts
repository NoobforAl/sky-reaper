/**
 * Timeline sanity checks (dev/QA only; not imported by the game).
 * Run in the dev server console:  (await import("/src/levels/sanity.ts")).checkLevels()
 * Checks: monotonic t, known enemy ids / pickups / tutorial steps / boss ids, formation slots on or near the screen,
 * boss event last within 170-240 s, weather intensity range, objective stat keys, ascending medals,
 * and estimates the max kill score per chapter (to tune medal thresholds).
 * Round 5 (#7): `checkOverlaps(script)` lists authored units of the same layer that start overlapped on the live
 * field (see spacing.ts); `checkLevels()` reports the count per chapter.
 * Round 6 (#12): `checkNaval(script)` replays every river boat (jungle / arctic) with the runner's river-follow logic
 * (naval.ts) and reports an ERROR when its hull is off the water at spawn or at any sampled moment of its life; it also
 * warns about stationary ground structures placed on the water. `checkGusts(script)` checks the authored wind gusts
 * (length, push, telegraph room, no bomber carpet / drone row / boss overlap) and `checkCitadel()` replays the citadel
 * structures through the base-layout snapper (every one must find a free plot spot off the runway).
 * Node (no browser): load this module with Vite's ssrLoadModule; set a fake `window` ({ innerWidth, innerHeight,
 * location.search: "?layout=wide" }) first to check the wide mapping.
 */
import { DESIGN_W, GAME_H, PICKUP_KINDS, type ChapterDef } from "../contracts";
import { enemySystem } from "../enemies";
import { bosses, BOSS_PART_DEFS } from "../bosses";
import { formationSlot } from "./builders";
import { CHAPTER_SCRIPTS } from "./index";
import { CitadelLayout, hasRiver, riverX, waterHalfW } from "./backgrounds";
import { hullHalf, isRiverBoat, laneHalf, riverFollowShift } from "./naval";
import { authoredBoxes, scrollProfile, scrollSpeedAt } from "./runner";
import { boxesOverlap, OVERLAP_WINDOW } from "./spacing";
import type { ChapterScript } from "./types";
import { TUTORIAL_HINTS } from "./tutorial";

const STAT_KEYS = ["score", "kills", "airKills", "groundKills", "damageTaken", "deaths", "coins", "bombsUsed", "flaresUsed", "timeSec", "bossDefeated", "killRate", "spawned"];

export interface ChapterReport {
  id: string;
  events: number;
  spawns: number;
  airSpawns: number;
  groundSpawns: number;
  bossAt: number;
  maxKillScore: number;
  bossPartScore: number;
  overlaps: number;
  errors: string[];
  warnings: string[];
}

export function checkChapter(def: ChapterDef): ChapterReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const defs = enemySystem.defs;
  let last = -1;
  let spawns = 0;
  let air = 0;
  let ground = 0;
  let score = 0;
  let bossAt = -1;
  const tags: Record<string, number> = {};
  const count = (id: string, n: number) => {
    const d = defs[id];
    if (!d) {
      errors.push(`unknown enemy "${id}"`);
      return;
    }
    spawns += n;
    if (d.layer === "air") air += n;
    else ground += n;
    score += d.score * n;
    for (const t of d.tags ?? []) tags[t] = (tags[t] ?? 0) + n;
  };
  for (const e of def.events) {
    if (e.t < last) errors.push(`non-monotonic t ${e.t} after ${last}`);
    last = e.t;
    if (bossAt >= 0 && e.type !== "boss") warnings.push(`event after boss at t=${e.t} (${e.type})`);
    switch (e.type) {
      case "spawn":
        count(e.enemy, 1);
        if (e.x < -60 || e.x > DESIGN_W + 60) warnings.push(`spawn ${e.enemy} far off-screen x=${e.x} t=${e.t}`);
        break;
      case "formation": {
        count(e.enemy, e.count);
        for (let i = 0; i < e.count; i++) {
          const [ox] = formationSlot(e.shape, i, e.count, e.dx, e.dy);
          const x = e.x + ox;
          if (x < -60 || x > DESIGN_W + 60) warnings.push(`formation ${e.enemy}[${i}] x=${Math.round(x)} t=${e.t}`);
        }
        break;
      }
      case "pickup":
        if (!(PICKUP_KINDS as readonly string[]).includes(e.kind)) errors.push(`bad pickup ${e.kind}`);
        break;
      case "tutorial":
        if (e.step !== "clear" && !TUTORIAL_HINTS[e.step]) warnings.push(`unknown tutorial step ${e.step}`);
        break;
      case "weather":
        if (e.intensity < 0 || e.intensity > 1) errors.push(`weather intensity ${e.intensity}`);
        break;
      case "boss":
        bossAt = e.t;
        if (!bosses.ids.includes(e.boss)) errors.push(`unknown boss ${e.boss}`);
        if (e.boss !== def.boss) errors.push(`boss event ${e.boss} != chapter.boss ${def.boss}`);
        break;
    }
  }
  if (bossAt < 0) errors.push("no boss event");
  else if (bossAt < 170 || bossAt > 240) warnings.push(`boss at ${bossAt}s (target 180-240)`);
  for (const o of def.objectives) {
    if (o.stat.startsWith("tag:")) {
      const tag = o.stat.slice(4);
      const n = tags[tag] ?? 0;
      if (o.cmp === "gte" && n < o.goal) errors.push(`objective ${o.id}: only ${n} "${tag}" spawned, goal ${o.goal}`);
    } else if (!STAT_KEYS.includes(o.stat)) errors.push(`objective ${o.id}: bad stat ${o.stat}`);
  }
  const m = def.medalScores;
  for (let i = 1; i < m.length; i++) if (m[i]! <= m[i - 1]!) errors.push("medal thresholds not ascending");
  let bossPartScore = 0;
  for (const id in BOSS_PART_DEFS) if (id.startsWith(`boss_${def.boss}_`)) bossPartScore += BOSS_PART_DEFS[id]!.score;
  return { id: def.id, events: def.events.length, spawns, airSpawns: air, groundSpawns: ground, bossAt, maxKillScore: score, bossPartScore, overlaps: 0, errors, warnings };
}

/** authored units (same layer) that start overlapped on the live field: "t=.. a[i] x t=.. b[j]" */
export function checkOverlaps(script: ChapterScript): string[] {
  const boxes = authoredBoxes(script);
  const out: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    for (let j = i + 1; j < boxes.length && boxes[j]!.t - a.t <= OVERLAP_WINDOW; j++) {
      const b = boxes[j]!;
      if (boxesOverlap(a, b)) out.push(`${a.tag} @(${Math.round(a.x)},${Math.round(a.y)}) x ${b.tag} @(${Math.round(b.x)},${Math.round(b.y)})`);
    }
  }
  return out;
}

/**
 * River boats replayed with the runner's per-step logic (spawn on the river, follow + clamp before the unit's own
 * movement, then the unit's sine / straight motion), sampled every step until the boat leaves the bottom of the screen.
 * Returns errors for hulls off the water and warnings for stationary structures placed on the water.
 */
export function checkNaval(script: ChapterScript): { errors: string[]; warnings: string[]; boats: number; samples: number } {
  const def = script.def;
  const errors: string[] = [];
  const warnings: string[] = [];
  let boats = 0;
  let samples = 0;
  if (!hasRiver(def.biome)) return { errors, warnings, boats, samples };
  const S = scrollProfile(def);
  const TOL = 1.5;
  const DT = 1 / 60;
  for (const b of authoredBoxes(script)) {
    const d = enemySystem.defs[b.id];
    if (!d) continue;
    if (d.layer === "ground" && d.movement.kind === "stationary") {
      const wy = S(b.t) - b.y;
      const gap = Math.abs(b.x - riverX(wy)) - (d.size[0] * 2) / 2;
      if (gap < waterHalfW(def.biome, wy)) warnings.push(`structure on water ${b.tag} @(${Math.round(b.x)}, wy ${Math.round(wy)})`);
      continue;
    }
    if (!isRiverBoat(def.biome, b.id)) continue;
    boats++;
    const m = d.movement;
    const amp = m.kind === "sine" ? (m.amp ?? 50) : 0;
    const f = m.freq ?? 0.5;
    const hull = hullHalf(b.id);
    // the box does not carry `dir` (it only flips the weave): replay both
    for (const dir of [1, -1]) {
      let x = b.x;
      let x0 = b.x;
      let y = b.y;
      let t = 0;
      let time = b.t;
      let sy = S(time);
      let prevCx = riverX(sy - y);
      let worst = 0;
      let worstAt = "";
      for (let step = 0; step < 60 * 90 && y < GAME_H + 80; step++) {
        // runner step (before the unit moves)
        const wy = sy - y;
        const cx = riverX(wy);
        const shift = riverFollowShift(x, prevCx, cx, laneHalf(def.biome, b.id, wy));
        x += shift;
        x0 += shift;
        prevCx = cx;
        // unit's own movement (src/enemies/movement.ts: sine is absolute around x0, straight moves straight down)
        t += DT;
        if (amp > 0) x = x0 + Math.sin(t * f * Math.PI * 2) * amp * dir;
        y += m.speed * DT;
        time += DT;
        sy += scrollSpeedAt(def, time) * DT;
        // rendered position vs the drawn water
        const wy2 = sy - y;
        const out = Math.abs(x - riverX(wy2)) + hull - waterHalfW(def.biome, wy2);
        samples++;
        if (step === 0 && out > TOL) errors.push(`naval spawn off water ${b.tag} by ${out.toFixed(1)}u`);
        if (out > worst) {
          worst = out;
          worstAt = `t+${t.toFixed(1)}s y ${Math.round(y)}`;
        }
      }
      if (worst > TOL) errors.push(`naval off water ${b.tag} dir ${dir}: hull ${worst.toFixed(1)}u onto the bank at ${worstAt}`);
    }
  }
  return { errors, warnings, boats, samples };
}

/** round 6 (#14): gust push ranges per biome (fraction of max speed) */
const GUST_PUSH: Record<string, [number, number]> = { desert: [0.55, 0.7], arctic: [0.25, 0.4] };
/** seconds a kamikaze drone row stays dangerous after it spawns */
const DRONE_SEC = 6;

/**
 * Gusts (round 6, #14): 2-4 s long, push inside the biome range, at least 1 s of calm between two gusts (room for the
 * telegraph), over before the boss, and never while a bomber's carpet run or a kamikaze drone row is live (a push into
 * those could not be dodged).
 */
export function checkGusts(script: ChapterScript): { errors: string[]; gusts: number } {
  const errors: string[] = [];
  const G = script.gusts ?? [];
  if (G.length === 0) return { errors, gusts: 0 };
  const def = script.def;
  const range = GUST_PUSH[def.biome];
  if (!range) errors.push(`gusts authored in biome ${def.biome}`);
  const bossAt = def.events.find((e) => e.type === "boss")?.t ?? Infinity;
  // danger windows from authored units
  const danger: Array<[number, number, string]> = [];
  for (const b of authoredBoxes(script)) {
    const d = enemySystem.defs[b.id];
    if (!d) continue;
    if (b.id.startsWith("drone_kamikaze")) danger.push([b.t, b.t + DRONE_SEC, b.tag ?? b.id]);
    for (const a of d.attacks) {
      const id = typeof a.pattern === "string" ? a.pattern : a.pattern.id;
      if (!id.includes("carpet")) continue;
      const maxY = a.maxY ?? GAME_H;
      const sp = Math.max(1, d.movement.speed);
      danger.push([b.t, b.t + (maxY - b.y) / sp, b.tag ?? b.id]);
    }
  }
  let prevEnd = -Infinity;
  for (const g of G) {
    const tag = `gust t=${g.t}`;
    if (g.dur < 2 || g.dur > 4) errors.push(`${tag}: duration ${g.dur} s (2-4)`);
    if (range && (g.push < range[0] || g.push > range[1])) errors.push(`${tag}: push ${g.push} outside ${range[0]}-${range[1]}`);
    if (g.t - 1 < prevEnd) errors.push(`${tag}: telegraph overlaps the previous gust`);
    if (g.t + g.dur > bossAt - 3) errors.push(`${tag}: runs into the boss (t ${bossAt})`);
    const w0 = g.t - 1;
    const w1 = g.t + g.dur;
    for (const [a, b, who] of danger)
      if (a < w1 && b > w0) {
        errors.push(`${tag}: overlaps ${who} (${a.toFixed(1)}-${b.toFixed(1)} s)`);
        break;
      }
    prevEnd = g.t + g.dur;
  }
  return { errors, gusts: G.length };
}

/**
 * Citadel layout (round 6, #11): replays the authored stationary ground units through the plot snapper in spawn
 * order (wide copies not included). ERROR when a structure finds no free plot spot (it would spawn unsnapped, maybe on
 * the runway); reports the largest move and the largest delay the snapping adds.
 */
export function checkCitadel(script?: ChapterScript): { errors: string[]; structures: number; maxMove: number; maxDelay: number; plots: number; avenue: number } {
  const sc = script ?? CHAPTER_SCRIPTS.find((c) => c.def.biome === "citadel")!;
  const def = sc.def;
  const L = new CitadelLayout();
  const S = scrollProfile(def);
  const out = { x: 0, wy: 0 };
  const errors: string[] = [];
  let n = 0;
  let maxMove = 0;
  let maxDelay = 0;
  if (def.biome !== "citadel") return { errors, structures: 0, maxMove: 0, maxDelay: 0, plots: 0, avenue: -1 };
  for (const b of authoredBoxes(sc)) {
    const d = enemySystem.defs[b.id];
    if (!d || d.layer !== "ground" || d.movement.kind !== "stationary") continue;
    n++;
    const sy = S(b.t);
    const wy = sy - b.y;
    const r = L.snapStructure(d.size[0], d.size[1], b.x, wy, sy + 4, out);
    if (!r) {
      errors.push(`citadel: no plot spot for ${b.tag} @(${Math.round(b.x)}, wy ${Math.round(wy)})`);
      continue;
    }
    maxMove = Math.max(maxMove, Math.hypot(r.x - b.x, r.wy - wy));
    maxDelay = Math.max(maxDelay, (r.wy - wy) / scrollSpeedAt(def, b.t));
    if (Math.abs(r.x - L.cx) < 64 + d.size[0]) errors.push(`citadel: ${b.tag} placed on the runway`);
  }
  return { errors, structures: n, maxMove: Math.round(maxMove), maxDelay: +maxDelay.toFixed(2), plots: L.plots.length, avenue: L.avenue };
}

export function checkLevels(): ChapterReport[] {
  const out = CHAPTER_SCRIPTS.map((s) => {
    const r = checkChapter(s.def);
    const nv = checkNaval(s);
    for (const e of nv.errors) r.errors.push(e);
    for (const w of nv.warnings) r.warnings.push(w);
    for (const e of checkGusts(s).errors) r.errors.push(e);
    if (s.def.biome === "citadel") for (const e of checkCitadel(s).errors) r.errors.push(e);
    const ov = checkOverlaps(s);
    r.overlaps = ov.length;
    for (const o of ov) r.warnings.push(`overlap ${o}`);
    return r;
  });
  if (typeof console !== "undefined") console.table(out.map((r) => ({ ...r, errors: r.errors.length, warnings: r.warnings.length })));
  return out;
}
