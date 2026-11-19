/**
 * Screen-layout helpers for the UI scenes. GAME_W is 480 on phones (portrait layouts) and up to MAX_GAME_W on
 * landscape desktops (wide multi-column layouts). GAME_H is always 854.
 */
import { GAME_H, GAME_W, WIDE } from "../contracts";

export { WIDE };
export const W = GAME_W;
export const H = GAME_H;
export const CX = GAME_W / 2;
/** outer horizontal margin */
export const M = WIDE ? Math.round(Math.max(28, Math.min(48, GAME_W * 0.03))) : 20;
/** gutter between columns */
export const GAP = WIDE ? 24 : 12;
/** y of the bottom button row (back / primary action) */
export const BOTTOM_Y = 776;
export const BOTTOM_H = 54;

export interface Col {
  x: number;
  w: number;
}

/**
 * Split [x0, x1] into columns. `spec` entries > 1 are fixed widths, entries <= 1 are weights for the remaining space.
 */
export function cols(spec: number[], gap = GAP, x0 = M, x1 = GAME_W - M): Col[] {
  const avail = x1 - x0 - gap * (spec.length - 1);
  const fixed = spec.filter((s) => s > 1).reduce((a, b) => a + b, 0);
  const weights = spec.filter((s) => s <= 1).reduce((a, b) => a + b, 0) || 1;
  const rest = Math.max(0, avail - fixed);
  const out: Col[] = [];
  let x = x0;
  for (const s of spec) {
    const w = Math.floor(s > 1 ? s : (rest * s) / weights);
    out.push({ x, w });
    x += w + gap;
  }
  return out;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
