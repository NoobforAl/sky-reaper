/**
 * LevelRunner: fires timeline events, runs formations (with stagger), weather + wind gusts, tutorial hints.
 * Called once per sim step by the Engine (and in 0.25 s chunks by World.fastForward).
 */
import { DESIGN_W, GAME_W, PIXEL_SCALE, PICKUP_KINDS, WIDE, X_SCALE, type ChapterDef, type EnemyDef, type EnemySpawnOpts, type LevelEvent, type LevelRunner, type PickupKind, type WorldAPI } from "../contracts";
import { enemySystem } from "../enemies";
import { BiomeBackground, riverW, riverX } from "./backgrounds";
import { formationSlot } from "./builders";
import { bannerText, type BannerI18n } from "./i18n";
import { boxFor, boxesOverlap, OVERLAP_WINDOW, type SpawnBox } from "./spacing";
import { HINT_SECONDS, hintText } from "./tutorial";
import type { ChapterScript, FeatureCue } from "./types";

/** knobs (docs/LEVEL_NOTES.md) */
export const RUNNER_TUNING = {
  /** weather intensity change per second when easing to a new target */
  weatherEase: 0.35,
  /** sandstorm gust amplitude (wind units/s^2) at intensity 1 */
  sandGust: 55,
  /** blizzard gust amplitude at intensity 1 */
  snowGust: 38,
  /** default spawn y when the event gives none: just above the screen */
  spawnMargin: 10,
  // ---- wide (desktop) playfield; all no-ops when GAME_W == DESIGN_W
  /** authored x within this distance of either DESIGN_W edge keeps its distance to the real edge */
  edgeMargin: 30,
  /** formation offsets (dx) grow by clamp(sqrt(X_SCALE), 1, formationSpreadMax) */
  formationSpreadMax: 1.6,
  /**
   * share of enemy events that get a mirrored / flanking copy: clamp((X_SCALE-1)*dupPerScale, 0, dupMax).
   * QA #4: 0.75 made wide spawn ~1.7x the portrait count (kill-rate objectives unreachable, 4-5x the bullets);
   * 0.3 keeps the wide field populated at ~1.3x. Copies carry `data.wideCopy` (see CONTRACT_REQUESTS: not counted
   * toward RunStats.spawned / killRate, so objectives do not depend on the layout).
   */
  dupPerScale: 0.4,
  dupMax: 0.3,
  /** the copy arrives this many seconds after the original (keeps waves readable, not a wall) */
  dupDelay: 0.45,
  /** copies are skipped while this many enemies are alive (pool safety / fairness) */
  dupMaxAlive: 100,
  /** a mirrored copy must be at least this fraction of GAME_W away from the original, else it flanks instead */
  dupMinGap: 0.3,
  dupFlank: 0.34,
  /** ground spawns within this distance (design units) of a road/rail/runway keep their offset to it */
  featureSnap: 100,
} as const;

/** formation offset multiplier on the live playfield */
export const FORMATION_SPREAD = Math.max(1, Math.min(RUNNER_TUNING.formationSpreadMax, Math.sqrt(X_SCALE)));

/**
 * Map an authored x (DESIGN_W space) to the live playfield. Identity on the 480 field. On wide fields the lanes are
 * spread across the full width; positions near (or beyond) an edge keep their distance to that real edge, so side
 * entries still come from the screen edges.
 */
export function mapX(x: number): number {
  if (!WIDE) return x;
  const M = RUNNER_TUNING.edgeMargin;
  if (x <= M) return x;
  if (x >= DESIGN_W - M) return GAME_W - (DESIGN_W - x);
  return M + ((x - M) * (GAME_W - 2 * M)) / (DESIGN_W - 2 * M);
}

interface Pending {
  t: number;
  enemy: string;
  x: number;
  y: number | undefined;
  opts: EnemySpawnOpts | undefined;
}

const NAVAL = new Set(["gunboat", "destroyer"]);
/** tutorial steps that tell the player to use bombs */
const BOMB_HINTS = new Set(["bomb_ground", "legend", "immune"]);

/** a background set-piece in both spaces (authored cue + live x, world-y span) */
interface LiveFeature {
  cue: FeatureCue;
  wy0: number;
  wy1: number;
  /** live x of the feature, and of its mirrored twin on wide fields (null = none) */
  x: number;
  mirrorX: number | null;
}

/** scroll speed in effect at time t (last scroll event at or before t) */
export function scrollSpeedAt(def: ChapterDef, t: number): number {
  let s = def.scrollSpeed;
  let at = -1;
  for (const e of def.events) if (e.type === "scroll" && e.t <= t && e.t >= at) {
    s = e.speed;
    at = e.t;
  }
  return s;
}

/** live features of a chapter (authored cue mapped to the live field + world-y span) */
function buildFeatures(script: ChapterScript, S: (t: number) => number): LiveFeature[] {
  return script.features.map((f) => {
    const x = mapX(f.x);
    const mx = GAME_W - x;
    return { cue: f, wy0: S(f.t), wy1: S(f.t) + f.len, x, mirrorX: WIDE && Math.abs(mx - x) >= GAME_W * RUNNER_TUNING.dupMinGap ? mx : null };
  });
}

function defaultYOf(enemy: string): number {
  const d = enemySystem.defs[enemy];
  const h = d ? (d.size[1] * PIXEL_SCALE) / 2 : 24;
  return -(h + RUNNER_TUNING.spawnMargin);
}

/**
 * Live anchor x for an authored event x. Ground units placed next to a road/rail/runway keep their offset to that
 * feature (the feature itself is mapped as a whole); everything else uses mapX.
 */
function placeAnchor(features: LiveFeature[], S: (t: number) => number, enemy: string, x: number, t: number, y: number | undefined): { x: number; tied: LiveFeature | null } {
  if (!WIDE) return { x, tied: null };
  const d = enemySystem.defs[enemy];
  if (d && d.layer === "ground") {
    const wy = S(t) - (y ?? defaultYOf(enemy));
    for (const f of features) {
      if (Math.abs(x - f.cue.x) > RUNNER_TUNING.featureSnap) continue;
      if (wy < f.wy0 - 160 || wy > f.wy1 + 160) continue;
      return { x: f.x + (x - f.cue.x), tied: f };
    }
  }
  return { x: mapX(x), tied: null };
}

/** boats in river biomes are squeezed onto the river (see ChapterRunner.spawn): spacing uses that x */
function riverSnapX(biome: string, enemy: string, x: number): number {
  if ((biome === "jungle" || biome === "arctic") && NAVAL.has(enemy)) return GAME_W / 2 + ((x - GAME_W / 2) / X_SCALE) * 0.3;
  return x;
}

/**
 * Spacing boxes of every authored unit on the live field (no wide copies), sorted by spawn time. Used by the runner to
 * place wide copies and by sanity.ts to check authored waves (round 5, #7).
 */
export function authoredBoxes(script: ChapterScript): SpawnBox[] {
  const def = script.def;
  const S = scrollProfile(def);
  const features = buildFeatures(script, S);
  const out: SpawnBox[] = [];
  for (const e of def.events) {
    if (e.type !== "spawn" && e.type !== "formation") continue;
    const d = enemySystem.defs[e.enemy];
    if (!d || d.destructible === false) continue;
    const isForm = e.type === "formation";
    const n = isForm ? Math.max(1, e.count | 0) : 1;
    const anchor = placeAnchor(features, S, e.enemy, e.x, e.t, e.y);
    const scroll = scrollSpeedAt(def, e.t);
    for (let i = 0; i < n; i++) {
      let ox = 0;
      let oy = 0;
      if (isForm) [ox, oy] = formationSlot(e.shape, i, n, e.dx, e.dy);
      const sox = anchor.tied ? ox : ox * FORMATION_SPREAD;
      const y = e.y !== undefined ? e.y + oy : defaultYOf(e.enemy) + oy;
      const delay = isForm ? ((e.staggerMs ?? 0) * i) / 1000 : 0;
      const b = boxFor(d, riverSnapX(def.biome, e.enemy, anchor.x + sox), y, e.t + delay, scroll, e.opts?.dir ?? 1, {} as SpawnBox);
      b.tag = `t=${e.t} ${e.enemy}[${i}]`;
      out.push(b);
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** first index in a t-sorted box list with t >= time */
function lowerBound(list: SpawnBox[], time: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.t < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** scroll distance travelled at time t, from the chapter's scroll events (Engine eases speed changes; error is tiny) */
export function scrollProfile(def: ChapterDef): (t: number) => number {
  const pts: Array<{ t: number; speed: number }> = [{ t: 0, speed: def.scrollSpeed }];
  for (const e of def.events) if (e.type === "scroll") pts.push({ t: e.t, speed: e.speed });
  pts.sort((a, b) => a.t - b.t);
  return (t: number) => {
    let d = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      if (a.t >= t) break;
      const end = Math.min(t, i + 1 < pts.length ? pts[i + 1]!.t : t);
      d += (end - a.t) * a.speed;
    }
    return d;
  };
}

export class ChapterRunner implements LevelRunner {
  readonly chapter: ChapterDef;
  readonly background: BiomeBackground;
  hint: string | null = null;

  private events: LevelEvent[];
  private idx = 0;
  private time = 0;
  private queue: Pending[] = [];
  private bossT: number;
  private bossStarted = false;
  private hintT = 0;
  private baseWind = 0;
  private weatherKind: "none" | "sandstorm" | "blizzard" = "none";
  private weatherTarget = 0;
  private weatherAmt = 0;
  private lastWind = 0;

  constructor(script: ChapterScript) {
    this.chapter = script.def;
    // stable sort by time (keeps authoring order for equal t)
    this.events = script.def.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map((x) => x.e);
    const boss = this.events.find((e) => e.type === "boss");
    this.bossT = boss ? boss.t : (this.events[this.events.length - 1]?.t ?? 1);
    const S = scrollProfile(script.def);
    this.scrollAt = S;
    const T = RUNNER_TUNING;
    this.features = buildFeatures(script, S);
    const bgFeatures: Array<{ kind: FeatureCue["kind"]; x: number; wy0: number; wy1: number }> = [];
    for (const f of this.features) {
      bgFeatures.push({ kind: f.cue.kind, x: f.x, wy0: f.wy0, wy1: f.wy1 });
      if (f.mirrorX !== null) bgFeatures.push({ kind: f.cue.kind, x: f.mirrorX, wy0: f.wy0, wy1: f.wy1 });
    }
    this.background = new BiomeBackground(script.def, bgFeatures);
    this.dupRate = WIDE ? Math.max(0, Math.min(T.dupMax, (X_SCALE - 1) * T.dupPerScale)) : 0;
    this.authored = this.dupRate > 0 ? authoredBoxes(script) : [];
  }

  private features: LiveFeature[];
  private scrollAt: (t: number) => number;
  /** wide-field encounter density (copies per enemy event) + deterministic accumulator */
  private dupRate: number;
  private dupAcc = 0;
  private flankSide = 1;
  /** spacing boxes of authored units (wide only) + copies placed so far (pruned by time) */
  private authored: SpawnBox[];
  private copies: SpawnBox[] = [];
  /** per-event member scratch (event-time only) */
  private mx: number[] = [];
  private my: Array<number | undefined> = [];
  private md: number[] = [];
  /** wide copies skipped because every placement overlapped (QA / debug) */
  copiesSkipped = 0;

  get progress(): number {
    if (this.bossStarted) return 1;
    return Math.max(0, Math.min(1, this.time / Math.max(1, this.bossT)));
  }

  update(dt: number, world: WorldAPI): void {
    this.time += dt;
    const ev = this.events;
    while (this.idx < ev.length && ev[this.idx]!.t <= this.time) {
      this.fire(ev[this.idx++]!, world);
    }
    // staggered formation members
    const q = this.queue;
    while (q.length > 0 && q[0]!.t <= this.time) {
      const p = q.shift()!;
      this.spawn(world, p.enemy, p.x, p.y, p.opts);
    }
    // hint timeout
    if (this.hint !== null) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hint = null;
    }
    this.updateWeather(dt, world);
  }

  // ------------------------------------------------------------------ events
  private fire(e: LevelEvent, world: WorldAPI): void {
    switch (e.type) {
      case "spawn":
      case "formation": {
        const isForm = e.type === "formation";
        const n = isForm ? Math.max(1, e.count | 0) : 1;
        const anchor = this.place(e.enemy, e.x, e.t, e.y);
        // member offsets (feature-tied ground units keep their exact offsets so convoys stay on the road; others
        // spread with the field)
        const MX = this.mx;
        const MY = this.my;
        const MD = this.md;
        MX.length = MY.length = MD.length = n;
        for (let i = 0; i < n; i++) {
          let ox = 0;
          let oy = 0;
          if (isForm) [ox, oy] = formationSlot(e.shape, i, n, e.dx, e.dy);
          MX[i] = anchor.tied ? ox : ox * FORMATION_SPREAD;
          MY[i] = e.y !== undefined ? e.y + oy : oy !== 0 ? this.defaultY(e.enemy) + oy : undefined;
          MD[i] = isForm ? ((e.staggerMs ?? 0) * i) / 1000 : 0;
          this.emitSpawn(world, e.t, MD[i]!, e.enemy, anchor.x + MX[i]!, MY[i], e.opts ? { ...e.opts } : undefined);
        }
        const copy = this.copyPlan(e, anchor, world);
        if (copy) {
          for (let i = 0; i < n; i++) {
            const cx = copy.mirror ? copy.x - MX[i]! : copy.x + MX[i]!;
            this.emitSpawn(world, e.t, MD[i]! + copy.delay, e.enemy, cx, MY[i], copyOpts(e.opts, copy.mirror));
          }
        }
        break;
      }
      case "banner": {
        // round 5 i18n: authored banners carry their string keys; English text stays the fallback
        const b = bannerText((e as { i18n?: BannerI18n }).i18n, e.text, e.subtext);
        world.events.emit("banner", { text: b.text, subtext: b.subtext, ms: e.ms ?? 2400 });
        world.events.emit("waveStarted", { label: e.text });
        break;
      }
      case "scroll":
        world.setScrollSpeed(e.speed);
        break;
      case "wind":
        this.baseWind = e.ax;
        break;
      case "weather":
        this.weatherKind = e.kind === "none" ? this.weatherKind : e.kind;
        this.weatherTarget = e.kind === "none" ? 0 : Math.max(0, Math.min(1, e.intensity));
        break;
      case "tutorial": {
        this.hint = hintText(e.step);
        this.hintT = HINT_SECONDS;
        // a hint that asks for bombs must never meet an empty bomb bay (QA #6): drop one just ahead of the player
        if (BOMB_HINTS.has(e.step) && world.player.alive && world.player.bombs <= 0) {
          world.spawnPickup("bomb", world.player.x, Math.max(40, world.player.y - 70));
        }
        break;
      }
      case "pickup": {
        const kind = (PICKUP_KINDS as readonly string[]).includes(e.kind) ? (e.kind as PickupKind) : "coin";
        world.spawnPickup(kind, mapX(e.x), e.y ?? -10);
        break;
      }
      case "boss":
        if (!this.bossStarted) {
          this.bossStarted = true;
          world.startBoss(e.boss);
        }
        break;
    }
  }

  private emitSpawn(world: WorldAPI, t: number, delay: number, enemy: string, x: number, y: number | undefined, opts: EnemySpawnOpts | undefined): void {
    if (delay <= 0) this.spawn(world, enemy, x, y, opts);
    else this.enqueue({ t: t + delay, enemy, x, y, opts });
  }

  private place(enemy: string, x: number, t: number, y: number | undefined): { x: number; tied: LiveFeature | null } {
    return placeAnchor(this.features, this.scrollAt, enemy, x, t, y);
  }

  /**
   * Wide fields only: should this enemy event get a copy, and where? Candidates in order: mirrored across the centre
   * when far enough from the original (offsets mirrored, `dir` flipped), else a flanking copy shifted to alternating
   * sides (shift >= the formation's own width, so the two groups never interleave). A candidate is rejected when any
   * copied member would overlap an authored unit or an earlier copy (round 5, #7: e.g. the mirror of an [L, R] pair
   * lands exactly on its twin); when every candidate overlaps, the copy is skipped and the next event gets it.
   * Ground units tied to a feature are copied onto the feature's mirrored twin. Boats in river biomes never copy.
   * Reads the member scratch (mx/my/md) filled by fire().
   */
  private copyPlan(e: Extract<LevelEvent, { type: "spawn" | "formation" }>, anchor: { x: number; tied: LiveFeature | null }, world: WorldAPI): { x: number; mirror: boolean; delay: number } | null {
    if (this.dupRate <= 0) return null;
    const T = RUNNER_TUNING;
    const enemy = e.enemy;
    if (NAVAL.has(enemy) && (this.chapter.biome === "jungle" || this.chapter.biome === "arctic")) return null;
    const d = enemySystem.defs[enemy];
    if (!d || d.destructible === false) return null;
    if (world.enemies.length >= T.dupMaxAlive) return null;
    const dir = e.opts?.dir ?? 1;
    if (anchor.tied) {
      const f = anchor.tied;
      if (f.mirrorX === null) return null;
      // mirrored twin feature: same offset, mirrored (copy.x - offset == mirrorX - (anchor.x - f.x))
      const x = f.mirrorX - (anchor.x - f.x);
      return this.copyFits(d, e.t, x, true, 0, -dir) ? { x, mirror: true, delay: 0 } : null;
    }
    this.dupAcc += this.dupRate;
    if (this.dupAcc < 1) return null;
    const ax = anchor.x;
    const delay = T.dupDelay;
    let span = 0;
    for (let i = 0; i < this.mx.length; i++) span = Math.max(span, Math.abs(this.mx[i]!));
    const need = 2 * span + d.size[0] * PIXEL_SCALE + 8;
    const offEdge = ax < 0 || ax > GAME_W; // side-entry events (sideAmbush) stay off-screen on their copy too
    const mx = GAME_W - ax;
    const gap = Math.abs(mx - ax);
    if (gap >= GAME_W * T.dupMinGap && gap >= need && this.copyFits(d, e.t, mx, true, delay, -dir)) return this.takeCopy(mx, true, delay);
    if (offEdge) return null; // flanking an off-screen entry would leave the field: keep the credit for the next event
    // flank on alternating sides, far enough that the copied formation does not interleave with the original
    const shift = Math.max(GAME_W * T.dupFlank, need);
    for (let k = 0; k < 2; k++) {
      this.flankSide = -this.flankSide;
      const x = ax + this.flankSide * shift;
      if (x - span < 20 || x + span > GAME_W - 20) continue;
      if (this.copyFits(d, e.t, x, false, delay, dir)) return this.takeCopy(x, false, delay);
    }
    this.copiesSkipped++;
    return null;
  }

  private takeCopy(x: number, mirror: boolean, delay: number): { x: number; mirror: boolean; delay: number } {
    this.dupAcc -= 1;
    return { x, mirror, delay };
  }

  /** would a copy anchored at x overlap an authored unit or an earlier copy? Registers the copy's boxes when it fits. */
  private copyFits(d: EnemyDef, t: number, x: number, mirror: boolean, delay: number, dir: number): boolean {
    const n = this.mx.length;
    const scroll = scrollSpeedAt(this.chapter, t);
    const cand = this.candBoxes;
    while (cand.length < n) cand.push({} as SpawnBox);
    for (let i = 0; i < n; i++) {
      const cx = mirror ? x - this.mx[i]! : x + this.mx[i]!;
      boxFor(d, cx, this.my[i] ?? this.defaultY(d.id), t + this.md[i]! + delay, scroll, dir, cand[i]!);
    }
    const A = this.authored;
    const tMin = t - OVERLAP_WINDOW;
    // drop copies that can no longer collide with anything new
    let drop = 0;
    while (drop < this.copies.length && this.copies[drop]!.t < tMin - 4) drop++;
    if (drop) this.copies.splice(0, drop);
    for (let i = 0; i < n; i++) {
      const c = cand[i]!;
      for (let j = lowerBound(A, c.t - OVERLAP_WINDOW); j < A.length && A[j]!.t <= c.t + OVERLAP_WINDOW; j++) if (boxesOverlap(c, A[j]!)) return false;
      for (const o of this.copies) if (boxesOverlap(c, o)) return false;
    }
    for (let i = 0; i < n; i++) this.copies.push({ ...cand[i]! });
    return true;
  }
  private candBoxes: SpawnBox[] = [];

  private enqueue(p: Pending): void {
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1]!.t > p.t) i--;
    q.splice(i, 0, p);
  }

  private defaultY(enemy: string): number {
    return defaultYOf(enemy);
  }

  private spawn(world: WorldAPI, enemy: string, x: number, y: number | undefined, opts: EnemySpawnOpts | undefined): void {
    let sx = x;
    const sy = y ?? this.defaultY(enemy);
    // boats ride the jungle river / the arctic open-water lead
    if ((this.chapter.biome === "jungle" || this.chapter.biome === "arctic") && NAVAL.has(enemy)) {
      const wy = world.scrollY - sy;
      const cx = riverX(wy);
      const half = riverW(wy) / 2 - 18;
      sx = cx + Math.max(-half, Math.min(half, ((x - GAME_W / 2) / X_SCALE) * 0.3));
    }
    world.spawnEnemy(enemy, sx, sy, opts);
  }

  // ------------------------------------------------------------------ weather / wind
  private updateWeather(dt: number, world: WorldAPI): void {
    const T = RUNNER_TUNING;
    const d = this.weatherTarget - this.weatherAmt;
    const s = T.weatherEase * dt;
    this.weatherAmt = Math.abs(d) <= s ? this.weatherTarget : this.weatherAmt + Math.sign(d) * s;
    if (this.weatherAmt <= 0 && this.weatherTarget <= 0) this.weatherKind = "none";
    let gust = 0;
    const a = this.weatherAmt;
    const t = this.time;
    if (this.weatherKind === "sandstorm") gust = a * T.sandGust * (0.6 * Math.sin(t * 0.55) + 0.4 * Math.sin(t * 1.7 + 1.1));
    else if (this.weatherKind === "blizzard") gust = a * T.snowGust * (0.7 * Math.sin(t * 0.4 + 0.5) + 0.3 * Math.sin(t * 2.1));
    const wind = this.baseWind + gust;
    if (wind !== this.lastWind) {
      world.setWind(wind);
      this.lastWind = wind;
    }
    const bg = this.background;
    bg.weatherKind = this.weatherKind;
    bg.weatherAmt = a;
    bg.wind = wind;
  }
}

/**
 * opts for a wide-field copy: a mirrored copy flips `dir` (sideways movers head the other way). Every copy is tagged
 * `data.wideCopy = true` so the Engine can leave it out of the layout-independent stats (spawned / killRate).
 */
function copyOpts(o: EnemySpawnOpts | undefined, mirror: boolean): EnemySpawnOpts {
  const r: EnemySpawnOpts = { ...(o ?? {}), data: { ...(o?.data ?? {}), wideCopy: true } };
  if (mirror) r.dir = o?.dir === -1 ? 1 : -1;
  return r;
}
