/**
 * TextService (phase 2 of docs/I18N_FARSI_PLAN.md): one entry point for every piece of UI text.
 *
 *  - Latin text while the locale is "en" -> KAPLAY's own bitmap path (`k.drawText`, font `sr_font`, outline variant
 *    `sr_font_outline`, fallback CSS "monospace"), so English rendering does not change.
 *  - Arabic-script text (or any text while the locale is "fa") -> drawn once with Canvas2D (`direction = "rtl"`,
 *    Vazirmatn) so the browser does the letter shaping + Unicode bidi, uploaded into a shared atlas texture and drawn
 *    with `k.drawUVQuad`. Entries are cached (LRU, ~200 strings) by text / size / colour / outline / weight / width.
 *  - Numbers that change every frame (score, credits) -> `drawNumber`, composed from cached per-glyph quads
 *    (digit atlas), so nothing is re-rasterised per frame.
 *  - `measure()` and overflow reports (`maxWidth` exceeded) for the QA overflow check.
 *
 * Only documented KAPLAY APIs are used: loadSprite(null, canvas, { singular: true }) to get a GPU Texture,
 * Texture.update(img, x, y) to upload sub-rectangles, drawUVQuad({ tex, quad }) to draw them, plus
 * drawText / formatText / getBitmapFont for the Latin path.
 */
import type { Anchor, KAPLAYCtx, Texture, Vec2 } from "kaplay";
import { getLocale, hasArabicScript, formatNumber, onLocaleChange, bidiSigned, type NumberFormatOpts } from "./index";
import { FA_FONT_STACK } from "./font";

export type RGB = [number, number, number];
export type ColorLike = RGB | { r: number; g: number; b: number } | string;

export interface TextDrawOpts {
  /** top-left reference point (moved by `anchor`) */
  pos: { x: number; y: number } | [number, number];
  /** font size in game units (glyph height for Latin, em size for Arabic; Arabic is clamped to `minArabicSize`) */
  size?: number;
  color?: ColorLike;
  /** which point of the text box sits on `pos` (default "topleft") */
  anchor?: Anchor | Vec2;
  /** 0/undefined = none; n = outline width in game units (+ drop shadow, like sr_font_outline); or explicit */
  outline?: number | { width: number; color?: ColorLike; shadow?: boolean };
  /** wrap width in game units; a line that still exceeds it (one long word, or `wrap: false`) is reported */
  maxWidth?: number;
  /** wrap at maxWidth (default true) */
  wrap?: boolean;
  /** "start"/"end" follow the text direction (default "start": right edge for RTL, left edge for LTR) */
  align?: "left" | "center" | "right" | "start" | "end";
  opacity?: number;
  /** Arabic weight: 700 (default, readable at gameplay sizes) or 400 (body text) */
  weight?: 400 | 700;
  /** line height multiplier for the canvas path (default 1.45, Arabic script needs room) */
  lineHeight?: number;
  /** optional id (e.g. the i18n key) used in overflow reports */
  id?: string;
  /** force the canvas path even for Latin text in "en" */
  forceCanvas?: boolean;
  /** paragraph direction; default: RTL for Arabic-script text in "fa", else the first strong character decides */
  dir?: "rtl" | "ltr";
}

export interface TextMetrics {
  width: number;
  height: number;
  lines: number;
  overflow: boolean;
  /** which renderer handled it */
  path: "bitmap" | "canvas" | "digits";
}

export interface OverflowReport {
  text: string;
  id?: string;
  width: number;
  maxWidth: number;
  locale: string;
}

export interface TextServiceOptions {
  /** max cached strings (default 200) */
  maxEntries?: number;
  /** atlas page size in texels (default 1024) */
  pageSize?: number;
  /** max atlas pages (default 3); the least recently used page is recycled when all are full */
  maxPages?: number;
  /** raster scale of canvas text in texels per game unit; default = back-buffer density, at least 1 */
  resolution?: number;
  /** minimum on-screen size for Arabic script (plan §4: 14) */
  minArabicSize?: number;
  /** Latin bitmap fonts */
  latinFont?: string;
  latinOutlineFont?: string;
}

interface Page {
  tex: Texture | null;
  shelves: { y: number; h: number; x: number }[];
  nextY: number;
  lastUse: number;
  entries: Set<string>;
}

interface Entry {
  key: string;
  page: number;
  /** texel rect inside the page (without the transparent border) */
  tx: number;
  ty: number;
  tw: number;
  th: number;
  /** game-unit box */
  w: number;
  h: number;
  /** glyph advance (digit atlas) and the ink offset from the box origin */
  adv: number;
  padX: number;
  lines: number;
  overflow: boolean;
}

interface Layout {
  lines: string[];
  lineWidths: number[];
  width: number;
  height: number;
  overflow: boolean;
  rtl: boolean;
  font: string;
  size: number;
  pad: number;
  lineH: number;
}

const ANCHOR: Record<Anchor, [number, number]> = {
  topleft: [-1, -1],
  top: [0, -1],
  topright: [1, -1],
  left: [-1, 0],
  center: [0, 0],
  right: [1, 0],
  botleft: [-1, 1],
  bot: [0, 1],
  botright: [1, 1],
};

/** strings made only of digits / separators are drawn through the digit atlas in canvas mode */
const NUMERIC_RE = /^[0-9۰-۹٠-٩٬٫,.+\-−x×%/: ]+$/;
const BORDER = 1; // transparent texels around every atlas entry (no bleeding with recycled pages)

function toRgb(c: ColorLike | undefined, fb: RGB): RGB {
  if (!c) return fb;
  if (Array.isArray(c)) return c as RGB;
  if (typeof c === "string") {
    const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return fb;
    const n = parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [c.r, c.g, c.b];
}
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

/**
 * Paragraph base direction. In the Farsi UI every Arabic-script string is an RTL paragraph even when it starts with
 * a Latin key name ("SPACE را نگه دارید"); elsewhere the first strong character decides (Unicode rules P2/P3).
 */
export function baseRtl(str: string): boolean {
  if (!hasArabicScript(str)) return false;
  if (getLocale() === "fa") return true;
  const m = /[A-Za-zÀ-ɏ؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.exec(str);
  return !!m && !/[A-Za-zÀ-ɏ]/.test(m[0]);
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export class TextService {
  readonly maxEntries: number;
  readonly pageSize: number;
  readonly maxPages: number;
  readonly minArabicSize: number;
  latinFont: string;
  latinOutlineFont: string;
  /** every distinct overflow seen (QA reads this; also window.__i18nOverflows in the demo) */
  readonly overflows: OverflowReport[] = [];

  private k: KAPLAYCtx | null = null;
  private pages: Page[] = [];
  private cache = new Map<string, Entry>(); // insertion order = LRU order
  private layoutCache = new Map<string, Layout>();
  private overflowSeen = new Set<string>();
  private overflowCbs = new Set<(r: OverflowReport) => void>();
  private resolutionOpt?: number;
  private measureCtx: CanvasRenderingContext2D | null = null;
  private scratch: HTMLCanvasElement | null = null;
  private clock = 0;
  private pendingPages: Promise<void>[] = [];
  private rasterCount = 0;

  constructor(opts: TextServiceOptions = {}) {
    this.maxEntries = opts.maxEntries ?? 200;
    this.pageSize = opts.pageSize ?? 1024;
    this.maxPages = Math.max(1, opts.maxPages ?? 3);
    this.minArabicSize = opts.minArabicSize ?? 14;
    this.resolutionOpt = opts.resolution;
    this.latinFont = opts.latinFont ?? "sr_font";
    this.latinOutlineFont = opts.latinOutlineFont ?? "sr_font_outline";
    onLocaleChange(() => this.layoutCache.clear());
  }

  /** bind to a KAPLAY context and create the first atlas page; await before the first Farsi frame */
  init(k: KAPLAYCtx): Promise<void> {
    this.bind(k);
    return this.ready();
  }

  /** resolves when every atlas page created so far has its GPU texture */
  async ready(): Promise<void> {
    await Promise.all(this.pendingPages);
  }

  onOverflow(cb: (r: OverflowReport) => void): () => void {
    this.overflowCbs.add(cb);
    return () => this.overflowCbs.delete(cb);
  }

  /** drop every cached string (e.g. after a font finished loading); pages are reused */
  clear(): void {
    this.cache.clear();
    this.layoutCache.clear();
    for (const p of this.pages) this.resetPage(p);
  }

  stats() {
    return { entries: this.cache.size, pages: this.pages.length, rasterized: this.rasterCount, overflows: this.overflows.length };
  }

  /** true when `str` goes through the Canvas2D path in the current locale */
  usesCanvas(str: string, opts?: Pick<TextDrawOpts, "forceCanvas">): boolean {
    return !!opts?.forceCanvas || getLocale() === "fa" || hasArabicScript(str);
  }

  // ------------------------------------------------------------------ public draw API

  drawText(k: KAPLAYCtx, str: string, opts: TextDrawOpts): TextMetrics {
    this.bind(k);
    if (!this.usesCanvas(str, opts)) return this.drawLatin(k, str, opts);
    if (NUMERIC_RE.test(str) && !str.includes("\n")) return this.drawGlyphRun(k, str, opts);
    const L = this.layout(str, opts);
    const e = this.entry(str, opts, L);
    const [x, y] = this.place(k, opts, L.width, L.height);
    if (e) this.blit(k, e, x, y, opts.opacity ?? 1);
    return { width: L.width, height: L.height, lines: L.lines.length, overflow: L.overflow, path: "canvas" };
  }

  /**
   * Frequently changing numbers: formatted with formatNumber (Persian digits when enabled) and composed from cached
   * glyph quads. In "en" mode this is just the bitmap path.
   */
  drawNumber(k: KAPLAYCtx, n: number, opts: TextDrawOpts & { format?: NumberFormatOpts; prefix?: string; suffix?: string }): TextMetrics {
    const s = `${opts.prefix ?? ""}${formatNumber(n, opts.format)}${opts.suffix ?? ""}`;
    this.bind(k);
    if (!this.usesCanvas(s, opts)) return this.drawLatin(k, s, opts);
    return this.drawGlyphRun(k, s, opts);
  }

  measure(str: string, opts: Omit<TextDrawOpts, "pos"> & { pos?: TextDrawOpts["pos"] } = {}): TextMetrics {
    const o = { pos: [0, 0] as [number, number], ...opts };
    if (!this.usesCanvas(str, o)) {
      const k = this.k;
      if (!k) return { width: str.length * (o.size ?? 16) * 0.6, height: o.size ?? 16, lines: 1, overflow: false, path: "bitmap" };
      const ft = k.formatText({ text: str, size: o.size ?? 16, font: this.latinFontFor(k, o), width: o.wrap === false ? undefined : o.maxWidth });
      const overflow = !!o.maxWidth && ft.width > o.maxWidth + 0.5;
      return { width: ft.width, height: ft.height, lines: Math.max(1, Math.round(ft.height / Math.max(1, o.size ?? 16))), overflow, path: "bitmap" };
    }
    const L = this.layout(str, o);
    return { width: L.width, height: L.height, lines: L.lines.length, overflow: L.overflow, path: "canvas" };
  }

  // ------------------------------------------------------------------ Latin bitmap path

  private latinFontFor(k: KAPLAYCtx, o: Pick<TextDrawOpts, "outline">): string {
    const wantOutline = !!o.outline && (typeof o.outline === "number" ? o.outline !== 0 : o.outline.width > 0);
    if (wantOutline && k.getBitmapFont(this.latinOutlineFont)) return this.latinOutlineFont;
    if (k.getBitmapFont(this.latinFont)) return this.latinFont;
    return "monospace";
  }

  private drawLatin(k: KAPLAYCtx, str: string, o: TextDrawOpts): TextMetrics {
    const size = o.size ?? 16;
    const font = this.latinFontFor(k, o);
    const width = o.wrap === false ? undefined : o.maxWidth;
    const align = o.align === "start" ? "left" : o.align === "end" ? "right" : o.align;
    const ft = k.formatText({ text: str, size, font, width, align, anchor: "topleft", pos: k.vec2(0, 0) });
    const [x, y] = this.place(k, o, ft.width, ft.height);
    const c = toRgb(o.color, [255, 255, 255]);
    k.drawText({ text: str, size, font, width, align, pos: k.vec2(x, y), anchor: "topleft", color: k.rgb(c[0], c[1], c[2]), opacity: o.opacity ?? 1 });
    const overflow = !!o.maxWidth && ft.width > o.maxWidth + 0.5;
    if (overflow) this.reportOverflow(str, ft.width, o);
    return { width: ft.width, height: ft.height, lines: 1, overflow, path: "bitmap" };
  }

  // ------------------------------------------------------------------ canvas path: layout

  private resolution(): number {
    if (this.resolutionOpt) return this.resolutionOpt;
    const k = this.k;
    try {
      if (k) return Math.max(1, Math.min(3, k.canvas.width / k.width()));
    } catch {
      /* ignore */
    }
    return 1;
  }

  private ctx2d(): CanvasRenderingContext2D {
    if (!this.measureCtx) this.measureCtx = makeCanvas(4, 4).getContext("2d")!;
    return this.measureCtx;
  }

  private outlineOf(o: TextDrawOpts): { w: number; color: RGB; shadow: boolean } {
    if (!o.outline) return { w: 0, color: [4, 6, 12], shadow: false };
    if (typeof o.outline === "number") return { w: Math.abs(o.outline), color: [4, 6, 12], shadow: true };
    return { w: o.outline.width, color: toRgb(o.outline.color, [4, 6, 12]), shadow: o.outline.shadow ?? true };
  }

  private layout(str: string, o: TextDrawOpts): Layout {
    const size = Math.max(this.minArabicSize, o.size ?? 16);
    const weight = o.weight ?? 700;
    const ol = this.outlineOf(o);
    const lk = `${str}\u0001${o.dir ?? ""}|${getLocale()}|${size}|${weight}|${o.maxWidth ?? ""}|${o.wrap !== false}|${ol.w}|${ol.shadow}|${o.lineHeight ?? ""}`;
    const hit = this.layoutCache.get(lk);
    if (hit) return hit;

    const ctx = this.ctx2d();
    const font = `${weight} ${size}px ${FA_FONT_STACK}`;
    ctx.font = font;
    const rtl = o.dir ? o.dir === "rtl" : baseRtl(str);
    ctx.direction = rtl ? "rtl" : "ltr";
    if (rtl) str = bidiSigned(str); // "+15" keeps its sign on the left in RTL paragraphs (QA R5-5)
    const mw = (s: string) => ctx.measureText(s).width;
    const pad = Math.ceil(ol.w + (ol.shadow && ol.w > 0 ? 1 : 0));
    const lines: string[] = [];
    const max = o.maxWidth && o.wrap !== false ? o.maxWidth - pad * 2 : Infinity;
    for (const para of str.split("\n")) {
      if (!Number.isFinite(max) || mw(para) <= max) {
        lines.push(para);
        continue;
      }
      // greedy word wrap in logical order; each line is laid out by the browser's bidi on its own
      let cur = "";
      for (const word of para.split(/ +/)) {
        const cand = cur ? `${cur} ${word}` : word;
        if (cur && mw(cand) > max) {
          lines.push(cur);
          cur = word;
        } else cur = cand;
      }
      lines.push(cur);
    }
    const lineWidths = lines.map(mw);
    const inner = Math.max(0, ...lineWidths);
    const lineH = Math.round(size * (o.lineHeight ?? 1.45));
    const L: Layout = {
      lines,
      lineWidths,
      width: Math.ceil(inner + pad * 2),
      height: lineH * lines.length + pad * 2,
      overflow: false,
      rtl,
      font,
      size,
      pad,
      lineH,
    };
    if (o.maxWidth && L.width > o.maxWidth + 0.5) {
      L.overflow = true;
      this.reportOverflow(str, L.width, o);
    }
    if (this.layoutCache.size > this.maxEntries * 2) this.layoutCache.clear();
    this.layoutCache.set(lk, L);
    return L;
  }

  // ------------------------------------------------------------------ canvas path: raster + atlas

  private entryKey(str: string, o: TextDrawOpts, kind: "s" | "g"): string {
    const ol = this.outlineOf(o);
    const c = toRgb(o.color, [255, 255, 255]);
    return `${kind}|${str}\u0001${Math.max(this.minArabicSize, o.size ?? 16)}|${o.weight ?? 700}|${c.join(",")}|${ol.w}|${ol.color.join(",")}|${ol.shadow}|${o.maxWidth ?? ""}|${o.wrap !== false}|${o.align ?? ""}|${o.dir ?? ""}|${getLocale()}|${o.lineHeight ?? ""}|${this.resolution()}`;
  }

  private entry(str: string, o: TextDrawOpts, L: Layout): Entry | null {
    const key = this.entryKey(str, o, "s");
    const hit = this.touch(key);
    if (hit) return hit;
    const rs = this.resolution();
    const cw = Math.ceil(L.width * rs);
    const ch = Math.ceil(L.height * rs);
    const cv = this.rasterCanvas(cw + BORDER * 2, ch + BORDER * 2);
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(rs, 0, 0, rs, BORDER, BORDER);
    ctx.font = L.font;
    ctx.direction = L.rtl ? "rtl" : "ltr";
    ctx.textBaseline = "middle";
    const al = o.align ?? "start";
    const side = al === "center" ? "center" : al === "left" ? "left" : al === "right" ? "right" : (al === "start") === L.rtl ? "right" : "left";
    ctx.textAlign = side;
    const x = side === "center" ? L.width / 2 : side === "right" ? L.width - L.pad : L.pad;
    this.paintLines(ctx, L, o, x);
    return this.store(key, cv, cw, ch, L.width, L.height, 0, 0, L.lines.length, L.overflow);
  }

  private paintLines(ctx: CanvasRenderingContext2D, L: Layout, o: TextDrawOpts, x: number): void {
    const ol = this.outlineOf(o);
    const fill = css(toRgb(o.color, [255, 255, 255]));
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    L.lines.forEach((line, i) => {
      const y = L.pad + i * L.lineH + L.lineH / 2;
      if (ol.w > 0) {
        ctx.strokeStyle = css(ol.color);
        ctx.fillStyle = css(ol.color);
        ctx.lineWidth = ol.w * 2;
        if (ol.shadow) {
          ctx.strokeText(line, x + 1, y + 1);
          ctx.fillText(line, x + 1, y + 1);
        }
        ctx.strokeText(line, x, y);
      }
      ctx.fillStyle = fill;
      ctx.fillText(line, x, y);
    });
  }

  /** draw one glyph (digit atlas entry) */
  private glyph(ch: string, o: TextDrawOpts): Entry | null {
    const key = this.entryKey(ch, o, "g");
    const hit = this.touch(key);
    if (hit) return hit;
    const size = Math.max(this.minArabicSize, o.size ?? 16);
    const weight = o.weight ?? 700;
    const ol = this.outlineOf(o);
    const ctx0 = this.ctx2d();
    const font = `${weight} ${size}px ${FA_FONT_STACK}`;
    ctx0.font = font;
    ctx0.direction = "ltr";
    const adv = ctx0.measureText(ch).width;
    const pad = Math.ceil(ol.w + (ol.shadow && ol.w > 0 ? 1 : 0));
    const lineH = Math.round(size * (o.lineHeight ?? 1.45));
    const w = Math.ceil(adv + pad * 2);
    const h = lineH + pad * 2;
    const rs = this.resolution();
    const cw = Math.ceil(w * rs);
    const chh = Math.ceil(h * rs);
    const cv = this.rasterCanvas(cw + BORDER * 2, chh + BORDER * 2);
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(rs, 0, 0, rs, BORDER, BORDER);
    ctx.font = font;
    ctx.direction = "ltr";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const L: Layout = { lines: [ch], lineWidths: [adv], width: w, height: h, overflow: false, rtl: false, font, size, pad, lineH };
    this.paintLines(ctx, L, o, pad);
    return this.store(key, cv, cw, chh, w, h, adv, pad, 1, false);
  }

  /** numbers: glyphs side by side, always left-to-right (digits are LTR even inside RTL text) */
  private drawGlyphRun(k: KAPLAYCtx, s: string, o: TextDrawOpts): TextMetrics {
    const glyphs: Entry[] = [];
    let width = 0;
    let height = 0;
    let pad = 0;
    for (const ch of s) {
      const g = this.glyph(ch, o);
      if (!g) continue;
      glyphs.push(g);
      width += g.adv;
      height = Math.max(height, g.h);
      pad = Math.max(pad, g.padX);
    }
    const total = Math.ceil(width + pad * 2);
    const [x0, y0] = this.place(k, o, total, height);
    let x = x0 + pad;
    for (const g of glyphs) {
      this.blit(k, g, x - g.padX, y0, o.opacity ?? 1);
      x += g.adv;
    }
    const overflow = !!o.maxWidth && total > o.maxWidth + 0.5;
    if (overflow) this.reportOverflow(s, total, o);
    return { width: total, height, lines: 1, overflow, path: "digits" };
  }

  private rasterCanvas(w: number, h: number): HTMLCanvasElement {
    // a fresh size each time: resizing clears the canvas, and texSubImage2D uploads the whole canvas
    if (!this.scratch) this.scratch = makeCanvas(w, h);
    this.scratch.width = w;
    this.scratch.height = h;
    this.rasterCount++;
    return this.scratch;
  }

  private touch(key: string): Entry | null {
    const e = this.cache.get(key);
    if (!e) return null;
    this.cache.delete(key);
    this.cache.set(key, e);
    const p = this.pages[e.page];
    if (p) p.lastUse = ++this.clock;
    return e;
  }

  private store(key: string, cv: HTMLCanvasElement, cw: number, ch: number, w: number, h: number, adv: number, padX: number, lines: number, overflow: boolean): Entry | null {
    const slot = this.alloc(cv.width, cv.height);
    if (!slot) return null;
    const page = this.pages[slot.page]!;
    if (!page.tex) return null; // texture not ready yet (first frame after init); retry next frame
    page.tex.update(cv, slot.x, slot.y);
    const e: Entry = { key, page: slot.page, tx: slot.x + BORDER, ty: slot.y + BORDER, tw: cw, th: ch, w, h, adv, padX, lines, overflow };
    this.cache.set(key, e);
    page.entries.add(key);
    page.lastUse = ++this.clock;
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value as string;
      const oe = this.cache.get(oldest);
      this.cache.delete(oldest);
      if (oe) this.pages[oe.page]?.entries.delete(oldest);
    }
    return e;
  }

  /** shelf packer over the pages; recycles the least recently used page when everything is full */
  private alloc(w: number, h: number): { page: number; x: number; y: number } | null {
    const S = this.pageSize;
    if (w > S || h > S) {
      console.warn(`[i18n] text too large for the atlas (${w}x${h} > ${S})`);
      return null;
    }
    const tryPage = (pi: number) => {
      const p = this.pages[pi]!;
      for (const sh of p.shelves) {
        if (h <= sh.h && sh.x + w <= S) {
          const r = { page: pi, x: sh.x, y: sh.y };
          sh.x += w;
          return r;
        }
      }
      if (p.nextY + h <= S) {
        const sh = { y: p.nextY, h, x: w };
        p.shelves.push(sh);
        p.nextY += h;
        return { page: pi, x: 0, y: sh.y };
      }
      return null;
    };
    for (let i = 0; i < this.pages.length; i++) {
      const r = tryPage(i);
      if (r) return r;
    }
    if (this.pages.length < this.maxPages && this.k) {
      this.addPage(this.k);
      const r = tryPage(this.pages.length - 1);
      if (r) return r;
    }
    // recycle the least recently used page
    let lru = 0;
    for (let i = 1; i < this.pages.length; i++) if (this.pages[i]!.lastUse < this.pages[lru]!.lastUse) lru = i;
    const p = this.pages[lru]!;
    for (const key of p.entries) this.cache.delete(key);
    this.resetPage(p);
    return tryPage(lru);
  }

  private resetPage(p: Page): void {
    p.shelves = [];
    p.nextY = 0;
    p.entries.clear();
  }

  private bind(k: KAPLAYCtx): void {
    if (this.k === k) return;
    this.k = k;
    this.pages = [];
    this.cache.clear();
    this.addPage(k);
  }

  private addPage(k: KAPLAYCtx): void {
    const page: Page = { tex: null, shelves: [], nextY: 0, lastUse: 0, entries: new Set() };
    this.pages.push(page);
    // documented API: loadSprite accepts an ImageSource; `singular` gives the sprite its own texture (not the shared
    // packer), which we then fill with Texture.update(img, x, y).
    const asset = k.loadSprite(null, makeCanvas(this.pageSize, this.pageSize), { singular: true });
    this.pendingPages.push(
      new Promise<void>((resolve) => {
        asset.onLoad((d) => {
          page.tex = d.tex;
          resolve();
        });
        asset.onError(() => resolve());
      }),
    );
  }

  // ------------------------------------------------------------------ helpers

  private place(k: KAPLAYCtx, o: TextDrawOpts, w: number, h: number): [number, number] {
    const p = o.pos;
    const px = Array.isArray(p) ? p[0] : p.x;
    const py = Array.isArray(p) ? p[1] : p.y;
    const an = o.anchor ?? "topleft";
    const [ax, ay] = typeof an === "string" ? (ANCHOR[an] ?? [-1, -1]) : [an.x, an.y];
    // snap to back-buffer pixels so nearest sampling stays crisp
    let bs = 1;
    try {
      bs = k.canvas.width / k.width() || 1;
    } catch {
      /* ignore */
    }
    const x = Math.round((px - ((ax + 1) / 2) * w) * bs) / bs;
    const y = Math.round((py - ((ay + 1) / 2) * h) * bs) / bs;
    return [x, y];
  }

  private blit(k: KAPLAYCtx, e: Entry, x: number, y: number, opacity: number): void {
    const page = this.pages[e.page];
    if (!page?.tex) return;
    const S = this.pageSize;
    k.drawUVQuad({
      pos: k.vec2(x, y),
      width: e.w,
      height: e.h,
      tex: page.tex,
      quad: k.quad(e.tx / S, e.ty / S, e.tw / S, e.th / S),
      opacity,
    });
  }

  private reportOverflow(text: string, width: number, o: TextDrawOpts): void {
    const id = `${o.id ?? ""}|${text}|${o.maxWidth}`;
    if (this.overflowSeen.has(id)) return;
    this.overflowSeen.add(id);
    const r: OverflowReport = { text, id: o.id, width: Math.round(width), maxWidth: o.maxWidth ?? 0, locale: getLocale() };
    this.overflows.push(r);
    console.warn(`[i18n] text overflow (${r.width} > ${r.maxWidth})${o.id ? ` [${o.id}]` : ""}: ${text}`);
    for (const cb of this.overflowCbs) cb(r);
  }
}

/** shared instance (Services.text proposal); call `textService.init(k)` once after loadPersianFont() */
export const textService = new TextService();

export function createTextService(opts?: TextServiceOptions): TextService {
  return new TextService(opts);
}
