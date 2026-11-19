/** Weapon / pickup icons: `ui_icon_<id>` sprite when available, otherwise vector glyphs. */
import { C, type RGB } from "./theme";
import type { Gfx } from "./widgets";

export function weaponIcon(g: Gfx, id: string, x: number, y: number, size: number, sprites: { has(k: string): boolean }, color?: RGB, opacity = 1): void {
  const key = "ui_icon_" + id;
  const k = g.k;
  const a = Math.max(0, Math.min(1, opacity));
  if (a <= 0.003) return;
  if (sprites.has(key)) {
    k.drawSprite({ sprite: key, pos: k.vec2(x, y), anchor: "center", width: size, height: size, opacity: a });
    return;
  }
  const s = size / 2;
  const col = color ?? C.amber;
  const v = (dx: number, dy: number) => k.vec2(x + dx * s, y + dy * s);
  switch (id) {
    case "vulcan": {
      // one tracer round tilted 45 deg (nose up-right) with speed streaks. The old glyph (two upright bars) read as
      // the pause icon "||" on the touch swap button.
      const ca = Math.SQRT1_2 * s * 0.62;
      const P = (u: number, w: number) => k.vec2(x + (u + w) * ca, y + (u - w) * ca);
      k.drawPolygon({ pts: [P(0, 1.05), P(0.3, 0.45), P(0.3, -0.45), P(-0.3, -0.45), P(-0.3, 0.45)], color: g.col(col), opacity: a });
      k.drawPolygon({ pts: [P(0.36, -0.45), P(0.36, -0.68), P(-0.36, -0.68), P(-0.36, -0.45)], color: g.col(col), opacity: 0.6 * a });
      for (const [u, w0, w1] of [
        [0, -0.85, -1.35],
        [0.42, -0.25, -1.0],
        [-0.42, -0.25, -1.0],
      ] as const) {
        const p0 = P(u, w0);
        const p1 = P(u, w1);
        g.line(p0.x, p0.y, p1.x, p1.y, col, 2, 0.75 * a);
      }
      break;
    }
    case "spread":
      for (const ang of [-40, -20, 0, 20, 40]) {
        const r = (ang - 90) * (Math.PI / 180);
        g.line(x, y + s * 0.7, x + Math.cos(r) * s * 0.95, y + s * 0.7 + Math.sin(r) * s * 1.4, col, 2, a);
      }
      break;
    case "homing":
      k.drawPolygon({ pts: [v(0, -0.9), v(0.25, -0.4), v(0.25, 0.5), v(-0.25, 0.5), v(-0.25, -0.4)], color: g.col(col), opacity: a });
      g.rect(x - s * 0.15, y + s * 0.5, s * 0.3, s * 0.35, C.red, a);
      g.ring(x, y, s * 0.95, col, 1, 0.6 * a);
      break;
    case "laser":
      g.rect(x - s * 0.18, y - s, s * 0.36, s * 2, col, 0.5 * a);
      g.rect(x - s * 0.07, y - s, s * 0.14, s * 2, C.white, a);
      break;
    case "bomb":
      g.circle(x, y + s * 0.15, s * 0.55, col, a);
      k.drawPolygon({ pts: [v(-0.35, -0.3), v(0.35, -0.3), v(0.5, -0.9), v(-0.5, -0.9)], color: g.col(col), opacity: a });
      break;
    case "rocket":
      for (const dx of [-0.4, 0.4]) {
        k.drawPolygon({ pts: [v(dx, -0.95), v(dx + 0.18, -0.55), v(dx + 0.18, 0.6), v(dx - 0.18, 0.6), v(dx - 0.18, -0.55)], color: g.col(col), opacity: a });
        g.rect(x + dx * s - s * 0.1, y + s * 0.6, s * 0.2, s * 0.3, C.red, a);
      }
      break;
    case "pmissile":
      k.drawPolygon({ pts: [v(0, -0.95), v(0.22, -0.5), v(0.22, 0.7), v(-0.22, 0.7), v(-0.22, -0.5)], color: g.col(col), opacity: a });
      g.ring(x, y, s * 0.6, C.red, 2, a);
      g.line(x - s, y, x - s * 0.6, y, C.red, 2, a);
      g.line(x + s * 0.6, y, x + s, y, C.red, 2, a);
      break;
    case "heavy":
      g.circle(x, y + s * 0.1, s * 0.85, col, a);
      g.circle(x, y + s * 0.1, s * 0.4, C.dark, a);
      g.rect(x - s * 0.15, y - s, s * 0.3, s * 0.4, col, a);
      break;
    case "flare":
      for (let i = 0; i < 6; i++) {
        const r = (i * 60 - 90) * (Math.PI / 180);
        g.line(x, y, x + Math.cos(r) * s, y + Math.sin(r) * s, col, 2, a);
      }
      g.circle(x, y, s * 0.3, C.white, a);
      break;
    default:
      g.circle(x, y, s * 0.6, col, a);
  }
}
