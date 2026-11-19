/** Visual theme: retro military arcade (navy/steel panels, amber + cyan accents). */
import type { KAPLAYCtx } from "kaplay";
import { FONT, type Services } from "../contracts";

export type RGB = [number, number, number];

export const C = {
  bg: [6, 10, 22] as RGB,
  navy: [12, 20, 42] as RGB,
  navy2: [20, 32, 62] as RGB,
  navy3: [30, 46, 84] as RGB,
  steel: [70, 92, 128] as RGB,
  steelHi: [128, 150, 188] as RGB,
  amber: [255, 186, 52] as RGB,
  amberDim: [150, 104, 28] as RGB,
  cyan: [72, 222, 255] as RGB,
  cyanDim: [30, 110, 140] as RGB,
  white: [236, 242, 252] as RGB,
  text: [200, 210, 228] as RGB,
  grey: [158, 170, 192] as RGB,
  dark: [4, 6, 12] as RGB,
  red: [255, 76, 64] as RGB,
  green: [110, 232, 120] as RGB,
  blue: [80, 160, 255] as RGB,
  bronze: [205, 127, 50] as RGB,
  silver: [200, 210, 225] as RGB,
  gold: [255, 210, 70] as RGB,
  ace: [120, 240, 255] as RGB,
};

export const MEDAL_NAMES = ["NONE", "BRONZE", "SILVER", "GOLD", "ACE"] as const;
export const MEDAL_COLORS: RGB[] = [C.grey, C.bronze, C.silver, C.gold, C.ace];

export function hexToRgb(hex: string | undefined, fallback: RGB): RGB {
  if (!hex) return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Resolve the UI font: the Asset agent's bitmap font when loaded, else the browser monospace. */
export function resolveFont(svc: Services): string {
  const k = svc.k as KAPLAYCtx & { getFont?: (n: string) => unknown; getBitmapFont?: (n: string) => unknown };
  try {
    if (svc.sprites.has(FONT)) return FONT;
    if (k.getBitmapFont?.(FONT) || k.getFont?.(FONT)) return FONT;
  } catch {
    /* ignore */
  }
  return "monospace";
}

/** The outline variant of the UI font (sr_font_outline: baked outline + drop shadow), else the regular font. */
export function resolveOutlineFont(svc: Services, base: string): string {
  const k = svc.k as KAPLAYCtx & { getBitmapFont?: (n: string) => unknown };
  try {
    if (k.getBitmapFont?.(FONT_OUTLINE)) return FONT_OUTLINE;
  } catch {
    /* ignore */
  }
  return base;
}

export const FONT_OUTLINE = "sr_font_outline";

/** KAPLAY treats [ ] as style tags; escape user / data strings before drawing. */
export function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtNum(n: number): string {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
