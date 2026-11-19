/**
 * Widgets + drawing primitives: outlined text, panels, buttons, sliders, toggles, selectors,
 * the animated menu backdrop and scanlines. Widgets are plain data consumed by UiRoot (./core).
 */
import type { Anchor, KAPLAYCtx } from "kaplay";
import { GAME_H, GAME_W, WIDE } from "../contracts";
import { C, type RGB } from "./theme";
import { smoothFramebufferMinify } from "./glfix";
import { hasArabicScript } from "../i18n";
import { textService } from "../i18n/text";
import { tr } from "./i18n";

// ------------------------------------------------------------------ crisp text

/** design cell of sr_font (glyph height in design px); atlases are 4x with a linear filter */
export const FONT_CELL = 12;
/** advance per char as a fraction of the size: sr_font 7/12, sr_font_outline 8/12 */
export const CHAR_W = 7 / 12;
export const CHAR_W_OUTLINE = 8 / 12;

interface BufInfo {
  /** back-buffer px per game unit */
  bs: number;
  /** letterbox offset in back-buffer px */
  ox: number;
  oy: number;
  /** CSS px per game unit */
  css: number;
}
let buf: BufInfo = { bs: 1, ox: 0, oy: 0, css: 1 };
let bufKey = "";
let bufCanvas: HTMLCanvasElement | null = null;

/**
 * Call once per frame from an onDraw (UiRoot / HUD). KAPLAY draws into an offscreen framebuffer of
 * GAME_W*pixelDensity px (no letterbox offset), so "buffer px per unit" = pixelDensity = drawing buffer / CSS size.
 */
export function refreshBuf(canvas?: HTMLCanvasElement | null): void {
  if (canvas) bufCanvas = canvas;
  const c = bufCanvas;
  if (!c) return;
  smoothFramebufferMinify(c);
  const key = `${c.width}x${c.height}x${c.clientWidth}x${c.clientHeight}`;
  if (key === bufKey) return;
  bufKey = key;
  const cw = c.clientWidth || c.width;
  const ch = c.clientHeight || c.height;
  const bs = c.width / cw || 1;
  const css = Math.min(cw / GAME_W, ch / GAME_H) || 1;
  buf = { bs, ox: 0, oy: 0, css };
}

export function bufScale(): number {
  return buf.bs;
}

/**
 * Text size in game units for a requested size. The font is drawn at whole multiples of half its 12 px design cell
 * in back-buffer pixels (12, 18, 24, 36...), never below 12 px: at 1x every design pixel lands on exactly one buffer
 * pixel (no dropped strokes), and 12 buffer px is >= 12 CSS px on every supported screen.
 */
export function readableSize(size: number): number {
  const bs = buf.bs;
  const x = (size * bs) / FONT_CELL;
  const n = x <= 1 ? 1 : x >= 3 ? Math.round(x) : Math.max(1, Math.floor(x * 2 + 0.6) / 2);
  // keep >= 12 CSS px as well (only matters when the buffer is below 1 CSS px per buffer px)
  const minUnits = Math.max(FONT_CELL / bs, 12 / Math.max(0.25, buf.css));
  return Math.max((n * FONT_CELL) / bs, n === 1 ? minUnits : 0);
}

/** approximate advance of one character at a requested size (game units) */
export function charW(size: number, outlined = false): number {
  return readableSize(size) * (outlined ? CHAR_W_OUTLINE : CHAR_W);
}

/** snap a game-unit coordinate to the back-buffer pixel grid */
export function snapX(x: number): number {
  return (Math.round(buf.ox + x * buf.bs) - buf.ox) / buf.bs;
}
export function snapY(y: number): number {
  return (Math.round(buf.oy + y * buf.bs) - buf.oy) / buf.bs;
}

/** cheap circle outline: n line quads, no joins */
export function strokeCircle(k: KAPLAYCtx, x: number, y: number, r: number, color: ReturnType<KAPLAYCtx["rgb"]>, width = 2, opacity = 1): void {
  const n = Math.max(12, Math.min(40, Math.round(r * 0.6)));
  const step = (Math.PI * 2) / n;
  // extend each segment slightly so the gaps at the corners close up
  const ext = 1 + width / Math.max(4, r * step * 2);
  let px = x + r;
  let py = y;
  for (let i = 1; i <= n; i++) {
    const a = i * step;
    const nx = x + Math.cos(a) * r;
    const ny = y + Math.sin(a) * r;
    const mx = (px + nx) / 2;
    const my = (py + ny) / 2;
    k.drawLine({
      p1: k.vec2(mx + (px - mx) * ext, my + (py - my) * ext),
      p2: k.vec2(mx + (nx - mx) * ext, my + (ny - my) * ext),
      width,
      color,
      opacity,
    });
    px = nx;
    py = ny;
  }
}

/** keycaps + label for Gfx.hintBar */
export type HintItem = [string[], string];

// ------------------------------------------------------------------ drawing context

export interface TextOpts {
  size?: number;
  color?: RGB;
  anchor?: Anchor;
  /** dark outline (1 = 1px each side). 0 = plain, -1 = drop shadow only */
  outline?: number;
  outlineColor?: RGB;
  width?: number;
  align?: "left" | "center" | "right";
  opacity?: number;
  lineSpacing?: number;
  /** with `width`: clip to this many wrapped lines, ending with "..." */
  maxLines?: number;
}

const clipCache = new Map<string, string>();

const ANCHOR: Record<string, [number, number]> = {
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

export class Gfx {
  /** sr_font_outline (baked outline + drop shadow) when loaded, else the regular font */
  fontOutline: string;
  /** outline used when TextOpts.outline is not given (HUD: 1 = outline font, text sits over gameplay) */
  defaultOutline = 0;
  constructor(
    public k: KAPLAYCtx,
    public font: string,
    fontOutline?: string,
  ) {
    this.fontOutline = fontOutline ?? font;
  }

  col(c: RGB) {
    return this.k.rgb(c[0], c[1], c[2]);
  }

  /** measured width of a single-line string in game units (exact, via the font's glyph advances) */
  measure(text: string, size = 16, outlined = false): number {
    if (hasArabicScript(text)) {
      const fo = this.faOpts({ size, outline: outlined ? 1 : 0 });
      return textService.measure(text, { size: fo.size, outline: fo.outline, lineHeight: fo.lineHeight }).width;
    }
    try {
      return this.k.formatText({ text, size: readableSize(size), font: outlined ? this.fontOutline : this.font }).width;
    } catch {
      return text.length * charW(size, outlined);
    }
  }

  /** height of `text` wrapped at `width` (game units) */
  textHeight(text: string, size = 16, width?: number, lineSpacing = 0, outlined = false): number {
    if (hasArabicScript(text)) {
      const fo = this.faOpts({ size, outline: outlined ? 1 : 0, lineSpacing });
      return textService.measure(text, { size: fo.size, outline: fo.outline, maxWidth: width, lineHeight: fo.lineHeight }).height;
    }
    try {
      return this.k.formatText({ text, size: readableSize(size), font: outlined ? this.fontOutline : this.font, width, lineSpacing }).height;
    } catch {
      return readableSize(size);
    }
  }

  /** longest prefix of `text` (word boundary, plus "...") that wraps to <= maxLines at this width; cached */
  private clip(text: string, size: number, font: string, width: number, maxLines: number, lineSpacing: number): string {
    const key = `${font}|${size}|${width}|${maxLines}|${lineSpacing}|${text}`;
    const hit = clipCache.get(key);
    if (hit !== undefined) return hit;
    const k = this.k;
    const limit = maxLines * (size + lineSpacing) - lineSpacing + 0.5;
    const fits = (t: string) => k.formatText({ text: t, size, font, width, lineSpacing }).height <= limit;
    let out = text;
    if (!fits(text)) {
      const words = text.split(" ");
      let lo = 0;
      let hi = words.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(words.slice(0, mid).join(" ") + "...")) lo = mid;
        else hi = mid - 1;
      }
      out = lo > 0 ? words.slice(0, lo).join(" ") + "..." : text.slice(0, Math.max(1, Math.floor(width / (size * CHAR_W)) - 3)) + "...";
    }
    if (clipCache.size > 600) clipCache.clear();
    clipCache.set(key, out);
    return out;
  }

  /**
   * Crisp text: size snapped to whole font-cell steps (see readableSize), top-left corner snapped to back-buffer pixels.
   * outline: 0 = plain (sr_font has a baked 1px outline), 1 / -1 = sr_font_outline (outline + drop shadow),
   * >= 2 = outline font plus an extra dark 1-design-px ring (titles).
   */
  /**
   * RTL screens: the whole UI layer is drawn under a horizontal flip (see beginScene). Text must stay readable, so
   * every text box is flipped back around its own centre; physical left/right alignment is swapped as well.
   */
  mirrored = false;

  /** run `fn` un-flipped around x = cx (sprites that must not mirror, e.g. the logo) */
  unflip(cx: number, fn: () => void): void {
    if (!this.mirrored) return fn();
    const k = this.k;
    k.pushTransform();
    k.pushTranslate(2 * cx, 0);
    k.pushScale(-1, 1);
    fn();
    k.popTransform();
  }

  /** draws the text; returns its height in game units (wrapped lines included) */
  text(text: string, x: number, y: number, o: TextOpts = {}): number {
    if (hasArabicScript(text)) return this.textCanvas(text, x, y, o);
    const k = this.k;
    const size = readableSize(o.size ?? 16);
    const ow = o.outline ?? this.defaultOutline;
    const font = ow !== 0 ? this.fontOutline : this.font;
    const color = this.col(o.color ?? C.text);
    if (o.maxLines && o.width) text = this.clip(text, size, font, o.width, o.maxLines, o.lineSpacing ?? 0);
    const align = this.mirrored && o.width ? (o.align === "center" ? "center" : o.align === "right" ? "left" : "right") : o.align;
    const ft = k.formatText({
      text,
      size,
      font,
      width: o.width,
      align,
      lineSpacing: o.lineSpacing,
      opacity: o.opacity ?? 1,
      color,
      anchor: "topleft",
      pos: k.vec2(0, 0),
    });
    const an = o.anchor ?? "topleft";
    const v = an as unknown as { x: number; y: number };
    const [ax, ay] = typeof an === "string" ? (ANCHOR[an] ?? [-1, -1]) : [v.x, v.y];
    const tx = snapX(x - ((ax + 1) / 2) * ft.width);
    const ty = snapY(y - ((ay + 1) / 2) * ft.height);
    const flip = this.mirrored;
    if (flip) {
      k.pushTransform();
      k.pushTranslate(2 * tx + snapX(ft.width), 0);
      k.pushScale(-1, 1);
    }
    if (ow >= 2) {
      const oc = this.col(o.outlineColor ?? C.dark);
      for (const ch of ft.chars) ch.color = oc;
      const d = Math.max(1, Math.round((size * buf.bs) / FONT_CELL)) / buf.bs;
      for (const [dx, dy] of [
        [-d, 0],
        [d, 0],
        [0, -d],
        [0, d],
        [d, d],
      ] as const) {
        ft.opt.pos = k.vec2(tx + dx, ty + dy);
        k.drawFormattedText(ft);
      }
      for (const ch of ft.chars) ch.color = color;
    }
    ft.opt.pos = k.vec2(tx, ty);
    k.drawFormattedText(ft);
    if (flip) k.popTransform();
    return ft.height;
  }

  /** text options -> TextService options (Arabic script: Canvas2D shaping + bidi, cached atlas texture) */
  private faOpts(o: TextOpts): { size: number; outline: { width: number; color: RGB; shadow: boolean }; lineHeight: number } {
    const ow = o.outline ?? this.defaultOutline;
    const size = Math.max(14, Math.round(readableSize(o.size ?? 16) * 0.95));
    const outline = ow >= 2 ? { width: 2, color: o.outlineColor ?? C.dark, shadow: true } : ow !== 0 ? { width: 1.5, color: C.dark, shadow: true } : { width: 1, color: C.dark, shadow: false };
    // Vazirmatn needs ~1.55 em per line or tall letters (alef, lam) and descenders get clipped in the atlas
    return { size, outline, lineHeight: 1.55 + (o.lineSpacing ?? 0) / Math.max(14, size) };
  }

  /** Arabic-script text through the shared TextService (shaping + bidi by the browser) */
  private textCanvas(text: string, x: number, y: number, o: TextOpts): number {
    const k = this.k;
    const fo = this.faOpts(o);
    const maxWidth = o.width;
    if (o.maxLines && maxWidth) text = this.clipFa(text, fo, maxWidth, o.maxLines);
    // physical alignment inside the box; RTL screens (mirrored) right-align paragraphs by default
    const want = o.align ?? (this.mirrored ? "right" : "left");
    const align = this.mirrored && o.align ? (want === "center" ? "center" : want === "left" ? "right" : "left") : want;
    const m = textService.measure(text, { size: fo.size, outline: fo.outline, maxWidth, lineHeight: fo.lineHeight });
    const an = o.anchor ?? "topleft";
    const v = an as unknown as { x: number; y: number };
    const [ax, ay] = typeof an === "string" ? (ANCHOR[an] ?? [-1, -1]) : [v.x, v.y];
    const w = snapX(m.width);
    const tx = snapX(x - ((ax + 1) / 2) * m.width);
    // top / bottom anchors: line up the first (last) line's centre with where the pixel font's glyphs would sit, so a
    // Farsi label replaces an English one in place even though its line box is taller
    const slack = Math.max(0, (m.height / Math.max(1, m.lines) - readableSize(o.size ?? 16)) / 2);
    const ty = snapY(y - ((ay + 1) / 2) * m.height + (ay < 0 ? -slack : ay > 0 ? slack : 0));
    const flip = this.mirrored;
    if (flip) {
      k.pushTransform();
      k.pushTranslate(2 * tx + w, 0);
      k.pushScale(-1, 1);
    }
    textService.drawText(k, text, {
      pos: [tx, ty],
      size: fo.size,
      color: o.color ?? C.text,
      outline: fo.outline,
      maxWidth,
      align,
      opacity: o.opacity ?? 1,
      lineHeight: fo.lineHeight,
    });
    if (flip) k.popTransform();
    return m.height;
  }

  /** Arabic-script counterpart of clip(): longest word prefix + "…" that wraps to <= maxLines; cached */
  private clipFa(text: string, fo: ReturnType<Gfx["faOpts"]>, width: number, maxLines: number): string {
    const key = `fa|${fo.size}|${width}|${maxLines}|${text}`;
    const hit = clipCache.get(key);
    if (hit !== undefined) return hit;
    const lines = (t: string) => textService.measure(t, { size: fo.size, outline: fo.outline, maxWidth: width, lineHeight: fo.lineHeight }).lines;
    let out = text;
    if (lines(text) > maxLines) {
      const words = text.split(" ");
      let lo = 0;
      let hi = words.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (lines(words.slice(0, mid).join(" ") + "…") <= maxLines) lo = mid;
        else hi = mid - 1;
      }
      out = (lo > 0 ? words.slice(0, lo).join(" ") : words[0]!) + "…";
    }
    if (clipCache.size > 600) clipCache.clear();
    clipCache.set(key, out);
    return out;
  }

  rect(x: number, y: number, w: number, h: number, color: RGB, opacity = 1, radius = 0): void {
    this.k.drawRect({ pos: this.k.vec2(x, y), width: w, height: h, color: this.col(color), opacity, radius });
  }

  frame(x: number, y: number, w: number, h: number, color: RGB, width = 2, opacity = 1, radius = 0): void {
    if (radius <= 0) {
      // 4 quads: much cheaper than a stroked rect (KAPLAY strokes every edge as joined line segments)
      const half = width / 2;
      this.rect(x - half, y - half, w + width, width, color, opacity);
      this.rect(x - half, y + h - half, w + width, width, color, opacity);
      this.rect(x - half, y + half, width, h - width, color, opacity);
      this.rect(x + w - half, y + half, width, h - width, color, opacity);
      return;
    }
    this.k.drawRect({ pos: this.k.vec2(x, y), width: w, height: h, fill: false, outline: { width, color: this.col(color) }, opacity, radius });
  }

  line(x1: number, y1: number, x2: number, y2: number, color: RGB, width = 1, opacity = 1): void {
    this.k.drawLine({ p1: this.k.vec2(x1, y1), p2: this.k.vec2(x2, y2), color: this.col(color), width, opacity });
  }

  circle(x: number, y: number, r: number, color: RGB, opacity = 1): void {
    this.k.drawCircle({ pos: this.k.vec2(x, y), radius: r, color: this.col(color), opacity });
  }

  /** circle outline as plain line quads (KAPLAY's stroked circle adds a filled join circle per segment: slow) */
  ring(x: number, y: number, r: number, color: RGB, width = 2, opacity = 1): void {
    strokeCircle(this.k, x, y, r, this.col(color), width, opacity);
  }

  /** check mark (drawn, font independent) */
  check(x: number, y: number, s: number, color: RGB): void {
    this.line(x - s * 0.5, y, x - s * 0.1, y + s * 0.4, color, 3);
    this.line(x - s * 0.1, y + s * 0.4, x + s * 0.55, y - s * 0.45, color, 3);
  }

  cross(x: number, y: number, s: number, color: RGB): void {
    this.line(x - s * 0.4, y - s * 0.4, x + s * 0.4, y + s * 0.4, color, 2);
    this.line(x + s * 0.4, y - s * 0.4, x - s * 0.4, y + s * 0.4, color, 2);
  }

  /** padlock glyph */
  lock(x: number, y: number, s: number, color: RGB): void {
    this.k.drawCircle({ pos: this.k.vec2(x, y - s * 0.25), radius: s * 0.32, fill: false, outline: { width: 2, color: this.col(color) } });
    this.rect(x - s * 0.45, y - s * 0.15, s * 0.9, s * 0.65, color);
    this.rect(x - s * 0.06, y + s * 0.02, s * 0.12, s * 0.25, C.dark);
  }

  /** keyboard key cap / pad button glyph (e.g. "ESC", "Q", "ENTER"); returns its width */
  keycap(label: string, x: number, y: number, o: { anchor?: "left" | "right" | "center"; color?: RGB; size?: number; opacity?: number } = {}): number {
    const size = o.size ?? 10;
    const w = Math.max(18, this.measure(label, size) + 12);
    const h = readableSize(size) + 9;
    const lx = o.anchor === "right" ? x - w : o.anchor === "center" ? x - w / 2 : x;
    const op = o.opacity ?? 1;
    const col = o.color ?? C.steelHi;
    this.rect(lx, y - h / 2 + 2, w, h, C.dark, 0.9 * op);
    this.rect(lx, y - h / 2, w, h, C.navy3, op);
    this.frame(lx, y - h / 2, w, h, col, 1, op);
    this.text(label, lx + w / 2, y, { size, color: col, anchor: "center", opacity: op });
    return w;
  }

  /**
   * Row of control hints: keycaps followed by a label, e.g. [[["ENTER"], "SELECT"], [["Q", "E"], "TABS"]].
   * Centred on cx (anchor "center") or starting at cx (anchor "left"); returns the total width.
   */
  hintBar(items: HintItem[], cx: number, y: number, o: { size?: number; anchor?: "center" | "left" | "right"; opacity?: number; maxW?: number } = {}): number {
    const measure = (sz: number) => {
      const capW = (l: string) => Math.max(18, this.measure(l, sz) + 12);
      return items.reduce((a, [caps, label]) => a + caps.reduce((b, c) => b + capW(c) + 4, 0) + this.measure(label, sz, true) + 8, 0) + (items.length - 1) * 18;
    };
    const size = o.size ?? 9;
    const maxW = o.maxW ?? GAME_W - 16;
    let total = measure(size);
    // too wide even at the minimum readable size: drop trailing items rather than shrinking text below 12 px
    while (total > maxW && items.length > 1) {
      items = items.slice(0, -1);
      total = measure(size);
    }
    let x = o.anchor === "left" ? cx : o.anchor === "right" ? cx - total : cx - total / 2;
    const op = o.opacity ?? 0.9;
    // dark plate: hint bars sit over the biome backdrop
    const ph = readableSize(size) + 14;
    this.rect(x - 8, y - ph / 2, total + 16, ph, C.dark, 0.6 * op, 3);
    items.forEach(([caps, label], i) => {
      // key sequences (W A S D, Q E R) keep their left-to-right order on the mirrored RTL layer
      if (this.mirrored) for (let j = caps.length - 1; j >= 0; j--) x += this.keycap(caps[j]!, x, y, { size, opacity: op }) + 4;
      else for (const c of caps) x += this.keycap(c, x, y, { size, opacity: op }) + 4;
      this.text(label, x + 4, y, { size, color: C.text, anchor: "left", opacity: op, outline: 1 });
      x += this.measure(label, size, true) + 8 + (i < items.length - 1 ? 18 : 0);
    });
    return total;
  }

  /** tooltip box near (x, y), clamped to the screen */
  tooltip(lines: string[], x: number, y: number, accent: RGB = C.cyan): void {
    if (!lines.length) return;
    const size = 11;
    const rs = readableSize(size);
    const fa = lines.some(hasArabicScript);
    const lh = fa ? Math.max(rs, 14) * 1.3 + 4 : rs + 6;
    const maxW = Math.min(GAME_W - 40, Math.max(300, rs * 30));
    // word wrap by measured width (works for the bitmap font and for Farsi canvas text)
    const wrapped: string[] = [];
    for (const l of lines) {
      let cur = "";
      for (const word of l.split(" ")) {
        const cand = cur ? cur + " " + word : word;
        if (cur && this.measure(cand, size) > maxW - 24) {
          wrapped.push(cur);
          cur = word;
        } else cur = cand;
      }
      wrapped.push(cur);
    }
    const titleN = 1;
    lines = wrapped;
    const maxLen = Math.max(...lines.map((l) => this.measure(l, size)));
    const w = Math.min(GAME_W - 16, Math.max(120, maxLen + 24));
    const h = lines.length * lh + 14;
    let tx = x + 14;
    let ty = y + 18;
    if (tx + w > GAME_W - 8) tx = x - w - 10;
    if (tx < 8) tx = 8;
    if (ty + h > GAME_H - 8) ty = y - h - 10;
    if (ty < 8) ty = 8;
    this.rect(tx + 3, ty + 3, w, h, C.dark, 0.6, 4);
    this.rect(tx, ty, w, h, C.navy, 0.97, 4);
    this.frame(tx, ty, w, h, accent, 1, 1, 4);
    this.rect(tx, ty, 3, h, accent, 1);
    lines.forEach((l, i) => this.text(l, tx + 12, ty + 8 + i * lh, { size, color: i < titleN ? accent : C.text }));
  }

  /** Military panel: navy fill, steel border, amber corner ticks, optional title tab. */
  panel(x: number, y: number, w: number, h: number, o: { accent?: RGB; title?: string; fill?: RGB; opacity?: number } = {}): void {
    const acc = o.accent ?? C.amber;
    this.rect(x, y, w, h, o.fill ?? C.navy, o.opacity ?? 0.92);
    this.rect(x, y, w, 3, C.navy3, o.opacity ?? 0.92);
    this.frame(x, y, w, h, C.steel, 2);
    const t = 10;
    for (const [cx, cy, sx, sy] of [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x, y + h, 1, -1],
      [x + w, y + h, -1, -1],
    ] as const) {
      this.rect(sx > 0 ? cx : cx - t, sy > 0 ? cy : cy - 2, t, 2, acc);
      this.rect(sx > 0 ? cx : cx - 2, sy > 0 ? cy : cy - t, 2, t, acc);
    }
    if (o.title) {
      // dark tab + accent text: the font's baked dark outline makes dark-on-light text illegible
      const th = readableSize(13) + 8;
      const tw = this.measure(o.title, 13) + 22;
      this.rect(x + 12, y - th / 2, tw, th, C.dark, 0.95);
      this.frame(x + 12, y - th / 2, tw, th, acc, 2);
      this.rect(x + 12, y - th / 2, 4, th, acc);
      this.text(o.title, x + 24, y, { size: 13, color: acc, anchor: "left" });
    }
  }

  /** horizontal bar with optional segment ticks */
  bar(x: number, y: number, w: number, h: number, frac: number, color: RGB, o: { bg?: RGB; segments?: number; opacity?: number } = {}): void {
    const f = Math.max(0, Math.min(1, frac || 0));
    this.rect(x, y, w, h, o.bg ?? C.dark, 0.85 * (o.opacity ?? 1));
    if (f > 0) this.rect(x + 1, y + 1, (w - 2) * f, h - 2, color, o.opacity ?? 1);
    if (o.segments && o.segments > 1) for (let i = 1; i < o.segments; i++) this.rect(x + (w * i) / o.segments - 1, y, 2, h, C.dark, 0.7);
    this.frame(x, y, w, h, C.steel, 1, o.opacity ?? 1);
  }

  /** pips (filled / empty squares) */
  pips(x: number, y: number, n: number, filled: number, size: number, color: RGB, gap = 3): void {
    for (let i = 0; i < n; i++) {
      const px = x + i * (size + gap);
      if (i < filled) this.rect(px, y, size, size, color);
      else {
        this.rect(px, y, size, size, C.dark, 0.7);
        this.frame(px, y, size, size, C.steel, 1);
      }
    }
  }

  /** medal glyph (font independent). m = 1..4 */
  medal(x: number, y: number, r: number, m: number, sprites?: { has(k: string): boolean }, shine = 0): void {
    const key = ["", "ui_medal_bronze", "ui_medal_silver", "ui_medal_gold", "ui_medal_ace"][m] ?? "";
    if (key && sprites?.has(key)) {
      this.k.drawSprite({ sprite: key, pos: this.k.vec2(x, y), anchor: "center", width: r * 2, height: r * 2 });
      return;
    }
    const col = [C.grey, C.bronze, C.silver, C.gold, C.ace][m] ?? C.grey;
    // ribbon
    this.k.drawPolygon({
      pts: [this.k.vec2(x - r * 0.6, y - r * 1.7), this.k.vec2(x - r * 0.1, y - r * 1.7), this.k.vec2(x + r * 0.2, y - r * 0.6), this.k.vec2(x - r * 0.3, y - r * 0.6)],
      color: this.col(C.red),
    });
    this.k.drawPolygon({
      pts: [this.k.vec2(x + r * 0.6, y - r * 1.7), this.k.vec2(x + r * 0.1, y - r * 1.7), this.k.vec2(x - r * 0.2, y - r * 0.6), this.k.vec2(x + r * 0.3, y - r * 0.6)],
      color: this.col(C.blue),
    });
    this.circle(x, y, r, C.dark);
    this.circle(x, y, r - 2, col);
    this.ring(x, y, r * 0.7, C.dark, 2, 0.5);
    // star
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (-90 + i * 36) * (Math.PI / 180);
      const rr = i % 2 === 0 ? r * 0.55 : r * 0.23;
      pts.push(this.k.vec2(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
    }
    this.k.drawPolygon({ pts, color: this.col(C.white), opacity: 0.9 });
    if (shine > 0) {
      const sx = x - r + shine * r * 2;
      this.line(sx - 6, y - r * 0.8, sx + 6, y + r * 0.8, C.white, 4, 0.5 * Math.sin(shine * Math.PI));
    }
  }

  /** player aircraft preview (sprite if present, otherwise a vector jet) */
  aircraft(id: string, x: number, y: number, scale: number, sprites: { has(k: string): boolean }, color: RGB = C.steelHi): void {
    const key = "player_" + id;
    if (sprites.has(key)) {
      this.k.drawSprite({ sprite: key, frame: 0, pos: this.k.vec2(x, y), anchor: "center", scale });
      return;
    }
    jet(this, x, y, 12 * scale, color, id);
  }
}

/** vector jet silhouette pointing up; size = half-length */
export function jet(g: Gfx, x: number, y: number, s: number, color: RGB, variant = "falcon", opacity = 1): void {
  const k = g.k;
  const v = (dx: number, dy: number) => k.vec2(x + dx * s, y + dy * s);
  const wing = variant === "bulwark" ? 1.05 : variant === "raptor" ? 0.8 : 0.95;
  const pts =
    variant === "raptor"
      ? [v(0, -1), v(0.18, -0.35), v(wing, 0.35), v(0.22, 0.3), v(0.32, 0.9), v(0, 0.7), v(-0.32, 0.9), v(-0.22, 0.3), v(-wing, 0.35), v(-0.18, -0.35)]
      : [v(0, -1), v(0.16, -0.45), v(wing, 0.15), v(wing, 0.35), v(0.2, 0.3), v(0.4, 0.85), v(0, 0.75), v(-0.4, 0.85), v(-0.2, 0.3), v(-wing, 0.35), v(-wing, 0.15), v(-0.16, -0.45)];
  k.drawPolygon({ pts, color: g.col(color), opacity, outline: { width: 2, color: g.col(C.dark) } });
  k.drawRect({ pos: v(0, -0.35), width: s * 0.16, height: s * 0.35, anchor: "center", color: g.col(C.cyan), opacity: 0.85 * opacity });
}

// ------------------------------------------------------------------ backdrop

/** Animated menu backdrop: dark sky gradient, scrolling terrain grid, cloud bands, patrolling jets. */
export function drawBackdrop(k: KAPLAYCtx, t: number, g?: Gfx): void {
  const gg = g ?? new Gfx(k, "monospace");
  // gradient bands
  const bands = 12;
  for (let i = 0; i < bands; i++) {
    const f = i / (bands - 1);
    const c: RGB = [Math.round(6 + 10 * f), Math.round(10 + 18 * f), Math.round(24 + 34 * f)];
    gg.rect(0, (GAME_H * i) / bands, GAME_W, GAME_H / bands + 1, c);
  }
  // perspective-free radar grid scrolling down
  const step = 48;
  const off = (t * 40) % step;
  for (let y = -step + off; y < GAME_H; y += step) gg.rect(0, y, GAME_W, 1, C.cyanDim, 0.16);
  for (let x = 0; x <= GAME_W; x += step) gg.rect(x, 0, 1, GAME_H, C.cyanDim, 0.12);
  // terrain blobs (islands) drifting down
  const spread = Math.max(1, GAME_W / 480);
  const islands = Math.round(6 * spread);
  for (let i = 0; i < islands; i++) {
    const sy = ((t * 26 + i * 173) % (GAME_H + 240)) - 120;
    const sx = ((i * 97 + 40) * spread) % GAME_W;
    k.drawCircle({ pos: k.vec2(sx, sy), radius: 26 + (i % 3) * 18, color: k.rgb(18, 44, 52), opacity: 0.45 });
    k.drawCircle({ pos: k.vec2(sx + 18, sy + 10), radius: 18 + (i % 2) * 12, color: k.rgb(22, 54, 60), opacity: 0.45 });
  }
  // cloud bands
  const clouds = Math.round(4 * spread);
  for (let i = 0; i < clouds; i++) {
    const sy = ((t * 70 + i * 260) % (GAME_H + 300)) - 150;
    const sx = ((i * 151 * spread) % GAME_W) - 40;
    k.drawRect({ pos: k.vec2(sx, sy), width: 180, height: 26, radius: 13, color: k.rgb(170, 190, 220), opacity: 0.06 });
    k.drawRect({ pos: k.vec2(sx + 40, sy - 12), width: 110, height: 24, radius: 12, color: k.rgb(170, 190, 220), opacity: 0.05 });
  }
  // patrol jets climbing up
  const jets = Math.round(3 * spread);
  const lane = (GAME_W - 140) / Math.max(1, jets - 1);
  for (let i = 0; i < jets; i++) {
    const period = 9 + (i % 3) * 2.5 + (i >> 2) * 0.7;
    const p = ((t + i * 3.1) % period) / period;
    const y = GAME_H + 60 - p * (GAME_H + 160);
    const x = 70 + i * lane + Math.sin(t * 0.7 + i) * 24;
    jet(gg, x + 10, y + 16, 11, C.dark, "falcon", 0.35);
    jet(gg, x, y, 11, [60, 78, 108], i === 1 ? "raptor" : "falcon", 0.75);
    k.drawRect({ pos: k.vec2(x - 1, y + 10), width: 2, height: 30, color: k.rgb(255, 186, 52), opacity: 0.25 });
  }
}

/** CRT scanlines + vignette (subtle). */
export function drawScanlines(k: KAPLAYCtx, opacity = 0.09): void {
  for (let y = 0; y < GAME_H; y += 3) k.drawRect({ pos: k.vec2(0, y), width: GAME_W, height: 1, color: k.rgb(0, 0, 0), opacity });
  k.drawRect({ pos: k.vec2(0, 0), width: GAME_W, height: 24, color: k.rgb(0, 0, 0), opacity: 0.18 });
  k.drawRect({ pos: k.vec2(0, GAME_H - 24), width: GAME_W, height: 24, color: k.rgb(0, 0, 0), opacity: 0.18 });
}

// ------------------------------------------------------------------ widgets

export interface WState {
  hover: boolean;
  focus: boolean;
  pressed: boolean;
  t: number;
}

export interface Widget {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  focusable?: boolean;
  disabled?: boolean;
  /** default ui_select is played on activate unless false */
  sfx?: boolean;
  draw(g: Gfx, s: WState): void;
  activate?(): void;
  /** left/right on keyboard/gamepad */
  adjust?(dir: -1 | 1): void;
  /** pointer drag (x in game units) */
  drag?(x: number, y: number): void;
  /** mouse hover tooltip (desktop); first line is the title */
  tooltip?(): string[] | null;
}

function frameState(g: Gfx, w: Widget, s: WState, accent: RGB): void {
  const active = s.focus || s.hover;
  const fill: RGB = s.pressed ? C.navy3 : active ? C.navy2 : C.navy;
  g.rect(w.x, w.y, w.w, w.h, fill, 0.95, 3);
  g.rect(w.x, w.y + w.h - 3, w.w, 3, C.dark, 0.5);
  g.frame(w.x, w.y, w.w, w.h, w.disabled ? C.steel : active ? accent : C.steel, active ? 2 : 1, 1, 3);
  if (s.focus) {
    const pulse = 0.5 + 0.5 * Math.sin(s.t * 6);
    g.frame(w.x - 3, w.y - 3, w.w + 6, w.h + 6, accent, 1, 0.35 + 0.4 * pulse, 4);
    // arrow chevron
    g.k.drawPolygon({
      pts: [g.k.vec2(w.x - 14, w.y + w.h / 2 - 7), g.k.vec2(w.x - 5, w.y + w.h / 2), g.k.vec2(w.x - 14, w.y + w.h / 2 + 7)],
      color: g.col(accent),
    });
  }
}

export interface ButtonOpts {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string | (() => string);
  sub?: string | (() => string);
  accent?: RGB;
  size?: number;
  disabled?: boolean | (() => boolean);
  sfx?: boolean;
  onClick: () => void;
  /** extra draw on top (icons etc.) */
  deco?: (g: Gfx, s: WState, w: Widget) => void;
  align?: "center" | "left";
  /** shortcut badge (keycap) drawn on the top-right corner; return null to hide (e.g. touch mode) */
  cap?: () => string | null;
  tooltip?: () => string[] | null;
}

export function button(o: ButtonOpts): Widget {
  const w: Widget = {
    id: o.id,
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    sfx: o.sfx,
    get disabled() {
      return typeof o.disabled === "function" ? o.disabled() : !!o.disabled;
    },
    draw(g, s) {
      const acc = o.accent ?? C.amber;
      frameState(g, w, s, acc);
      const label = typeof o.label === "function" ? o.label() : o.label;
      const sub = typeof o.sub === "function" ? o.sub() : o.sub;
      const size = o.size ?? 18;
      const col = w.disabled ? C.grey : s.focus || s.hover ? C.white : C.text;
      const left = o.align === "left";
      const tx = left ? w.x + 16 : w.x + w.w / 2;
      // Farsi glyphs are taller than the pixel font: label + sub line get more room (centres at ~31% / ~74%)
      const fa = !!sub && (hasArabicScript(label) || hasArabicScript(sub));
      const ty = sub ? (fa ? w.y + w.h * 0.31 : w.y + w.h / 2 - 8) : w.y + w.h / 2;
      g.text(label, tx, ty + (s.pressed ? 1 : 0), { size, color: col, anchor: left ? "left" : "center", outline: -1 });
      if (sub) g.text(sub, tx, fa ? w.y + w.h * 0.74 : ty + size * 0.5 + 6, { size: 11, color: w.disabled ? C.grey : acc, anchor: left ? "left" : "center" });
      o.deco?.(g, s, w);
      const cap = o.cap?.();
      if (cap) g.keycap(cap, w.x + w.w - 8, w.y, { anchor: "right", size: 9, color: s.focus || s.hover ? acc : C.steelHi });
    },
    activate: o.onClick,
    tooltip: o.tooltip,
  };
  return w;
}

export interface SliderOpts {
  id: string;
  x: number;
  y: number;
  w: number;
  label: string;
  get: () => number;
  set: (v: number) => void;
  step?: number;
  accent?: RGB;
}

/** 0..1 slider; row height 56 */
export function slider(o: SliderOpts): Widget {
  const step = o.step ?? 0.05;
  const trackX = () => w.x + 16;
  const trackW = () => w.w - 32;
  const w: Widget = {
    id: o.id,
    x: o.x,
    y: o.y,
    w: o.w,
    h: 56,
    sfx: false,
    draw(g, s) {
      const acc = o.accent ?? C.cyan;
      frameState(g, w, s, acc);
      const v = o.get();
      g.text(o.label, w.x + 16, w.y + 16, { size: 14, color: s.focus || s.hover ? C.white : C.text, anchor: "left" });
      g.text(`${Math.round(v * 100)}%`, w.x + w.w - 16, w.y + 16, { size: 14, color: acc, anchor: "right" });
      const ty = w.y + 38;
      g.rect(trackX(), ty - 3, trackW(), 6, C.dark, 1, 3);
      g.rect(trackX(), ty - 3, trackW() * v, 6, acc, 1, 3);
      for (let i = 0; i <= 10; i++) g.rect(trackX() + (trackW() * i) / 10 - 0.5, ty + 5, 1, i % 5 === 0 ? 5 : 3, C.steel);
      const kx = trackX() + trackW() * v;
      g.rect(kx - 6, ty - 9, 12, 18, s.focus || s.hover ? C.white : C.steelHi, 1, 2);
      g.frame(kx - 6, ty - 9, 12, 18, C.dark, 1, 1, 2);
    },
    adjust(dir) {
      o.set(Math.max(0, Math.min(1, Math.round((o.get() + dir * step) / step) * step)));
    },
    drag(x) {
      const v = (x - trackX()) / trackW();
      o.set(Math.max(0, Math.min(1, Math.round(v / 0.01) * 0.01)));
    },
  };
  return w;
}

export interface ToggleOpts {
  id: string;
  x: number;
  y: number;
  w: number;
  label: string;
  get: () => boolean;
  set: (v: boolean) => void;
  accent?: RGB;
}

/** on/off toggle; row height 50 */
export function toggle(o: ToggleOpts): Widget {
  const w: Widget = {
    id: o.id,
    x: o.x,
    y: o.y,
    w: o.w,
    h: 50,
    draw(g, s) {
      const acc = o.accent ?? C.amber;
      frameState(g, w, s, acc);
      const on = o.get();
      g.text(o.label, w.x + 16, w.y + w.h / 2, { size: 15, color: s.focus || s.hover ? C.white : C.text, anchor: "left" });
      const sw = 64;
      const sx = w.x + w.w - sw - 14;
      const sy = w.y + w.h / 2 - 12;
      g.rect(sx, sy, sw, 24, on ? C.amberDim : C.dark, 1, 12);
      g.frame(sx, sy, sw, 24, on ? acc : C.steel, 1, 1, 12);
      g.circle(on ? sx + sw - 12 : sx + 12, sy + 12, 9, on ? C.white : C.steel);
      const st = tr(on ? "common.on" : "common.off");
      // the knob side + colour already say it: skip the word when a translation does not fit beside the knob
      if (g.measure(st, 10) <= sw - 26) g.text(st, on ? sx + 20 : sx + sw - 20, sy + 12, { size: 10, color: on ? C.white : C.grey, anchor: "center" });
    },
    activate() {
      o.set(!o.get());
    },
    adjust(dir) {
      o.set(dir > 0);
    },
  };
  return w;
}

export interface SelectorOpts<T> {
  id: string;
  x: number;
  y: number;
  w: number;
  label: string;
  options: Array<{ value: T; label: string }>;
  get: () => T;
  set: (v: T) => void;
  accent?: RGB;
}

/** cycle through options with left/right or tap; row height 50 */
export function selector<T>(o: SelectorOpts<T>): Widget {
  const idx = () => Math.max(0, o.options.findIndex((q) => q.value === o.get()));
  const w: Widget = {
    id: o.id,
    x: o.x,
    y: o.y,
    w: o.w,
    h: 50,
    draw(g, s) {
      const acc = o.accent ?? C.cyan;
      frameState(g, w, s, acc);
      g.text(o.label, w.x + 16, w.y + w.h / 2, { size: 15, color: s.focus || s.hover ? C.white : C.text, anchor: "left" });
      const cur = o.options[idx()]!;
      const cx = w.x + w.w - 84;
      g.text(cur.label, cx, w.y + w.h / 2, { size: 14, color: acc, anchor: "center" });
      const k = g.k;
      const ay = w.y + w.h / 2;
      k.drawPolygon({ pts: [k.vec2(cx - 66, ay), k.vec2(cx - 58, ay - 7), k.vec2(cx - 58, ay + 7)], color: g.col(s.focus ? acc : C.steel) });
      k.drawPolygon({ pts: [k.vec2(cx + 66, ay), k.vec2(cx + 58, ay - 7), k.vec2(cx + 58, ay + 7)], color: g.col(s.focus ? acc : C.steel) });
    },
    activate() {
      o.set(o.options[(idx() + 1) % o.options.length]!.value);
    },
    adjust(dir) {
      const n = o.options.length;
      o.set(o.options[(idx() + dir + n) % n]!.value);
    },
  };
  return w;
}

/** non-interactive custom draw region */
export function label(id: string, draw: (g: Gfx) => void): Widget {
  return { id, x: 0, y: 0, w: 0, h: 0, focusable: false, draw: (g) => draw(g) };
}
