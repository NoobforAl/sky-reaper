/**
 * Biome backgrounds (Level agent).
 *
 * Layers (back -> front):
 *   drawBack : base fill -> ground tiles (bgtile_<biome>_a|b, 64px native, animated if multi-frame) or procedural mottling
 *              -> biome detail (water glints / river / dunes / ice leads / citadel panels) -> set-piece features (road, rail...)
 *              -> decor (bgdeco_<biome>_1..8 or procedural props) -> cloud shadows (parallax 1.25)
 *   drawFront: high clouds (bgcloud_1..3 or soft ellipses, parallax 1.7) -> weather (sandstorm / blizzard)
 *
 * Determinism: every placement is hashed from (chunk index, slot) in WORLD space (wy = scrollY - screenY); nothing uses
 * Math.random. Hot path allocates nothing: one reused vec2 + reused draw-option objects, colours cached up front.
 * Every biome reads correctly with zero sprites loaded (palette-coloured procedural fallback).
 */
import type { Color, DrawEllipseOpt, DrawRectOpt, DrawSpriteOpt, KAPLAYCtx, SpriteData, Vec2 } from "kaplay";
import { DESIGN_W, GAME_H, GAME_W, PIXEL_SCALE, X_SCALE, type BackgroundRenderer, type Biome, type ChapterDef } from "../../contracts";
import type { FeatureCue, FeatureKind } from "../types";
import { CIT, CitadelLayout } from "./citadel";

export { CIT, CitadelLayout } from "./citadel";

/** round 6 (#11): citadel base-building kit (docs/ASSET_MANIFEST.md "Citadel round 6") */
const CIT_KEYS = [
  "cit_floor_concrete",
  "cit_floor_steel",
  "cit_runway_v",
  "cit_road_v",
  "cit_road_h",
  "cit_road_cross",
  "cit_wall_v",
  "cit_wall_h",
  "cit_wall_tv",
  "cit_wall_end",
  "cit_pad_s",
  "cit_pad_m",
  "cit_pad_l",
  "cit_pad_hangar",
  "cit_pipe_v",
  "cit_helipad",
  "cit_mark_hazard",
] as const;
type CitKey = (typeof CIT_KEYS)[number];
const PAD_KEYS: CitKey[] = ["cit_pad_s", "cit_pad_m", "cit_pad_l", "cit_pad_hangar"];

type RGB = [number, number, number];

/** tuning knobs (see docs/LEVEL_NOTES.md) */
export const BG_TUNING = {
  tile: 64 * PIXEL_SCALE,
  /** default share of base tiles using the `_b` variant (hashed, never two _b tiles side by side / stacked) */
  tileBChance: 0.28,
  /** per-biome override: the _b tiles are feature tiles (island, pond, ice slab, rock, grating) - keep the ocean islands rare */
  tileBChanceBy: { ocean: 0.08, jungle: 0.2, desert: 0.28, arctic: 0.26, citadel: 0.3 } as Record<Biome, number>,
  /** animated tiles: ONE global frame clock for every tile; seconds per frame (~1.7 fps) */
  tileFramePeriod: 0.6,
  /** fraction of each frame period spent eased cross-fading into the next frame (0 = hard frame swaps) */
  tileFade: 0.55,
  /** base-colour veil drawn right over the tiles (before decor) to lower the contrast of animated water art */
  waterVeil: { ocean: 0.2 } as Partial<Record<Biome, number>>,
  /** large, world-anchored low-opacity light/dark patches that break up the tile grid */
  patchChunk: 300,
  patchOpacity: 0.09,
  /** slow brightness drift of those patches (period ~ 2*PI / speed seconds) */
  patchDriftSpeed: 0.22,
  mottleCell: 40,
  decoChunk: 170,
  cloudShadowParallax: 1.25,
  cloudParallax: 1.7,
  cloudChunk: 420,
  maxSandOverlay: 0.3,
  maxSnowOverlay: 0.14,
  snowFlakes: 120,
  sandStreaks: 70,
  spriteRecheckSec: 1.5,
  /** full-screen overlays are drawn this far past every edge so screen shake never reveals an un-veiled strip */
  shakeMargin: 32,
};

/** per-row / per-chunk prop counts scale with the playfield width so wide (desktop) screens are as busy as 480 */
const WS = X_SCALE;
/** number of lateral bands for chunked props (clouds, shadows): 1 on the 480 field */
const BANDS = Math.max(1, Math.round(X_SCALE));
/**
 * Motion calm factor for wide fields: 1 on 480, ~0.56 at 1520. Moving / flickering elements scale their COUNT by
 * WS * CALM (= sqrt(X_SCALE)) instead of WS, and relative parallax speeds by CALM: more width never means more flicker.
 */
const CALM = 1 / Math.sqrt(Math.max(1, X_SCALE));

// ------------------------------------------------------------------ reduced motion hook
let reducedMotion = false;
try {
  reducedMotion = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
} catch {
  reducedMotion = false;
}
/**
 * Settings-independent "reduced motion" switch (the UI may call it from a setting; defaults to the OS
 * `prefers-reduced-motion`). When on: animated tiles freeze, water/river glints are static, clouds barely drift,
 * decor animation stops, weather particle counts drop.
 */
export function setReducedMotion(v: boolean): void {
  reducedMotion = !!v;
}
export function isReducedMotion(): boolean {
  return reducedMotion;
}

/** strength of the grid-breaking patches per biome (bright biomes need less) */
const PATCH_STRENGTH: Record<Biome, number> = { ocean: 1, jungle: 0.6, desert: 0.3, arctic: 0.25, citadel: 0.5 };

const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// ------------------------------------------------------------------ helpers
export function hash2(a: number, b: number, seed = 0): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hexToRgb(hex: string): RGB {
  const s = hex.replace("#", "");
  const n = parseInt(s.length === 3 ? s.replace(/(.)/g, "$1$1") : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const shade = (a: RGB, f: number): RGB => [Math.min(255, Math.round(a[0] * f)), Math.min(255, Math.round(a[1] * f)), Math.min(255, Math.round(a[2] * f))];

/** jungle river / arctic lead centre line in world space (also used to snap boats onto the river) */
const RIVER_AMP = 100 + (GAME_W - DESIGN_W) * 0.12;
export function riverX(wy: number): number {
  return GAME_W / 2 + RIVER_AMP * Math.sin(wy / 700) + 28 * Math.sin(wy / 230 + 1.3);
}
export function riverW(wy: number): number {
  return 104 + 22 * Math.sin(wy / 410 + 0.7);
}
/** the arctic open-water lead is drawn narrower than the jungle river */
export const ICY_RIVER_W = 0.75;
/** biomes whose naval units ride the river / lead (round 6, #12) */
export function hasRiver(biome: string): boolean {
  return biome === "jungle" || biome === "arctic";
}
/** half width of the DRAWN water at world-y `wy` (jungle river or arctic lead; banks excluded) */
export function waterHalfW(biome: string, wy: number): number {
  return (riverW(wy) * (biome === "arctic" ? ICY_RIVER_W : 1)) / 2;
}

interface Feature {
  kind: FeatureKind;
  x: number;
  wy0: number;
  wy1: number;
}

/** biome look: derived from the chapter palette + a few biome constants */
interface Style {
  base: RGB;
  mottle: RGB;
  dark: RGB;
  light: RGB;
  accent: RGB;
  water: RGB;
  bank: RGB;
  cloud: RGB;
  cloudAmt: number; // 0..1 density of high clouds
  shadowAmt: number;
  decoPerChunk: number;
  /** darkening veil over ground art (0..1) and its colour */
  dim: number;
  dimColor: RGB;
}

/** veil over the tile art per biome (tuning: raise if bullets get lost on bright ground) */
export const BIOME_DIM: Record<Biome, { amt: number; color: RGB }> = {
  ocean: { amt: 0.08, color: [5, 20, 40] },
  jungle: { amt: 0.14, color: [8, 22, 10] },
  desert: { amt: 0.3, color: [45, 28, 12] },
  arctic: { amt: 0.4, color: [20, 34, 58] },
  citadel: { amt: 0, color: [0, 0, 0] },
};

function styleFor(biome: Biome, p: ChapterDef["palette"]): Style {
  const s = baseStyle(biome, p);
  const d = BIOME_DIM[biome] ?? BIOME_DIM.ocean;
  return { ...s, dim: d.amt, dimColor: d.color };
}

function baseStyle(biome: Biome, p: ChapterDef["palette"]): Omit<Style, "dim" | "dimColor"> {
  const bg = hexToRgb(p.bg);
  const mid = hexToRgb(p.mid);
  const accent = hexToRgb(p.accent);
  switch (biome) {
    case "ocean":
      return { base: bg, mottle: mid, dark: shade(bg, 0.78), light: mix(mid, [200, 230, 255], 0.25), accent, water: bg, bank: [138, 125, 90], cloud: [235, 245, 255], cloudAmt: 0.75, shadowAmt: 0.16, decoPerChunk: 0.55 };
    case "jungle":
      return { base: bg, mottle: mid, dark: shade(bg, 0.7), light: mix(mid, [140, 200, 90], 0.25), accent, water: [30, 72, 78], bank: [74, 66, 42], cloud: [220, 240, 220], cloudAmt: 0.45, shadowAmt: 0.18, decoPerChunk: 1.6 };
    case "desert":
      return { base: bg, mottle: mid, dark: shade(bg, 0.8), light: mix(mid, [220, 190, 130], 0.18), accent, water: [70, 90, 92], bank: shade(bg, 0.85), cloud: [245, 230, 200], cloudAmt: 0.2, shadowAmt: 0.14, decoPerChunk: 1.1 };
    case "arctic":
      return { base: bg, mottle: mid, dark: [24, 34, 48], light: mix(mid, [220, 235, 250], 0.22), accent, water: [22, 32, 46], bank: mix(mid, [230, 240, 255], 0.3), cloud: [240, 248, 255], cloudAmt: 0.6, shadowAmt: 0.16, decoPerChunk: 1.2 };
    case "citadel":
    default:
      return { base: bg, mottle: mid, dark: shade(bg, 0.6), light: mix(mid, [150, 160, 180], 0.25), accent, water: [10, 12, 16], bank: [44, 48, 58], cloud: [60, 60, 70], cloudAmt: 0.35, shadowAmt: 0.22, decoPerChunk: 1.3 };
  }
}

// ------------------------------------------------------------------ renderer
export class BiomeBackground implements BackgroundRenderer {
  readonly biome: Biome;
  /** current weather, set by the LevelRunner each step */
  weatherKind: "none" | "sandstorm" | "blizzard" = "none";
  weatherAmt = 0;
  /** effective wind (for streak / snow drift direction) */
  wind = 0;

  private st: Style;
  private features: Feature[] = [];
  private k: KAPLAYCtx | null = null;
  private pv!: Vec2;
  private ro!: DrawRectOpt;
  private eo!: DrawEllipseOpt;
  private so!: DrawSpriteOpt;
  private c = new Map<string, Color>();
  private sprites = new Map<string, SpriteData | null>();
  private spriteCheckAt = 0;
  private hasTiles = false;
  private decoKeys: string[] = [];
  private cloudKeys: string[] = [];
  private tileA = "";
  private tileB = "";
  /** round 6: citadel base layout (shared with the runner, which snaps structures onto its plots) */
  private cit: CitadelLayout | null;
  private citKit = false;

  constructor(chapter: ChapterDef, features: Array<{ kind: FeatureKind; x: number; wy0: number; wy1: number }> = [], citadel: CitadelLayout | null = null) {
    this.biome = chapter.biome;
    this.cit = chapter.biome === "citadel" ? (citadel ?? new CitadelLayout()) : null;
    this.st = styleFor(chapter.biome, chapter.palette);
    this.features = features.map((f) => ({ ...f }));
    this.tileA = `bgtile_${this.biome}_a`;
    this.tileB = `bgtile_${this.biome}_b`;
    for (let i = 1; i <= 8; i++) this.decoKeys.push(`bgdeco_${this.biome}_${i}`);
    for (let i = 1; i <= 3; i++) this.cloudKeys.push(`bgcloud_${i}`);
  }

  // ------------------------------------------------------------------ setup / caches
  private init(k: KAPLAYCtx): void {
    this.k = k;
    this.pv = k.vec2(0, 0);
    this.ro = { pos: this.pv, width: 1, height: 1, color: k.rgb(255, 255, 255), opacity: 1, anchor: "topleft" };
    this.eo = { pos: this.pv, radiusX: 1, radiusY: 1, color: k.rgb(255, 255, 255), opacity: 1 };
    this.so = { sprite: "", pos: this.pv, frame: 0, scale: PIXEL_SCALE, opacity: 1, anchor: "center" };
    const s = this.st;
    const reg = (n: string, rgb: RGB) => this.c.set(n, k.rgb(rgb[0], rgb[1], rgb[2]));
    reg("base", s.base);
    reg("mottle", s.mottle);
    reg("dark", s.dark);
    reg("light", s.light);
    reg("accent", s.accent);
    reg("water", s.water);
    reg("waterLight", mix(s.water, [180, 220, 230], 0.18));
    reg("bank", s.bank);
    reg("cloud", s.cloud);
    reg("black", [0, 0, 0]);
    reg("white", [255, 255, 255]);
    reg("dim", s.dimColor);
    reg("sand", [214, 176, 112]);
    reg("sandDark", [120, 84, 44]);
    reg("sandLight", [255, 238, 200]);
    reg("dust", [176, 118, 58]);
    reg("snow", [240, 248, 255]);
    reg("road", mix(s.base, [70, 70, 70], 0.6));
    reg("roadLine", mix(s.base, [220, 210, 160], 0.45));
    reg("rail", mix(s.base, [160, 160, 170], 0.55));
    reg("sleeper", mix(s.base, [60, 45, 30], 0.6));
    reg("green1", mix(s.base, [20, 50, 22], 0.55));
    reg("green2", mix(s.mottle, [60, 110, 50], 0.35));
    reg("green3", mix(s.mottle, [90, 140, 60], 0.3));
    reg("island", [120, 112, 80]);
    reg("islandGreen", [44, 82, 46]);
    reg("reef", mix(s.base, [40, 110, 130], 0.35));
    reg("ice", mix(s.mottle, [200, 220, 240], 0.3));
    reg("iceDark", mix(s.base, [20, 30, 45], 0.4));
    reg("rock", mix(s.base, [50, 38, 26], 0.5));
    reg("dune", mix(s.mottle, [200, 165, 105], 0.22));
    reg("metal", mix(s.mottle, [70, 76, 90], 0.4));
    reg("pipe", mix(s.base, [62, 66, 78], 0.6));
    this.refreshSprites(0, true);
  }

  private col(name: string): Color {
    return this.c.get(name)!;
  }

  private spr(key: string): SpriteData | null {
    return this.sprites.get(key) ?? null;
  }

  /** sprites load asynchronously; re-check missing keys every few seconds (cheap Map lookups otherwise) */
  private refreshSprites(time: number, force = false): void {
    if (!force && time < this.spriteCheckAt) return;
    this.spriteCheckAt = time + BG_TUNING.spriteRecheckSec;
    const k = this.k!;
    const check = (key: string) => {
      if (this.sprites.get(key)) return;
      let d: SpriteData | null = null;
      try {
        d = k.getSprite(key)?.data ?? null;
      } catch {
        d = null;
      }
      this.sprites.set(key, d);
    };
    check(this.tileA);
    check(this.tileB);
    for (const key of this.decoKeys) check(key);
    for (const key of this.cloudKeys) check(key);
    if (this.cit) {
      for (const key of CIT_KEYS) check(key);
      this.citKit = !!this.sprites.get("cit_floor_concrete") && !!this.sprites.get("cit_wall_v") && !!this.sprites.get("cit_road_h");
    }
    this.hasTiles = !!this.sprites.get(this.tileA);
  }

  // ------------------------------------------------------------------ primitives (no allocation)
  private rect(x: number, y: number, w: number, h: number, c: Color, op = 1): void {
    const o = this.ro;
    this.pv.x = Math.round(x);
    this.pv.y = Math.round(y);
    o.width = Math.max(1, Math.round(w));
    o.height = Math.max(1, Math.round(h));
    o.color = c;
    o.opacity = op;
    this.k!.drawRect(o);
  }
  private ell(x: number, y: number, rx: number, ry: number, c: Color, op = 1): void {
    const o = this.eo;
    this.pv.x = Math.round(x);
    this.pv.y = Math.round(y);
    o.radiusX = rx;
    o.radiusY = ry;
    o.color = c;
    o.opacity = op;
    this.k!.drawEllipse(o);
  }
  private sprite(data: SpriteData, x: number, y: number, frame: number, op = 1, angle = 0, scale: number = PIXEL_SCALE, flipX = false, flipY = false): void {
    const o = this.so;
    o.sprite = data;
    this.pv.x = Math.round(x);
    this.pv.y = Math.round(y);
    o.frame = frame;
    o.opacity = op;
    o.angle = angle;
    o.scale = scale;
    o.flipX = flipX;
    o.flipY = flipY;
    this.k!.drawSprite(o);
  }

  // ================================================================== back
  drawBack(k: KAPLAYCtx, scrollY: number, time: number): void {
    if (this.k !== k) this.init(k);
    this.refreshSprites(time);
    const sY = Math.round(scrollY);
    // oversized base fill: screen shake never exposes the canvas clear colour at the edges.
    // Skipped when tiles are loaded (they are opaque and drawn with a one-tile margin): one less full-screen fill pass.
    if (this.cit) {
      // round 6 (#11): the citadel draws its own base layout (floors, runway, roads, walls, pads) instead of tiles
      this.drawCitadel(sY);
      this.drawFeatures(sY);
      this.drawCloudShadows(scrollY);
      return;
    }
    if (!this.hasTiles) this.rect(-24, -24, GAME_W + 48, GAME_H + 48, this.col("base"));
    if (this.hasTiles) {
      this.drawTiles(sY, time);
      // flatten the animated water art toward its own base colour: lower-contrast shimmer (islands / decor stay crisp)
      const veil = BG_TUNING.waterVeil[this.biome] ?? 0;
      if (veil > 0) this.fullRect(this.col("base"), veil * (reducedMotion ? 1.3 : 1));
      this.drawPatches(sY, time);
    } else this.drawMottle(sY);
    this.drawDetail(sY, time);
    this.drawFeatures(sY);
    this.drawDecor(sY, time);
    // keep bright biomes (sand, snow) low-contrast so bright bullets always pop.
    // Oversized: under screen shake a GAME_W x GAME_H veil would leave an un-dimmed (bright) strip at the top/left edge.
    if (this.hasTiles && this.st.dim > 0) this.fullRect(this.col("dim"), this.st.dim);
    this.drawCloudShadows(scrollY);
  }

  /** full-screen overlay with the shake margin on every side */
  private fullRect(c: Color, op: number): void {
    const m = BG_TUNING.shakeMargin;
    this.rect(-m, -m, GAME_W + 2 * m, GAME_H + 2 * m, c, op);
  }

  /** deterministic _b placement: hashed chance, and never directly next to / above another _b tile */
  private isB(c: number, r: number, chance: number): boolean {
    if (hash2(c, r, 11) >= chance) return false;
    return hash2(c - 1, r, 11) >= chance && hash2(c, r - 1, 11) >= chance;
  }

  private drawTiles(sY: number, time: number): void {
    const T = BG_TUNING.tile;
    const a = this.spr(this.tileA)!;
    const b = this.spr(this.tileB);
    const chance = b ? (BG_TUNING.tileBChanceBy[this.biome] ?? BG_TUNING.tileBChance) : 0;
    // ONE frame clock for every animated tile (neighbours always agree), slow, with an eased cross-fade into the next frame.
    const P = BG_TUNING.tileFramePeriod;
    const clock = reducedMotion ? 0 : time / P;
    const step = Math.floor(clock);
    const fadeLen = BG_TUNING.tileFade;
    const fade = reducedMotion || fadeLen <= 0 ? 0 : smooth((clock - step - (1 - fadeLen)) / fadeLen);
    // one tile of margin on every side (covers screen-shake offsets; tiles replace the base fill)
    const r0 = Math.floor((sY - GAME_H) / T) - 1;
    const r1 = Math.floor(sY / T) + 1;
    const cols = Math.ceil(GAME_W / T);
    for (let r = r0; r <= r1; r++) {
      const y = sY - (r + 1) * T + T / 2;
      for (let cI = -1; cI <= cols; cI++) {
        const d = chance > 0 && this.isB(cI, r, chance) ? b! : a;
        const n = d.frames.length;
        const x = cI * T + T / 2;
        if (n <= 1) {
          this.sprite(d, x, y, 0);
          continue;
        }
        const f = step % n;
        this.sprite(d, x, y, f);
        if (fade > 0.01) this.sprite(d, x, y, (f + 1) % n, fade);
      }
    }
  }

  /**
   * Large world-anchored light / dark patches over the tiles: breaks up the visible 128-unit grid on wide screens and
   * gives the sea a gentle large-scale brightness drift (each patch breathes over ~30 s; frozen with reduced motion).
   */
  private drawPatches(sY: number, time: number): void {
    const C = BG_TUNING.patchChunk;
    const r0 = Math.floor((sY - GAME_H - 260) / C);
    const r1 = Math.floor((sY + 260) / C);
    const lt = this.col("light");
    const dk = this.col("dark");
    const base = BG_TUNING.patchOpacity * (PATCH_STRENGTH[this.biome] ?? 0.5);
    const per = Math.max(1, Math.round(1.3 * WS));
    const sp = reducedMotion ? 0 : BG_TUNING.patchDriftSpeed;
    for (let r = r0; r <= r1; r++) {
      for (let i = 0; i < per; i++) {
        const h = hash2(r, i, 111);
        const x = ((i + hash2(i, r, 112)) / per) * (GAME_W + 200) - 100;
        const y = sY - (r * C + hash2(r, i, 113) * C);
        const rx = 130 + h * 150;
        const drift = 0.65 + 0.35 * Math.sin(time * sp + h * 40);
        const ry = rx * (0.45 + 0.25 * hash2(i, r, 114));
        const c = h < 0.5 ? dk : lt;
        const op = base * drift * (h < 0.5 ? 1.2 : 0.7) * 0.5;
        // two nested ellipses = soft-edged patch
        this.ell(x, y, rx, ry, c, op);
        this.ell(x, y, rx * 0.62, ry * 0.62, c, op);
      }
    }
  }

  private drawMottle(sY: number): void {
    const C = BG_TUNING.mottleCell;
    const r0 = Math.floor((sY - GAME_H) / C);
    const r1 = Math.floor(sY / C);
    const cols = Math.ceil(GAME_W / C);
    const m = this.col("mottle");
    const d = this.col("dark");
    for (let r = r0; r <= r1; r++) {
      const y = sY - (r + 1) * C;
      for (let cI = 0; cI < cols; cI++) {
        const h = hash2(cI, r, 3);
        if (h < 0.3) this.rect(cI * C, y, C, C, m, 0.2 + h * 0.6);
        else if (h > 0.9) this.rect(cI * C, y, C, C, d, 0.25);
      }
    }
  }

  // ------------------------------------------------------------------ biome detail
  private drawDetail(sY: number, time: number): void {
    switch (this.biome) {
      case "ocean":
        return this.drawWaves(sY, time, 1);
      case "jungle":
        return this.drawRiver(sY, time, false);
      case "desert":
        return this.drawDunes(sY);
      case "arctic":
        return this.drawRiver(sY, time, true);
      case "citadel":
        return this.drawPanels(sY, time);
    }
  }

  /** animated water: hashed glints whose opacity breathes with time (no sprite needed) */
  private drawWaves(sY: number, time: number, amt: number): void {
    const C = 64;
    const r0 = Math.floor((sY - GAME_H) / C);
    const r1 = Math.floor(sY / C);
    const lt = this.col("light");
    const dk = this.col("dark");
    // fewer glints per unit of width on wide fields (sqrt scaling), slow low-contrast breathing, no lateral jitter
    const per = Math.max(3, Math.round(4 * WS * CALM));
    const darkPer = Math.max(2, Math.round(2 * WS * CALM));
    for (let r = r0; r <= r1; r++) {
      for (let i = 0; i < per; i++) {
        const h = hash2(r, i, 21);
        // stratified across the width so the glints never clump
        const x = ((i + hash2(i, r, 22)) / per) * GAME_W;
        const y = sY - (r * C + hash2(r, i, 23) * C);
        const w = 8 + h * 16;
        const ph = reducedMotion ? 0 : Math.sin(time * 0.7 + h * 12.3);
        const op = (0.13 + 0.06 * ph) * amt;
        this.rect(x, y, w, 2, lt, op);
        if (i < darkPer) this.rect(x - 10, y + 6, w * 1.4, 3, dk, 0.18 * amt);
      }
    }
  }

  /** jungle river (or arctic open-water lead) following riverX() in world space */
  private drawRiver(sY: number, time: number, icy: boolean): void {
    const step = 8;
    const water = this.col("water");
    const bank = this.col("bank");
    const wl = this.col("waterLight");
    const m = BG_TUNING.shakeMargin;
    for (let y = -m; y < GAME_H + m; y += step) {
      const wy = sY - y;
      const cx = riverX(wy);
      const w = riverW(wy) * (icy ? ICY_RIVER_W : 1);
      this.rect(cx - w / 2 - 7, y, w + 14, step + 1, bank, icy ? 0.55 : 0.9);
      this.rect(cx - w / 2, y, w, step + 1, water, 1);
    }
    // flowing glints
    const C = 48;
    const r0 = Math.floor((sY - GAME_H) / C);
    const r1 = Math.floor(sY / C);
    for (let r = r0; r <= r1; r++) {
      for (let i = 0; i < 2; i++) {
        const wy = r * C + hash2(r, i, 31) * C;
        // calm flow: slower drift, softer glints (static with reduced motion)
        const flow = icy || reducedMotion ? 0 : (time * 14) % C;
        const y = sY - wy + flow;
        const cx = riverX(wy);
        const w = riverW(wy) * (icy ? ICY_RIVER_W : 1);
        const x = cx + (hash2(i, r, 32) - 0.5) * (w - 20);
        // fade in/out over the flow cycle so a glint never pops when the modulo wraps
        const life = icy || reducedMotion ? 1 : Math.sin((Math.PI * flow) / C);
        this.rect(x, y, icy ? 14 : 10, 2, wl, 0.3 * life);
      }
    }
  }

  private drawDunes(sY: number): void {
    const C = 120;
    const r0 = Math.floor((sY - GAME_H - 60) / C);
    const r1 = Math.floor((sY + 60) / C);
    const dune = this.col("dune");
    const dk = this.col("dark");
    const per = Math.round(3 * WS);
    for (let r = r0; r <= r1; r++) {
      for (let i = 0; i < per; i++) {
        const h = hash2(r, i, 41);
        const x = hash2(i, r, 42) * (GAME_W + 120) - 60;
        const y = sY - (r * C + h * C);
        const rx = 60 + h * 70;
        this.ell(x + 4, y + 7, rx, 16 + h * 8, dk, 0.22);
        this.ell(x, y, rx, 14 + h * 8, dune, 0.55);
      }
    }
  }

  private drawPanels(sY: number, time: number): void {
    const C = 96;
    const r0 = Math.floor((sY - GAME_H) / C);
    const r1 = Math.floor(sY / C);
    const line = this.col("dark");
    const metal = this.col("metal");
    const acc = this.col("accent");
    const cols = Math.ceil(GAME_W / C);
    const m = BG_TUNING.shakeMargin;
    // fewer blinking lights per unit of width on wide fields
    const blinkAt = 1 - 0.28 * CALM;
    for (let r = r0; r <= r1; r++) {
      const y = sY - (r + 1) * C;
      this.rect(-m, y, GAME_W + 2 * m, 2, line, 0.8);
      for (let cI = 0; cI < cols; cI++) {
        const h = hash2(cI, r, 51);
        this.rect(cI * C, y, 2, C, line, 0.8);
        if (h < 0.35) this.rect(cI * C + 8, y + 8, C - 16, C - 16, metal, 0.35);
        if (h > blinkAt) {
          // slow-breathing status light (steady with reduced motion)
          const op = reducedMotion ? 0.3 : 0.25 + 0.18 * Math.sin(time * (0.8 + h * 1.2) + h * 20);
          this.rect(cI * C + 6, y + 6, 4, 4, acc, Math.max(0, op));
        }
      }
    }
    // long pipes (world-anchored lanes)
    const pipe = this.col("pipe");
    const lanes = Math.floor((GAME_W - 60) / 190) + 1;
    for (let lane = 0; lane < lanes; lane++) {
      const x = 40 + lane * 190 + (lane % 2 === 1 ? 10 : 0);
      this.rect(x, -m, 10, GAME_H + 2 * m, pipe, 0.75);
      const J = 140;
      const j0 = Math.floor((sY - GAME_H) / J);
      for (let j = j0; j <= Math.floor(sY / J); j++) this.rect(x - 3, sY - j * J, 16, 6, metal, 0.8);
    }
  }

  // ------------------------------------------------------------------ citadel base (round 6, #11)
  /**
   * The Iron Citadel as one coherent base (geometry in citadel.ts): floor tiles per plot (concrete / steel deck),
   * the runway down the middle, pipe runs inside the perimeter walls, cross roads and compound walls every block,
   * avenues on wide fields, helipads, and a foundation pad under every placed structure. Kit sprites (`cit_*`) when
   * loaded, palette rects otherwise. About 60-150 sprites per frame, nothing allocated.
   */
  private drawCitadel(sY: number): void {
    const L = this.cit!;
    const T = CIT.tile;
    const kit = this.citKit;
    const cx = L.cx;
    const m = BG_TUNING.shakeMargin;
    const r0 = Math.floor((sY - GAME_H - m) / T) - 1;
    const r1 = Math.floor((sY + m) / T) + 1;
    const nc = Math.ceil((GAME_W / 2 + m) / T);
    const A = L.avenue;
    // 1. floors: one tile per 128 cell; the plot (side, plot, block) picks concrete or steel deck
    const conc = this.spr("cit_floor_concrete");
    const steel = this.spr("cit_floor_steel");
    if (!kit) this.rect(-m, -m, GAME_W + 2 * m, GAME_H + 2 * m, this.col("base"));
    for (let r = r0; r <= r1; r++) {
      const y = sY - (r * T + T / 2);
      const j = Math.floor((r * T) / CIT.block);
      for (let c = -nc; c < nc; c++) {
        const side = c >= 0 ? 1 : -1;
        const k = c >= 0 ? c : -c - 1; // 0 = next to the runway
        const plot = k - 1 > L.M - 1 ? -1 : A >= 0 && k - 1 >= A ? 1 : 0;
        const deck = plot >= 0 && hash2(j * 3 + plot, side, 907) < 0.45;
        const x = cx + c * T + T / 2;
        if (kit) this.sprite(deck && steel ? steel : conc!, x, y, 0);
        else if (deck) this.rect(x - T / 2, y - T / 2, T, T, this.col("metal"), 0.35);
      }
    }
    // 2. runway (the flying lane)
    const rw = this.spr("cit_runway_v");
    for (let r = r0; r <= r1; r++) {
      const y = sY - (r * T + T / 2);
      if (kit && rw) this.sprite(rw, cx, y, 0);
      else {
        this.rect(cx - CIT.runwayHalf, y - T / 2, CIT.runwayHalf * 2, T + 1, this.col("road"), 1);
        this.rect(cx - CIT.runwayHalf + 6, y - T / 2, 3, T + 1, this.col("light"), 0.5);
        this.rect(cx + CIT.runwayHalf - 9, y - T / 2, 3, T + 1, this.col("light"), 0.5);
        if (r % 2 === 0) this.rect(cx - 2, y - 30, 4, 40, this.col("light"), 0.45);
      }
    }
    // 3. pipe runs along the inside of both perimeter walls (roads and walls are drawn over their ends)
    const pipe = this.spr("cit_pipe_v");
    for (let side = -1; side <= 1; side += 2) {
      const px = L.latX(side, L.M) - side * (CIT.wallHalf + CIT.pipeBand / 2 + 2);
      for (let r = r0; r <= r1; r++) {
        const y = sY - (r * T + T / 2);
        if (kit && pipe) this.sprite(pipe, px, y, 0);
        else {
          this.rect(px - 12, y - T / 2, 9, T + 1, this.col("pipe"), 0.9);
          this.rect(px + 3, y - T / 2, 9, T + 1, this.col("pipe"), 0.9);
        }
      }
    }
    // 4. helipads (deterministic per plot block; the runner keeps structures off them)
    const heli = this.spr("cit_helipad");
    const j0 = Math.floor((sY - GAME_H - m - CIT.block) / CIT.block);
    const j1 = Math.floor((sY + m) / CIT.block) + 1;
    for (let j = j0; j <= j1; j++) {
      const hy = sY - L.helipadWy(j);
      if (hy < -80 || hy > GAME_H + 80) continue;
      for (let side = -1; side <= 1; side += 2) {
        for (let p = 0; p < L.plots.length; p++) {
          const hx = L.helipadX(side, p, j);
          if (Number.isNaN(hx)) continue;
          if (kit && heli) this.sprite(heli, hx, hy, 0);
          else {
            this.ell(hx, hy, 44, 44, this.col("dark"), 0.8);
            this.ell(hx, hy, 36, 36, this.col("accent"), 0.35);
            this.rect(hx - 12, hy - 14, 5, 28, this.col("light"), 0.8);
            this.rect(hx + 7, hy - 14, 5, 28, this.col("light"), 0.8);
            this.rect(hx - 7, hy - 2, 14, 4, this.col("light"), 0.8);
          }
        }
      }
    }
    // 5. vertical lines: avenue (road) and perimeter wall, one piece per 128 lattice row
    for (let side = -1; side <= 1; side += 2) {
      const wx = L.latX(side, L.M);
      const ax = A >= 0 ? L.latX(side, A) : 0;
      for (let r = r0; r <= r1; r++) {
        const y = sY - r * T;
        const node = r % 3 === 0;
        const roadNode = node && L.isRoadLine(Math.floor(r / 3));
        if (A >= 0) this.citPiece(roadNode ? "cit_road_cross" : "cit_road_v", ax, y, 0, false, false);
        if (node) continue; // the horizontal pass draws the wall junction / road gate at line nodes
        const below = (r - 1) % 3 === 0 && L.isRoadLine(Math.floor((r - 1) / 3));
        const above = (r + 1) % 3 === 0 && L.isRoadLine(Math.floor((r + 1) / 3));
        if (below) this.citPiece("cit_wall_end", wx, y, 0, false, true); // above a road gate: continues N
        else if (above) this.citPiece("cit_wall_end", wx, y, 0, false, false); // below a road gate: continues S
        else this.citPiece("cit_wall_v", wx, y, 0, false, false);
      }
    }
    // 6. horizontal lines: cross roads (even j, through the perimeter gates) and compound walls (odd j)
    for (let j = j0; j <= j1; j++) {
      const y = sY - j * CIT.block;
      if (y < -T || y > GAME_H + T) continue;
      const road = L.isRoadLine(j);
      for (let side = -1; side <= 1; side += 2) {
        for (let mi = 0; mi <= L.M + 1; mi++) {
          const x = L.latX(side, mi);
          if (x < -T || x > GAME_W + T) continue;
          if (road) {
            if (mi !== A) this.citPiece("cit_road_h", x, y, 0, false, false);
            continue;
          }
          if (mi > L.M || mi === A) continue;
          // wall pieces: end caps facing the runway (and the avenue from outside), a T into the perimeter wall; the inner
          // segment runs into the avenue kerb
          const capOut = mi === 0 || (A >= 0 && mi === A + 1);
          const capIn = A >= 0 && mi === A - 1;
          if (mi === L.M) this.citPiece("cit_wall_tv", x, y, 0, side > 0, false);
          else if (capOut) this.citPiece("cit_wall_end", x, y, side > 0 ? -90 : 90, false, false);
          else if (capIn) {
            // round 7 (QA R6-5): the inner compound wall used to stop with an end cap 88 u short of the avenue and read
            // as a free-standing bar; it now runs on until it meets the avenue kerb (T-joint into the road)
            this.citPiece("cit_wall_h", x, y, 0, false, false);
            this.citPiece("cit_wall_h", x + side * (T / 2 - CIT.roadHalf), y, 0, false, false);
          }
          else this.citPiece("cit_wall_h", x, y, 0, false, false);
        }
      }
    }
    // 7. foundation pads under placed structures
    for (let i = 0; i < L.padN; i++) {
      const y = sY - L.pwy[i]!;
      const hh = L.phh[i]!;
      if (y < -hh - 4 || y > GAME_H + hh + 4) continue;
      const x = L.px[i]!;
      const d = kit ? this.spr(PAD_KEYS[L.pkind[i]!]!) : null;
      if (d) this.sprite(d, x, y, 0);
      else {
        const hw = L.phw[i]!;
        this.rect(x - hw, y - hh, hw * 2, hh * 2, this.col("dark"), 0.9);
        this.rect(x - hw + 4, y - hh + 4, hw * 2 - 8, hh * 2 - 8, this.col("metal"), 0.85);
      }
    }
  }

  /** one kit piece (128 units, centred); palette-rect fallback without the kit */
  private citPiece(key: CitKey, x: number, y: number, angle: number, flipX: boolean, flipY: boolean): void {
    if (y < -CIT.tile || y > GAME_H + CIT.tile) return;
    const d = this.citKit ? this.spr(key) : null;
    if (d) {
      this.sprite(d, x, y, 0, 1, angle, PIXEL_SCALE, flipX, flipY);
      return;
    }
    const T = CIT.tile;
    const roadC = this.col("road");
    const wallC = this.col("dark");
    const lineC = this.col("roadLine");
    const wh = CIT.wallHalf;
    switch (key) {
      case "cit_road_h":
        this.rect(x - T / 2, y - CIT.roadHalf, T, CIT.roadHalf * 2, roadC, 1);
        this.rect(x - 20, y - 2, 40, 4, lineC, 0.6);
        break;
      case "cit_road_v":
        this.rect(x - CIT.roadHalf, y - T / 2, CIT.roadHalf * 2, T, roadC, 1);
        this.rect(x - 2, y - 20, 4, 40, lineC, 0.6);
        break;
      case "cit_road_cross":
        this.rect(x - T / 2, y - CIT.roadHalf, T, CIT.roadHalf * 2, roadC, 1);
        this.rect(x - CIT.roadHalf, y - T / 2, CIT.roadHalf * 2, T, roadC, 1);
        break;
      case "cit_wall_h":
        this.rect(x - T / 2, y - wh, T, wh * 2, wallC, 1);
        break;
      case "cit_wall_v":
        this.rect(x - wh, y - T / 2, wh * 2, T, wallC, 1);
        break;
      case "cit_wall_tv":
        this.rect(x - wh, y - T / 2, wh * 2, T, wallC, 1);
        this.rect(flipX ? x - T / 2 : x, y - wh, T / 2, wh * 2, wallC, 1);
        break;
      case "cit_wall_end":
        if (angle === 0) this.rect(x - wh, flipY ? y - T / 2 : y - wh, wh * 2, T / 2 + wh, wallC, 1);
        else this.rect(angle < 0 ? x - wh : x - T / 2, y - wh, T / 2 + wh, wh * 2, wallC, 1);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ set-piece features
  private drawFeatures(sY: number): void {
    for (let i = 0; i < this.features.length; i++) {
      const f = this.features[i]!;
      // citadel: convoys drive on the runway / avenues, which are already roads
      if (this.cit && f.kind === "road") continue;
      const yBottom = sY - f.wy0; // bottom end on screen
      const yTop = sY - f.wy1;
      if (yTop > GAME_H || yBottom < 0) continue;
      const top = Math.max(-8, yTop);
      const bot = Math.min(GAME_H + 8, yBottom);
      const h = bot - top;
      switch (f.kind) {
        case "road":
        case "runway": {
          const w = f.kind === "road" ? 40 : 76;
          this.rect(f.x - w / 2 - 3, top, w + 6, h, this.col("dark"), 0.4);
          this.rect(f.x - w / 2, top, w, h, this.col("road"), 0.85);
          // dashes, world-anchored
          const D = 40;
          for (let wy = Math.ceil(f.wy0 / D) * D; wy < f.wy1; wy += D) {
            const y = sY - wy;
            if (y < -20 || y > GAME_H + 20) continue;
            this.rect(f.x - 2, y, 4, 18, this.col("roadLine"), 0.6);
          }
          break;
        }
        case "rail": {
          const S = 18;
          for (let wy = Math.ceil(f.wy0 / S) * S; wy < f.wy1; wy += S) {
            const y = sY - wy;
            if (y < -10 || y > GAME_H + 10) continue;
            this.rect(f.x - 20, y, 40, 5, this.col("sleeper"), 0.8);
          }
          this.rect(f.x - 14, top, 3, h, this.col("rail"), 0.9);
          this.rect(f.x + 11, top, 3, h, this.col("rail"), 0.9);
          break;
        }
        case "bridge": {
          this.rect(f.x - 60, top, 120, h, this.col("road"), 0.9);
          this.rect(f.x - 64, top, 4, h, this.col("dark"), 0.9);
          this.rect(f.x + 60, top, 4, h, this.col("dark"), 0.9);
          break;
        }
      }
      // end caps (tunnel mouth / depot) so features never start in thin air
      if (yBottom > -12 && yBottom < GAME_H + 12) this.rect(f.x - 30, yBottom - 6, 60, 12, this.col("dark"), 0.85);
      if (yTop > -12 && yTop < GAME_H + 12) this.rect(f.x - 30, yTop - 6, 60, 12, this.col("dark"), 0.85);
    }
  }

  // ------------------------------------------------------------------ decor
  private drawDecor(sY: number, time: number): void {
    const C = BG_TUNING.decoChunk;
    const r0 = Math.floor((sY - GAME_H - 120) / C);
    const r1 = Math.floor((sY + 120) / C);
    const per = this.st.decoPerChunk;
    for (let r = r0; r <= r1; r++) {
      const n = Math.floor(per * WS + hash2(r, 7, 61));
      for (let i = 0; i < n; i++) {
        const h = hash2(r, i, 62);
        let x = 20 + hash2(i, r, 63) * (GAME_W - 40);
        const wy = r * C + hash2(r, i, 64) * C;
        const y = sY - wy;
        if (y < -120 || y > GAME_H + 120) continue;
        if (this.biome === "jungle" || this.biome === "arctic") {
          // keep props off the water
          const cx = riverX(wy);
          const half = riverW(wy) / 2 + 40;
          if (Math.abs(x - cx) < half) x = cx + (x < cx ? -half : half);
          if (x < -10 || x > GAME_W + 10) continue;
        }
        const idx = Math.floor(h * 8);
        const d = this.spr(this.decoKeys[idx]!);
        if (d) this.sprite(d, x, y, d.frames.length > 1 && !reducedMotion ? Math.floor(time * 1.5 + h * 8) % d.frames.length : 0, 0.92);
        else this.drawProcDecor(x, y, h);
      }
    }
  }

  private drawProcDecor(x: number, y: number, h: number): void {
    switch (this.biome) {
      case "ocean": {
        if (h < 0.45) {
          // small island
          const r = 22 + h * 70;
          this.ell(x, y, r + 8, (r + 8) * 0.7, this.col("light"), 0.12);
          this.ell(x, y, r, r * 0.7, this.col("island"), 0.85);
          this.ell(x - r * 0.1, y - r * 0.06, r * 0.72, r * 0.48, this.col("islandGreen"), 0.9);
        } else {
          // reef
          this.ell(x, y, 26 + h * 20, 12 + h * 8, this.col("reef"), 0.45);
        }
        break;
      }
      case "jungle": {
        const g1 = this.col("green1");
        const g2 = this.col("green2");
        const g3 = this.col("green3");
        const s = 0.7 + h * 0.8;
        this.ell(x + 6, y + 8, 30 * s, 24 * s, this.col("black"), 0.18);
        this.ell(x, y, 28 * s, 22 * s, g1, 0.95);
        this.ell(x - 9 * s, y - 5 * s, 16 * s, 14 * s, g2, 0.9);
        this.ell(x + 10 * s, y + 3 * s, 14 * s, 12 * s, g3, 0.7);
        break;
      }
      case "desert": {
        if (h < 0.5) {
          this.ell(x + 3, y + 4, 12 + h * 14, 8 + h * 8, this.col("black"), 0.15);
          this.ell(x, y, 11 + h * 14, 7 + h * 8, this.col("rock"), 0.85);
        } else {
          // dry scrub cluster
          for (let i = 0; i < 4; i++) this.ell(x + (i - 1.5) * 8, y + ((i * 7) % 5) - 2, 4, 3, this.col("dark"), 0.55);
        }
        break;
      }
      case "arctic": {
        const r = 18 + h * 40;
        this.ell(x + 4, y + 6, r, r * 0.55, this.col("iceDark"), 0.4);
        this.ell(x, y, r, r * 0.55, this.col("ice"), 0.6);
        break;
      }
      case "citadel": {
        if (h < 0.4) {
          // storage tank / vent
          this.ell(x, y, 22, 22, this.col("dark"), 0.9);
          this.ell(x, y, 16, 16, this.col("metal"), 0.7);
          this.ell(x, y, 5, 5, this.col("dark"), 0.9);
        } else {
          this.rect(x - 24, y - 14, 48, 28, this.col("metal"), 0.55);
          this.rect(x - 24, y - 14, 48, 3, this.col("dark"), 0.8);
        }
        break;
      }
    }
  }

  /**
   * Parallax factor relative to the ground, calmed on wide fields (the extra speed over the ground scales by CALM)
   * and almost removed with reduced motion.
   */
  private parallax(base: number): number {
    return 1 + (base - 1) * (reducedMotion ? 0.15 : CALM);
  }

  private drawCloudShadows(scrollY: number): void {
    const p = scrollY * this.parallax(BG_TUNING.cloudShadowParallax);
    const C = BG_TUNING.cloudChunk;
    const r0 = Math.floor((p - GAME_H - 200) / C);
    const r1 = Math.floor((p + 200) / C);
    const blk = this.col("black");
    const amt = this.st.shadowAmt;
    const bw = GAME_W / BANDS;
    for (let r = r0; r <= r1; r++) {
      for (let b = 0; b < BANDS; b++) {
        const h = hash2(r, 1 + b * 16, 71);
        if (h > this.st.cloudAmt + 0.15) continue;
        const x = b * bw + hash2(r, 2 + b * 16, 72) * bw;
        const y = p - (r * C + hash2(r, 3 + b * 16, 73) * C);
        this.ell(x, y, 90 + h * 60, 50 + h * 30, blk, amt * 0.6);
        this.ell(x + 50, y + 16, 60, 34, blk, amt * 0.5);
      }
    }
  }

  // ================================================================== front
  drawFront(k: KAPLAYCtx, scrollY: number, time: number): void {
    if (this.k !== k) this.init(k);
    this.drawClouds(scrollY);
    if (this.weatherAmt > 0.01) {
      if (this.weatherKind === "sandstorm") this.drawSandstorm(time);
      else if (this.weatherKind === "blizzard") this.drawBlizzard(time);
    }
  }

  private drawClouds(scrollY: number): void {
    const p = scrollY * this.parallax(BG_TUNING.cloudParallax);
    const C = BG_TUNING.cloudChunk;
    const r0 = Math.floor((p - GAME_H - 200) / C);
    const r1 = Math.floor((p + 200) / C);
    const amt = this.st.cloudAmt;
    const cc = this.col("cloud");
    const bw = (GAME_W + 100) / BANDS;
    for (let r = r0; r <= r1; r++) {
      for (let b = 0; b < BANDS; b++) {
        const h = hash2(r, 4 + b * 16, 81);
        if (h > amt) continue;
        const x = b * bw + hash2(r, 5 + b * 16, 82) * bw - 50;
        const y = p - (r * C + hash2(r, 6 + b * 16, 83) * C);
        const d = this.spr(this.cloudKeys[Math.floor(h * 3) % 3]!);
        if (d) this.sprite(d, x, y, 0, 0.3 - 0.06 * (1 - CALM));
        else {
          // soft, low-opacity puffs so bullets underneath stay readable
          this.ell(x, y, 70, 32, cc, 0.1);
          this.ell(x + 34, y - 10, 46, 26, cc, 0.1);
          this.ell(x - 30, y + 6, 40, 20, cc, 0.08);
        }
      }
    }
  }

  private drawSandstorm(time: number): void {
    const a = this.weatherAmt;
    const T = BG_TUNING;
    this.fullRect(this.col("dust"), T.maxSandOverlay * a);
    const dir = this.wind >= 0 ? 1 : -1;
    const n = Math.floor(T.sandStreaks * WS * a * (reducedMotion ? 0.35 : 1));
    const W = GAME_W + 120;
    const sc = this.col("sandLight");
    const sd = this.col("sandDark");
    for (let i = 0; i < n; i++) {
      const h = hash2(i, 1, 91);
      const sp = 260 + h * 260;
      let x = (hash2(i, 2, 92) * W + time * sp * dir) % W;
      if (x < 0) x += W;
      x -= 60;
      const y = (hash2(i, 3, 93) * GAME_H + time * (20 + h * 30)) % GAME_H;
      this.rect(x, y, 18 + h * 34, h > 0.6 ? 3 : 2, i % 3 === 0 ? sd : sc, (0.45 + 0.35 * h) * Math.min(1, a * 1.5));
    }
    // rolling dust banks
    const banks = Math.round(6 * WS);
    for (let i = 0; i < banks; i++) {
      const h = hash2(i, 4, 94);
      let x = (h * W + time * (90 + h * 60) * dir) % W;
      if (x < 0) x += W;
      const y = (hash2(i, 5, 95) * GAME_H + time * 12) % GAME_H;
      this.ell(x - 60, y, 160, 70, sd, 0.22 * a);
      this.ell(x - 20, y - 20, 90, 40, sc, 0.12 * a);
    }
  }

  private drawBlizzard(time: number): void {
    const a = this.weatherAmt;
    const T = BG_TUNING;
    const snow = this.col("snow");
    this.fullRect(snow, T.maxSnowOverlay * a);
    const n = Math.floor(T.snowFlakes * WS * a * (reducedMotion ? 0.35 : 1));
    const drift = 40 + this.wind * 1.4;
    for (let i = 0; i < n; i++) {
      const h = hash2(i, 1, 101);
      const fall = 90 + h * 120;
      let x = (hash2(i, 2, 102) * GAME_W + time * (drift + h * 30) + Math.sin(time * 2 + i) * 8) % GAME_W;
      if (x < 0) x += GAME_W;
      const y = (hash2(i, 3, 103) * GAME_H + time * fall) % GAME_H;
      const s = h > 0.7 ? 3 : 2;
      this.rect(x, y, s, s, snow, 0.55 + 0.35 * h);
    }
  }
}

// ================================================================== menu backdrop
/** a slowly scrolling, dimmed biome background for menu screens (see createMenuBackdrop in src/levels/index.ts) */
export interface MenuBackdrop {
  readonly biome: Biome;
  /** veil opacity over the background (0..1) so menu text stays readable */
  dim: number;
  /** scroll speed in units/s (quartered with reduced motion) */
  speed: number;
  /** draw the full backdrop; `t` = seconds (e.g. k.time()). Call first in the menu's onDraw. */
  draw(k: KAPLAYCtx, t: number): void;
}

export interface MenuBackdropOpts {
  dim?: number;
  speed?: number;
  /** draw the high cloud layer too (default true) */
  clouds?: boolean;
}

export function makeMenuBackdrop(chapter: ChapterDef, opts: MenuBackdropOpts = {}): MenuBackdrop {
  const bg = new BiomeBackground(chapter);
  const clouds = opts.clouds ?? true;
  let veil: Color | null = null;
  let veilK: KAPLAYCtx | null = null;
  return {
    biome: chapter.biome,
    dim: opts.dim ?? 0.5,
    speed: opts.speed ?? 18,
    draw(k: KAPLAYCtx, t: number): void {
      const scrollY = t * this.speed * (reducedMotion ? 0.25 : 1);
      bg.drawBack(k, scrollY, t);
      if (clouds) bg.drawFront(k, scrollY, t);
      if (this.dim > 0) {
        if (!veil || veilK !== k) {
          veil = k.rgb(6, 10, 18);
          veilK = k;
        }
        const w = Math.max(GAME_W, k.width());
        const h = Math.max(GAME_H, k.height());
        k.drawRect({ pos: k.vec2(-8, -8), width: w + 16, height: h + 16, color: veil, opacity: this.dim });
      }
    },
  };
}
