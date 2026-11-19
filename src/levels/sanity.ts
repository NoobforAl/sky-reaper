/**
 * Timeline sanity checks (dev/QA only; not imported by the game).
 * Run in the dev server console:  (await import("/src/levels/sanity.ts")).checkLevels()
 * Checks: monotonic t, known enemy ids / pickups / tutorial steps / boss ids, formation slots on or near the screen,
 * boss event last within 170-240 s, weather intensity range, objective stat keys, ascending medals,
 * and estimates the max kill score per chapter (to tune medal thresholds).
 * Round 5 (#7): `checkOverlaps(script)` lists authored units of the same layer that start overlapped on the live
 * field (see spacing.ts); `checkLevels()` reports the count per chapter.
 */
import { DESIGN_W, PICKUP_KINDS, type ChapterDef } from "../contracts";
import { enemySystem } from "../enemies";
import { bosses, BOSS_PART_DEFS } from "../bosses";
import { formationSlot } from "./builders";
import { CHAPTER_SCRIPTS } from "./index";
import { authoredBoxes } from "./runner";
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

export function checkLevels(): ChapterReport[] {
  const out = CHAPTER_SCRIPTS.map((s) => {
    const r = checkChapter(s.def);
    const ov = checkOverlaps(s);
    r.overlaps = ov.length;
    for (const o of ov) r.warnings.push(`overlap ${o}`);
    return r;
  });
  if (typeof console !== "undefined") console.table(out.map((r) => ({ ...r, errors: r.errors.length, warnings: r.warnings.length })));
  return out;
}
