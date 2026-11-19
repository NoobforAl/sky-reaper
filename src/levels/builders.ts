/**
 * Small timeline builder used by every chapter file.
 *
 *   const tl = new TL();
 *   tl.at(4).banner("WAVE 1").wait(1).vee("fighter_basic", 5, 240);
 *
 * The cursor `t` is absolute seconds; `at()` sets it, `wait()` advances it. Every helper adds events at the cursor.
 * Formation geometry lives in `formationSlot()` (shared with the runner, documented in docs/LEVEL_NOTES.md).
 */
import { DESIGN_W, PIXEL_SCALE, WIDE, type EnemySpawnOpts, type LevelEvent, type PickupKind } from "../contracts";
import { enemySystem } from "../enemies";
import type { BannerI18n } from "./i18n";
import { OVERLAP_K } from "./spacing";
import type { FeatureCue, FeatureKind } from "./types";

/**
 * Smallest stagger (ms) for a same-spot stream so consecutive units do not start on top of each other (round 5, #7):
 * the leader must have flown its own sprite height (x OVERLAP_K, + 6 u) before the next one appears.
 */
export function minStreamMs(enemy: string): number {
  const d = enemySystem.defs[enemy];
  if (!d) return 0;
  const sp = d.movement.speed || 0;
  if (sp <= 0) return 0;
  return Math.ceil((((d.size[1] * PIXEL_SCALE * OVERLAP_K + 6) / sp) * 1000) / 10) * 10;
}

/** hover / strafe units stop at their holdY: units sharing an entry point would stack there */
function holdsPosition(enemy: string): boolean {
  const k = enemySystem.defs[enemy]?.movement.kind;
  return k === "hover" || k === "strafe";
}

export type Shape = "line" | "vee" | "column" | "arc";

/**
 * Offset of unit `i` of `n` in a formation, relative to the event's (x, y).
 * Negative y = further above the screen (enters later). Defaults are tuned for 20-32 px native sprites.
 *  - (none) : i * (dx, dy)                         -> raw "N units spaced by (dx,dy)" (contract meaning)
 *  - line   : centred row, step dx (48), optional per-unit dy
 *  - column : one behind another, step dy (48) upwards, optional dx drift
 *  - vee    : leader at x, wings alternate left/right, step (dx 36, dy 30) back
 *  - arc    : units on a 120 deg arc of radius dx (110), wings higher than the centre
 */
export function formationSlot(shape: Shape | undefined, i: number, n: number, dx?: number, dy?: number): [number, number] {
  switch (shape) {
    case "line":
      return [(i - (n - 1) / 2) * (dx ?? 48), i * (dy ?? 0)];
    case "column":
      return [i * (dx ?? 0), -i * (dy ?? 48)];
    case "vee": {
      const k = Math.ceil(i / 2);
      const side = i % 2 === 1 ? -1 : 1;
      return [side * k * (dx ?? 36), -k * (dy ?? 30)];
    }
    case "arc": {
      const r = dx ?? 110;
      const a = n <= 1 ? 0 : (i / (n - 1) - 0.5) * ((120 * Math.PI) / 180);
      return [Math.sin(a) * r, -(1 - Math.cos(a)) * r * (dy !== undefined ? dy / 30 : 1)];
    }
    default:
      return [i * (dx ?? 40), i * (dy ?? 0)];
  }
}

export interface FormOpts {
  y?: number;
  dx?: number;
  dy?: number;
  stagger?: number; // ms
  opts?: EnemySpawnOpts;
}

/**
 * Medal thresholds [bronze, silver, gold, ace] for the live layout (QA #2). `portrait` is authored from measured
 * portrait scores (ACE ~= the expert QA bot: no deaths, ~90 % kill rate; GOLD 0.85x, SILVER 0.68x, BRONZE 0.5x).
 * Wide fields score differently (wider spread = lower kill rate, fewer power-ups reached), so they use `wideFactor`,
 * also measured. GAME_W is fixed at load, so this is decided once per session.
 */
export function medals(portrait: [number, number, number, number], wideFactor: number): [number, number, number, number] {
  if (!WIDE) return portrait;
  return portrait.map((v) => Math.round((v * wideFactor) / 500) * 500) as [number, number, number, number];
}

const L = 70; // left lane
const R = DESIGN_W - 70; // right lane
const C = DESIGN_W / 2;
export const LANES = { L, C, R, LC: (L + C) / 2, RC: (R + C) / 2 } as const;

export class TL {
  readonly events: LevelEvent[] = [];
  readonly features: FeatureCue[] = [];
  t = 0;
  /** default spawn opts merged into every spawn (e.g. chapter-wide hpScale) */
  private defaults: EnemySpawnOpts = {};

  setDefaults(o: EnemySpawnOpts): this {
    this.defaults = o;
    return this;
  }
  at(t: number): this {
    this.t = t;
    return this;
  }
  wait(dt: number): this {
    this.t += dt;
    return this;
  }
  /** merge chapter defaults; units entering on the right half default to dir:-1 (mirrored diagonal/sine/strafe) */
  private o(opts: EnemySpawnOpts | undefined, x: number): EnemySpawnOpts | undefined {
    const autoDir = opts?.dir === undefined && x > DESIGN_W / 2 + 20;
    if (!opts && !autoDir && Object.keys(this.defaults).length === 0) return undefined;
    const r: EnemySpawnOpts = { ...this.defaults, ...(opts ?? {}) };
    if (autoDir) r.dir = -1;
    return r;
  }

  spawn(enemy: string, x: number, opts?: EnemySpawnOpts, y?: number): this {
    this.events.push({ t: this.t, type: "spawn", enemy, x, y, opts: this.o(opts, x) });
    return this;
  }
  /** several singles at the same moment */
  spawns(enemy: string, xs: number[], opts?: EnemySpawnOpts, y?: number): this {
    for (const x of xs) this.spawn(enemy, x, opts, y);
    return this;
  }
  form(enemy: string, count: number, x: number, shape: Shape | undefined, f: FormOpts = {}): this {
    this.events.push({
      t: this.t,
      type: "formation",
      enemy,
      count,
      x,
      y: f.y,
      dx: f.dx,
      dy: f.dy,
      staggerMs: f.stagger,
      shape,
      opts: this.o(f.opts, x),
    });
    return this;
  }
  line(enemy: string, count: number, x: number, f: FormOpts = {}): this {
    return this.form(enemy, count, x, "line", f);
  }
  vee(enemy: string, count: number, x: number, f: FormOpts = {}): this {
    return this.form(enemy, count, x, "vee", f);
  }
  column(enemy: string, count: number, x: number, f: FormOpts = {}): this {
    return this.form(enemy, count, x, "column", f);
  }
  /** arc radius is raised so neighbours sit >= 1.1 sprite sizes apart along the arc (round 5, #7) */
  arc(enemy: string, count: number, x: number, f: FormOpts = {}): this {
    const d = enemySystem.defs[enemy];
    if (d && count > 1) {
      const step = ((120 * Math.PI) / 180) / (count - 1);
      const minR = Math.ceil((Math.max(d.size[0], d.size[1]) * PIXEL_SCALE * 1.1) / step);
      if ((f.dx ?? 110) < minR) f = { ...f, dx: minR };
    }
    return this.form(enemy, count, x, "arc", f);
  }
  /** same-spot stream: count units from (x,y), `ms` apart (a "snake" entry); ms is raised to minStreamMs() */
  stream(enemy: string, count: number, x: number, ms: number, opts?: EnemySpawnOpts, y?: number): this {
    return this.form(enemy, count, x, undefined, { dx: 0, dy: 0, stagger: Math.max(ms, minStreamMs(enemy)), opts, y });
  }
  /** mirrored pair of streams from both sides of the screen */
  pincer(enemy: string, count: number, inset: number, ms: number, opts?: EnemySpawnOpts): this {
    this.stream(enemy, count, inset, ms, { ...(opts ?? {}), dir: 1 });
    this.stream(enemy, count, DESIGN_W - inset, ms, { ...(opts ?? {}), dir: -1 });
    return this;
  }

  /**
   * Banner with its i18n keys (round 5): the English text is the fallback and what other tools read; the runner
   * translates `i18n.key` / `i18n.subKey` when the banner fires (so a locale switch applies to the next banner).
   */
  banner(text: string, subtext?: string, ms = 2400, i18n?: BannerI18n): this {
    const e: LevelEvent & { i18n?: BannerI18n } = { t: this.t, type: "banner", text, subtext, ms };
    if (i18n) e.i18n = i18n;
    this.events.push(e);
    return this;
  }
  scroll(speed: number): this {
    this.events.push({ t: this.t, type: "scroll", speed });
    return this;
  }
  wind(ax: number): this {
    this.events.push({ t: this.t, type: "wind", ax });
    return this;
  }
  weather(kind: "none" | "sandstorm" | "blizzard", intensity: number): this {
    this.events.push({ t: this.t, type: "weather", kind, intensity });
    return this;
  }
  tutorial(step: string): this {
    this.events.push({ t: this.t, type: "tutorial", step });
    return this;
  }
  pickup(kind: PickupKind, x: number, y?: number): this {
    this.events.push({ t: this.t, type: "pickup", kind, x, y });
    return this;
  }
  boss(boss: string): this {
    this.events.push({ t: this.t, type: "boss", boss });
    return this;
  }
  feature(kind: FeatureKind, x: number, len: number): this {
    this.features.push({ t: this.t, kind, x, len });
    return this;
  }
  /** events sorted by time (stable: authoring order kept for equal t) */
  build(): LevelEvent[] {
    return this.events
      .map((e, i) => ({ e, i }))
      .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
      .map((x) => x.e);
  }

  // ------------------------------------------------------------------ special encounters
  /**
   * units burst in from one side at mid-screen height (dir makes sideways movers head inward).
   * Use units with sideways motion: interceptor(_elite) (diagonal), helicopter / gunship_light (hover/strafe).
   * Round 5 (#7): sideways movers enter one behind another (each follower 34 u higher, stagger >= minStreamMs) instead
   * of each spawning on the path of the one before; units that hold a position (hover / strafe) would all stack on one
   * hold point, so they drop in at the flank side by side, one sprite width + 12 u apart.
   */
  sideAmbush(enemy: string, count: number, side: "left" | "right", y = 160, ms = 260, opts?: EnemySpawnOpts): this {
    const dir = side === "left" ? 1 : -1;
    const o = { ...(opts ?? {}), dir } as EnemySpawnOpts;
    if (holdsPosition(enemy)) {
      const w = (enemySystem.defs[enemy]?.size[0] ?? 32) * PIXEL_SCALE;
      const x0 = side === "left" ? 24 + w / 2 : DESIGN_W - 24 - w / 2;
      return this.form(enemy, count, x0, undefined, { dx: dir * (w + 12), dy: 0, stagger: ms, opts: o });
    }
    const x = side === "left" ? -24 : DESIGN_W + 24;
    return this.form(enemy, count, x, undefined, { dx: 0, dy: -34, y, stagger: Math.max(ms, minStreamMs(enemy)), opts: o });
  }
  /** drone minefield: a loose grid of kamikaze drones + mines-carrier escorts */
  droneMinefield(rows: number, cols = 5, enemy = "drone_kamikaze"): this {
    const t0 = this.t;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : 36;
      for (let c = 0; c < cols; c++) {
        const x = 60 + off + c * ((DESIGN_W - 120 - 36) / Math.max(1, cols - 1));
        this.at(t0 + r * 0.9).spawn(enemy, Math.round(x), { phase: (c + r) * 0.17 });
      }
    }
    return this.at(t0);
  }
  /**
   * ground convoy along a road at x: a column of identical tank_light "trucks" (same speed => stays in line),
   * armoured-vehicle outriders zig-zagging beside the road, heavy tank at the rear.
   */
  convoy(x: number, vehicles = 4, len = 900): this {
    const t0 = this.t;
    this.feature("road", x, len);
    this.at(t0 + 0.6).column("tank_light", vehicles, x, { dy: 50 });
    // outriders 64 u off the road centre (was 46: their diagonal drift put them into the truck column at once, #7)
    this.at(t0 + 0.6).spawn("armored_vehicle", x - 64, { dir: 1 }, -80);
    this.at(t0 + 0.6).spawn("armored_vehicle", x + 64, { dir: -1 }, -80 - vehicles * 25);
    this.at(t0 + 0.6).spawn("tank_heavy", x, undefined, -60 - vehicles * 50);
    return this.at(t0);
  }
  /** armoured train on a rail at x: identical cars (tank_light) so the train stays coupled, heavy engine at the rear */
  armouredTrain(x: number, cars = 6): this {
    const t0 = this.t;
    this.feature("rail", x, 1400);
    this.at(t0 + 0.8).column("tank_light", cars, x, { dy: 40 });
    this.at(t0 + 0.8).spawn("tank_heavy", x, undefined, -50 - cars * 40);
    return this.at(t0);
  }
}
