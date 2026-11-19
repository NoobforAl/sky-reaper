/**
 * Biome menu backdrop: menu / chapters / hangar / settings / results show the biome of the selected chapter
 * (chapter select) or the remembered one (last selected / played, else the next unlocked chapter).
 *
 * Renderer: `createMenuBackdrop(biome)` from src/levels when it exists, else a local wrapper around the real
 * `BiomeBackground` renderer, else a palette-only fallback. Slow scroll, dimmed + vignetted so text stays readable,
 * dip-to-dark crossfade when the chapter changes, and UI accent colours lightly tinted toward the chapter palette.
 */
import type { KAPLAYCtx } from "kaplay";
import { CHAPTER_IDS, GAME_H, GAME_W, type Biome, type ChapterDef, type ChapterId, type Services } from "../contracts";
import * as LV from "../levels";
import * as BGM from "../levels/backgrounds";
import { chapterInfo } from "./data";
import { readPrefs, reducedMotion, writePrefs } from "./prefs";
import { C, hexToRgb, type RGB } from "./theme";

type DrawFn = (k: KAPLAYCtx, time: number, scrollY: number) => void;

const BIOME_OF: Record<ChapterId, Biome> = { pacific: "ocean", jungle: "jungle", desert: "desert", arctic: "arctic", citadel: "citadel" };

/** veil over each biome: bright biomes get more dimming so panel text keeps its contrast */
const DIM: Record<Biome, number> = { ocean: 0.5, jungle: 0.46, desert: 0.64, arctic: 0.68, citadel: 0.36 };

function chapterDef(id: ChapterId): ChapterDef | null {
  try {
    return LV.levels.chapters.find((c) => c.id === id) ?? null;
  } catch {
    return null;
  }
}

function biomeOf(id: ChapterId): Biome {
  return chapterDef(id)?.biome ?? BIOME_OF[id];
}

/** turn whatever createMenuBackdrop / BiomeBackground returns into one draw function */
function adapt(obj: unknown): DrawFn | null {
  if (!obj) return null;
  if (typeof obj === "function") return (k, t, sy) => (obj as (k: KAPLAYCtx, t: number, sy: number) => void)(k, t, sy);
  const o = obj as {
    draw?: (k: KAPLAYCtx, t: number, sy?: number) => void;
    drawBack?: (k: KAPLAYCtx, sy: number, t: number) => void;
    drawFront?: (k: KAPLAYCtx, sy: number, t: number) => void;
  };
  if (typeof o.draw === "function") return (k, t, sy) => o.draw!(k, t, sy);
  if (typeof o.drawBack === "function")
    return (k, t, sy) => {
      o.drawBack!(k, sy, t);
      o.drawFront?.(k, sy, t);
    };
  return null;
}

/** palette-only fallback: base fill + slow drifting mottles */
function paletteFallback(id: ChapterId): DrawFn {
  const p = chapterInfo(id).palette;
  const bg = hexToRgb(p.bg, C.navy);
  const mid = hexToRgb(p.mid, C.navy2);
  return (k, _t, sy) => {
    k.drawRect({ pos: k.vec2(0, 0), width: GAME_W, height: GAME_H, color: k.rgb(bg[0], bg[1], bg[2]) });
    const cell = 140;
    const off = sy % cell;
    for (let y = -cell; y < GAME_H + cell; y += cell)
      for (let x = 0; x < GAME_W + cell; x += cell) {
        const row = Math.floor((y - off + sy) / cell);
        const h = Math.abs(Math.sin(row * 12.9898 + x * 0.0789) * 43758.5453) % 1;
        if (h < 0.45) continue;
        k.drawCircle({ pos: k.vec2(x + h * 60, y + off), radius: 30 + h * 40, color: k.rgb(mid[0], mid[1], mid[2]), opacity: 0.35 });
      }
  };
}

/** scroll speed in units/s (the level backdrop quarters it with reduced motion) */
const SPEED = 16;
const cache = new Map<ChapterId, DrawFn>();
/** a renderer that threw is replaced by the palette fallback for a few seconds, then retried */
const failedUntil = new Map<ChapterId, number>();
let usingLevelBackdrop = false;

function rendererFor(id: ChapterId): DrawFn {
  const hit = cache.get(id);
  if (hit) return hit;
  let fn: DrawFn | null = null;
  const biome = biomeOf(id);
  const factory = (LV as unknown as Record<string, unknown>)["createMenuBackdrop"];
  if (typeof factory === "function") {
    try {
      // own veil + vignette are drawn here (biome-specific), so the factory's veil is off
      fn = adapt((factory as (b: Biome, o?: { dim?: number; speed?: number }) => unknown)(biome, { dim: 0, speed: SPEED }));
      usingLevelBackdrop = !!fn;
    } catch (e) {
      console.warn("[ui] createMenuBackdrop failed", e);
      fn = null;
    }
  }
  if (!fn) {
    const def = chapterDef(id);
    const Ctor = (LV as unknown as Record<string, unknown>)["BiomeBackground"];
    if (def && typeof Ctor === "function") {
      try {
        fn = adapt(new (Ctor as new (c: ChapterDef) => unknown)(def));
      } catch (e) {
        console.warn("[ui] BiomeBackground failed", e);
        fn = null;
      }
    }
  }
  if (!fn) fn = paletteFallback(id);
  // guard: a renderer that throws falls back to the palette version for good
  const safe = fn;
  const fallback = paletteFallback(id);
  let warned = false;
  const wrapped: DrawFn = (k, t, sy) => {
    const until = failedUntil.get(id) ?? 0;
    if (until > performance.now()) return fallback(k, t, sy);
    try {
      safe(k, t, sy);
    } catch (e) {
      if (!warned) console.warn("[ui] menu backdrop error (palette fallback)", e);
      warned = true;
      failedUntil.set(id, performance.now() + 3000);
      fallback(k, t, sy);
    }
  };
  cache.set(id, wrapped);
  return wrapped;
}

// ------------------------------------------------------------------ state

let current: ChapterId | null = null;
let shown: ChapterId | null = null;
/** crossfade clock (s since the last change), < 0 = idle */
let fadeT = -1;
const FADE = 0.45;
let scrollY = 0;
let clock = 0;
let lastNow = -1;

/** chapter the menu backdrop shows on screens other than chapter select */
export function menuChapter(svc: Services): ChapterId {
  const p = readPrefs().menuChapter;
  if (p) {
    const idx = CHAPTER_IDS.indexOf(p);
    if (idx >= 0 && idx <= svc.save.data.chaptersUnlocked) return p;
  }
  return defaultChapter(svc);
}

function defaultChapter(svc: Services): ChapterId {
  const d = svc.save.data;
  for (let i = 0; i <= Math.min(d.chaptersUnlocked, CHAPTER_IDS.length - 1); i++) {
    const id = CHAPTER_IDS[i]!;
    if (!d.chapters[id]?.completed) return id;
  }
  return CHAPTER_IDS[Math.min(d.chaptersUnlocked, CHAPTER_IDS.length - 1)]!;
}

/** remember a chapter (selected in chapter select, launched, or just played) for the menu backdrop */
export function rememberChapter(id: ChapterId): void {
  if (readPrefs().menuChapter !== id) writePrefs({ menuChapter: id });
}

/** show this chapter's biome (crossfades when it changes) */
export function setBackdropChapter(id: ChapterId): void {
  if (id === current) return;
  current = id;
  if (shown === null) {
    shown = id;
    applyTint(id);
  } else fadeT = 0;
}

export function backdropChapter(): ChapterId | null {
  return current;
}

// ------------------------------------------------------------------ accent tint

const BASE = {
  cyan: [...C.cyan] as RGB,
  cyanDim: [...C.cyanDim] as RGB,
  amber: [...C.amber] as RGB,
  amberDim: [...C.amberDim] as RGB,
  navy: [...C.navy] as RGB,
  navy2: [...C.navy2] as RGB,
  navy3: [...C.navy3] as RGB,
};

const mixInto = (dst: RGB, a: RGB, b: RGB, f: number) => {
  dst[0] = Math.round(a[0] + (b[0] - a[0]) * f);
  dst[1] = Math.round(a[1] + (b[1] - a[1]) * f);
  dst[2] = Math.round(a[2] + (b[2] - a[2]) * f);
};

/** light tint of the UI accents toward a chapter palette; null restores the base theme */
export function applyTint(id: ChapterId | null): void {
  if (!id) {
    for (const key of Object.keys(BASE) as (keyof typeof BASE)[]) mixInto(C[key], BASE[key], BASE[key], 0);
    return;
  }
  const p = chapterInfo(id).palette;
  const acc = hexToRgb(p.accent, C.cyan);
  const bg = hexToRgb(p.bg, C.navy);
  // keep cyan readable: tint toward the accent, then keep it light
  const accLight: RGB = [Math.max(acc[0], 90), Math.max(acc[1], 90), Math.max(acc[2], 90)];
  mixInto(C.cyan, BASE.cyan, accLight, 0.35);
  mixInto(C.cyanDim, BASE.cyanDim, acc, 0.25);
  mixInto(C.amber, BASE.amber, acc, 0.1);
  mixInto(C.amberDim, BASE.amberDim, acc, 0.1);
  // panels: a whisper of the biome colour, still dark enough for white text
  mixInto(C.navy, BASE.navy, bg, 0.18);
  mixInto(C.navy2, BASE.navy2, bg, 0.18);
  mixInto(C.navy3, BASE.navy3, bg, 0.15);
}

// ------------------------------------------------------------------ drawing

function vignette(k: KAPLAYCtx, strength: number): void {
  const black = k.rgb(2, 4, 10);
  const n = 8;
  const sideW = Math.min(GAME_W * 0.18, 220);
  const topH = 110;
  for (let i = 0; i < n; i++) {
    const f = 1 - i / n;
    const op = strength * f * f * 0.22;
    const w = sideW / n;
    k.drawRect({ pos: k.vec2(i * w, 0), width: w + 0.5, height: GAME_H, color: black, opacity: op });
    k.drawRect({ pos: k.vec2(GAME_W - (i + 1) * w, 0), width: w + 0.5, height: GAME_H, color: black, opacity: op });
    const h = topH / n;
    k.drawRect({ pos: k.vec2(0, i * h), width: GAME_W, height: h + 0.5, color: black, opacity: op });
    k.drawRect({ pos: k.vec2(0, GAME_H - (i + 1) * h), width: GAME_W, height: h + 0.5, color: black, opacity: op });
  }
}

/** draw the biome backdrop (call first in a UI scene's onDraw) */
export function drawMenuBackdrop(k: KAPLAYCtx, svc: Services): void {
  if (!current) setBackdropChapter(menuChapter(svc));
  const now = k.time();
  const dt = lastNow < 0 ? 0 : Math.min(0.1, Math.max(0, now - lastNow));
  lastNow = now;
  clock += dt;
  scrollY += dt * (reducedMotion() ? SPEED / 4 : SPEED);

  if (fadeT >= 0) {
    fadeT += dt;
    if (fadeT >= FADE / 2 && shown !== current) {
      shown = current;
      applyTint(shown);
    }
    if (fadeT >= FADE) fadeT = -1;
  }
  const id = shown ?? current!;
  rendererFor(id)(k, clock, scrollY);

  const biome = biomeOf(id);
  const dim = DIM[biome] ?? 0.5;
  k.drawRect({ pos: k.vec2(0, 0), width: GAME_W, height: GAME_H, color: k.rgb(C.bg[0], C.bg[1], C.bg[2]), opacity: dim });
  vignette(k, 1);
  if (fadeT >= 0) {
    // dip to dark: 0 -> 1 at the swap -> 0
    const f = 1 - Math.abs(fadeT / (FADE / 2) - 1);
    k.drawRect({ pos: k.vec2(0, 0), width: GAME_W, height: GAME_H, color: k.rgb(C.bg[0], C.bg[1], C.bg[2]), opacity: Math.max(0, Math.min(1, f)) * 0.85 });
  }
}

/** push the reduced-motion preference into the level backgrounds (if the hook exists) */
export function applyReducedMotion(): void {
  const fn =
    (LV as unknown as Record<string, unknown>)["setReducedMotion"] ?? (BGM as unknown as Record<string, unknown>)["setReducedMotion"];
  if (typeof fn === "function") {
    try {
      (fn as (v: boolean) => void)(reducedMotion());
    } catch {
      /* ignore */
    }
  }
}

/** QA / notes: whether the src/levels createMenuBackdrop factory is in use */
export function backdropSource(): string {
  return usingLevelBackdrop ? "levels.createMenuBackdrop" : "local";
}
