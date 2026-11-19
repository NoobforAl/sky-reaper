/** Client (CSS px) <-> game-unit conversion matching KAPLAY's centred letterbox. */
import { GAME_H, GAME_W } from "../contracts";

export interface ViewRect {
  /** CSS px of the game area inside the window */
  left: number;
  top: number;
  width: number;
  height: number;
  /** CSS px per game unit */
  scale: number;
}

export function gameRect(canvas: HTMLCanvasElement): ViewRect {
  const r = canvas.getBoundingClientRect();
  const scale = Math.min(r.width / GAME_W, r.height / GAME_H) || 1;
  const w = GAME_W * scale;
  const h = GAME_H * scale;
  return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h, scale };
}

export function clientToGame(canvas: HTMLCanvasElement, cx: number, cy: number): { x: number; y: number } {
  const v = gameRect(canvas);
  return { x: (cx - v.left) / v.scale, y: (cy - v.top) / v.scale };
}

let probe: HTMLDivElement | null = null;

/**
 * Safe-area insets (notch / home indicator) converted to game units, counting only the part that overlaps the
 * letterboxed game area. Cached per frame by callers if needed (cheap anyway).
 */
export function safeInsets(canvas: HTMLCanvasElement | null): { top: number; bottom: number; left: number; right: number } {
  const zero = { top: 0, bottom: 0, left: 0, right: 0 };
  if (!canvas || typeof document === "undefined") return zero;
  try {
    if (!probe) {
      probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
        "padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);" +
        "padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);";
      document.body.appendChild(probe);
    }
    const cs = getComputedStyle(probe);
    const st = parseFloat(cs.paddingTop) || 0;
    const sb = parseFloat(cs.paddingBottom) || 0;
    const sl = parseFloat(cs.paddingLeft) || 0;
    const sr = parseFloat(cs.paddingRight) || 0;
    const v = gameRect(canvas);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      top: Math.max(0, st - v.top) / v.scale,
      bottom: Math.max(0, sb - (vh - (v.top + v.height))) / v.scale,
      left: Math.max(0, sl - v.left) / v.scale,
      right: Math.max(0, sr - (vw - (v.left + v.width))) / v.scale,
    };
  } catch {
    return zero;
  }
}
