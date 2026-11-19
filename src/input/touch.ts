/**
 * On-screen touch controls (mobile only).
 *
 *  Steering : hold anywhere on the playfield = fly AND fire. Relative drag (default) or floating joystick.
 *             Holding the finger still keeps firing; lifting it stops (unless the AUTO-FIRE setting is on).
 *  Icons    : BOMB + FLARE (right thumb, primary), air-weapon swap + ordnance swap (bottom-left, small),
 *             pause (HUD top bar). State is drawn on the icons: flare cooldown sweep, bomb count badge,
 *             disabled look with no bombs, pressed scale + flash. Optional haptic tick on press.
 *  Multi-touch safe (tracked by pointerId). A finger that STARTS on an icon only presses that icon (never
 *  steers / fires); a steering finger that slides over an icon never triggers it (icons react to touch-down only).
 *  All geometry is in game units, so it scales with the letterboxed canvas automatically.
 */
import type { KAPLAYCtx } from "kaplay";
import { GAME_H, GAME_W, WIDE } from "../contracts";
import { readableSize } from "../ui/widgets";

export type TouchBtnId = "bomb" | "special" | "weaponNext" | "groundNext" | "pause";
export type TouchMoveMode = "drag" | "stick";

/** per-frame HUD state the icons visualise (all optional: the controls degrade to plain glyphs) */
export interface TouchDrawExtra {
  /** flare readiness 0..1 (1 = ready) */
  flareReady?: number;
  bombs?: number;
  airWeapon?: string;
  groundWeapon?: string;
  /** draws a weapon / pickup icon (`ui_icon_<id>` sprite or vector fallback) centred at x,y */
  icon?: (id: string, x: number, y: number, size: number, color: [number, number, number], opacity?: number) => void;
}

export interface TouchBtn {
  id: TouchBtnId;
  x: number;
  y: number;
  /** drawn radius */
  r: number;
  /** hit radius (>= 22 CSS px, i.e. a >= 44 CSS px target on a 390px-wide phone) */
  hitR: number;
  pointer: number | null;
  /** performance.now() of the last press (edge latch, consumed by takePress) */
  pressedAt: number;
  /** performance.now() of the last press (visual flash, never consumed) */
  flashAt: number;
  color: [number, number, number];
  /** draw opacity multiplier, eased toward FADE_UNDER_SHIP while the player's ship is under the icon */
  fade: number;
}

const STICK_R = 64;
const DEADZONE = 0.12;
const DRAG_SENS = 1.15;
/** without a known player position, the target sits this far above the finger so it is not hidden by it */
const FINGER_OFFSET_Y = 96;
const FLASH_MS = 180;
/** icon opacity while the player's ship overlaps it (the icon must never hide the ship or bullets near it) */
const FADE_UNDER_SHIP = 0.12;
/** extra distance (game units) around an icon's drawn radius that counts as "ship underneath" (ship half-size ~24) */
const FADE_MARGIN = 30;
/** fade speed (1/s): ~0.1 s to go transparent, a little slower to come back */
const FADE_OUT_RATE = 10;
const FADE_IN_RATE = 6;

/** HUD bottom strip height (src/ui/hud.ts: portrait BOTTOM_H 58; wide: corner plates PAD 16 + BOT_H 66 + key-hint bar) */
const hudBottom = (): number => (WIDE ? 128 : 58);

/**
 * Circle outline drawn as plain line quads. KAPLAY's stroked circle adds a filled join circle per segment,
 * which is ~10x more geometry (measurable on phones).
 */
function ringQuads(k: KAPLAYCtx, x: number, y: number, r: number, color: ReturnType<KAPLAYCtx["rgb"]>, width: number, opacity: number): void {
  const n = Math.max(12, Math.min(32, Math.round(r * 0.6)));
  const step = (Math.PI * 2) / n;
  const ext = 1 + width / Math.max(4, r * step * 2);
  let px = x + r;
  let py = y;
  for (let i = 1; i <= n; i++) {
    const nx = x + Math.cos(i * step) * r;
    const ny = y + Math.sin(i * step) * r;
    const mx = (px + nx) / 2;
    const my = (py + ny) / 2;
    k.drawLine({ p1: k.vec2(mx + (px - mx) * ext, my + (py - my) * ext), p2: k.vec2(mx + (nx - mx) * ext, my + (ny - my) * ext), width, color, opacity });
    px = nx;
    py = ny;
  }
}

function haptic(): void {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number) => boolean };
    if (typeof nav.vibrate === "function") nav.vibrate(10);
  } catch {
    /* not allowed (no user activation / iframe policy) */
  }
}

export class TouchControls {
  mode: TouchMoveMode = "drag";
  buttons: TouchBtn[];
  private movePointer: number | null = null;
  private last = { x: 0, y: 0 };
  private stickBase = { x: 0, y: 0 };
  private stickCur = { x: 0, y: 0 };
  target: { x: number; y: number } | null = null;
  private anchored = false;

  constructor(private playerPos: () => { x: number; y: number } | null) {
    const b = (id: TouchBtnId, r: number, hitR: number, color: [number, number, number]): TouchBtn => ({
      id,
      x: 0,
      y: 0,
      r,
      hitR,
      pointer: null,
      pressedAt: -1,
      flashAt: -1,
      color,
      fade: 1,
    });
    this.buttons = [
      b("bomb", 36, 46, [255, 150, 70]),
      b("special", 30, 40, [120, 220, 255]),
      b("weaponNext", 22, 29, [72, 222, 255]),
      b("groundNext", 22, 29, [255, 186, 52]),
      b("pause", 19, 28, [200, 210, 230]),
    ];
    this.layout({ top: 0, bottom: 0, left: 0, right: 0 });
  }

  /** recompute button positions (safe-area aware) */
  layout(ins: { top: number; bottom: number; left: number; right: number }): void {
    const R = GAME_W - ins.right;
    const B = GAME_H - ins.bottom - hudBottom();
    const L = ins.left;
    const set = (id: TouchBtnId, x: number, y: number) => {
      const btn = this.buttons.find((q) => q.id === id)!;
      btn.x = x;
      btn.y = y;
    };
    // primary actions stacked on the right edge: easy right-thumb reach, bomb lowest (most used)
    set("bomb", R - 52, B - 54);
    set("special", R - 52, B - 146);
    // small swap icons bottom-left, just above the HUD strip
    set("weaponNext", L + 34, B - 34);
    set("groundNext", L + 92, B - 34);
    // pause: portrait = inside the HUD top bar between the (shortened) progress bar and the lives;
    // wide = left of the top-right lives plate
    if (WIDE) set("pause", R - 16 - 220 - 36, ins.top + 16 + 25);
    else set("pause", 318 + L, ins.top + 30);
  }

  hitButton(x: number, y: number): TouchBtn | null {
    let best: TouchBtn | null = null;
    let bd = Infinity;
    for (const b of this.buttons) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= b.hitR && d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  down(id: number, x: number, y: number): void {
    const btn = this.hitButton(x, y);
    if (btn) {
      // a finger that starts on an icon only presses the icon (never steers / fires)
      if (btn.pointer === null) {
        const now = performance.now();
        btn.pressedAt = now;
        btn.flashAt = now;
        haptic();
      }
      btn.pointer = id;
      return;
    }
    if (this.movePointer !== null) return; // second steering finger ignored
    this.movePointer = id;
    this.last = { x, y };
    if (this.mode === "stick") {
      this.stickBase = { x, y };
      this.stickCur = { x, y };
      return;
    }
    const p = this.playerPos();
    if (p) {
      this.anchored = true;
      this.target = { x: p.x, y: p.y };
    } else {
      this.anchored = false;
      this.target = this.clamp({ x, y: y - FINGER_OFFSET_Y });
    }
  }

  /** only the steering finger moves the ship; icons never react to a finger sliding over them */
  move(id: number, x: number, y: number): void {
    if (id !== this.movePointer) return;
    if (this.mode === "stick") {
      this.stickCur = { x, y };
      return;
    }
    if (this.anchored && this.target) {
      this.target = this.clamp({ x: this.target.x + (x - this.last.x) * DRAG_SENS, y: this.target.y + (y - this.last.y) * DRAG_SENS });
    } else {
      this.target = this.clamp({ x, y: y - FINGER_OFFSET_Y });
    }
    this.last = { x, y };
  }

  up(id: number): void {
    for (const b of this.buttons) if (b.pointer === id) b.pointer = null;
    if (id === this.movePointer) {
      this.movePointer = null;
      this.target = null;
    }
  }

  reset(): void {
    for (const b of this.buttons) {
      b.pointer = null;
      b.pressedAt = -1;
      b.flashAt = -1;
      b.fade = 1;
    }
    this.movePointer = null;
    this.target = null;
  }

  private clamp(p: { x: number; y: number }): { x: number; y: number } {
    return { x: Math.max(14, Math.min(GAME_W - 14, p.x)), y: Math.max(60, Math.min(GAME_H - 30, p.y)) };
  }

  /** a steering finger is down (drag or joystick) */
  get moving(): boolean {
    return this.movePointer !== null;
  }

  /** hold-to-fire: the ship fires while a steering finger is down, moving or held still */
  get firing(): boolean {
    return this.movePointer !== null;
  }

  held(id: TouchBtnId): boolean {
    return this.buttons.find((b) => b.id === id)!.pointer !== null;
  }

  /** consume a press edge newer than `maxAgeMs` */
  takePress(id: TouchBtnId, maxAgeMs = 400): boolean {
    const b = this.buttons.find((q) => q.id === id)!;
    if (b.pressedAt < 0) return false;
    const fresh = performance.now() - b.pressedAt <= maxAgeMs;
    b.pressedAt = -1;
    return fresh;
  }

  /** analog vector for stick mode (0,0 otherwise) */
  stick(): { x: number; y: number } {
    if (this.mode !== "stick" || this.movePointer === null) return { x: 0, y: 0 };
    let dx = (this.stickCur.x - this.stickBase.x) / STICK_R;
    let dy = (this.stickCur.y - this.stickBase.y) / STICK_R;
    const m = Math.hypot(dx, dy);
    if (m < DEADZONE) return { x: 0, y: 0 };
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    return { x: dx, y: dy };
  }

  // ------------------------------------------------------------------ drawing

  draw(k: KAPLAYCtx, font: string, extra: TouchDrawExtra = {}): void {
    const t = k.time();
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, k.dt()));
    const dark = k.rgb(8, 12, 26);
    const ship = this.playerPos();
    for (const b of this.buttons) {
      const on = b.pointer !== null;
      // ship underneath -> nearly transparent so the icon never hides the ship or the bullets around it
      // (a pressed icon stays visible: the finger is on it anyway)
      const under = !on && !!ship && Math.hypot(ship.x - b.x, ship.y - b.y) < b.r + FADE_MARGIN;
      const want = under ? FADE_UNDER_SHIP : 1;
      b.fade += (want - b.fade) * Math.min(1, dt * (want < b.fade ? FADE_OUT_RATE : FADE_IN_RATE));
      const A = b.fade;
      const flash = b.flashAt >= 0 ? Math.max(0, 1 - (now - b.flashAt) / FLASH_MS) : 0;
      const disabled = (b.id === "bomb" && extra.bombs !== undefined && extra.bombs <= 0) || (b.id === "special" && (extra.flareReady ?? 1) < 1);
      const s = on ? 0.88 : 1 + 0.06 * flash; // pressed: shrink; release: tiny pop
      const r = b.r * s;
      const [cr, cg, cb] = disabled ? ([150, 160, 180] as [number, number, number]) : b.color;
      const col = k.rgb(cr, cg, cb);
      // plate + ring
      k.drawCircle({ pos: k.vec2(b.x, b.y), radius: r, color: dark, opacity: (on ? 0.7 : 0.48) * A });
      if (flash > 0) k.drawCircle({ pos: k.vec2(b.x, b.y), radius: r, color: k.rgb(255, 255, 255), opacity: 0.35 * flash * A });
      ringQuads(k, b.x, b.y, r, col, on ? 3 : 2, (disabled ? 0.45 : on ? 1 : 0.75) * A);
      // nearly invisible: keep only the faint ring as a position cue
      if (A < 0.2) continue;
      // cooldown sweep (flare): filled pie that grows back to full
      if (b.id === "special" && extra.flareReady !== undefined && extra.flareReady < 1) {
        k.drawCircle({ pos: k.vec2(b.x, b.y), radius: r - 3, start: -90, end: -90 + 360 * extra.flareReady, color: k.rgb(120, 220, 255), opacity: 0.28 * A });
      }
      this.drawGlyph(k, b, r, col, extra, A);
      if (disabled) k.drawCircle({ pos: k.vec2(b.x, b.y), radius: r - 2, color: dark, opacity: 0.4 * A });
      // badges
      if (b.id === "bomb" && extra.bombs !== undefined) {
        const n = Math.max(0, Math.floor(extra.bombs));
        this.badge(k, font, b.x + r * 0.72, b.y - r * 0.72, n > 99 ? "99" : String(n), n > 0 ? k.rgb(255, 186, 52) : k.rgb(255, 76, 64), A);
      }
      if (b.id === "special" && extra.flareReady !== undefined && extra.flareReady >= 1) {
        // ready pulse
        ringQuads(k, b.x, b.y, r + 3, k.rgb(120, 220, 255), 1, (0.25 + 0.25 * Math.sin(t * 6)) * A);
      }
    }
    if (this.movePointer !== null) {
      if (this.mode === "stick") {
        const st = this.stick();
        ringQuads(k, this.stickBase.x, this.stickBase.y, STICK_R, k.rgb(120, 200, 255), 2, 0.5);
        k.drawCircle({ pos: k.vec2(this.stickBase.x + st.x * STICK_R, this.stickBase.y + st.y * STICK_R), radius: 22, color: k.rgb(120, 200, 255), opacity: 0.45 });
      } else if (this.target) {
        const a = 0.35 + 0.15 * Math.sin(t * 10);
        ringQuads(k, this.target.x, this.target.y, 10, k.rgb(120, 220, 255), 1, a);
      }
    }
  }

  private badge(k: KAPLAYCtx, font: string, x: number, y: number, text: string, color: ReturnType<KAPLAYCtx["rgb"]>, A = 1): void {
    const size = readableSize(10);
    const w = Math.max(18, text.length * size * 0.62 + 8);
    k.drawRect({ pos: k.vec2(x, y), width: w, height: size + 6, anchor: "center", radius: (size + 6) / 2, color: k.rgb(8, 12, 26), opacity: 0.92 * A });
    k.drawRect({ pos: k.vec2(x, y), width: w, height: size + 6, anchor: "center", radius: (size + 6) / 2, fill: false, outline: { width: 1.5, color, opacity: A } });
    k.drawText({ text, pos: k.vec2(x, y + 1), anchor: "center", size, font, color, opacity: A });
  }

  /** icon inside a button: weapon sprites via extra.icon, vector glyphs otherwise */
  private drawGlyph(k: KAPLAYCtx, b: TouchBtn, r: number, col: ReturnType<KAPLAYCtx["rgb"]>, extra: TouchDrawExtra, A: number): void {
    const c: [number, number, number] = [col.r, col.g, col.b];
    const { x, y } = b;
    switch (b.id) {
      case "bomb": {
        const id = extra.groundWeapon || "bomb";
        if (extra.icon) extra.icon(id, x, y + 1, r * 1.15, c, A);
        else vecBomb(k, x, y, r * 0.55, col, A);
        break;
      }
      case "special":
        if (extra.icon) extra.icon("flare", x, y, r * 1.1, c, A);
        else vecFlare(k, x, y, r * 0.55, col, A);
        break;
      case "weaponNext":
      case "groundNext": {
        const id = b.id === "weaponNext" ? extra.airWeapon : extra.groundWeapon;
        // VULCAN: ui_icon_vulcan is a single tilted round (the old two-upright-bullets art read as the pause "||");
        // without an icon drawer the vector tracer below is used, never bars
        if (id === "vulcan" && !extra.icon) vecTracer(k, x - 1, y - 1, r * 0.62, col, A);
        else if (id && extra.icon) extra.icon(id, x, y, r * 1.2, c, A);
        else k.drawText({ text: b.id === "weaponNext" ? "W" : "O", pos: k.vec2(x, y), anchor: "center", size: readableSize(12), color: col, opacity: A });
        swapBadge(k, x + r * 0.7, y + r * 0.7, col, A);
        break;
      }
      case "pause":
        k.drawRect({ pos: k.vec2(x - 5, y), width: 4, height: 14, anchor: "center", color: col, opacity: A });
        k.drawRect({ pos: k.vec2(x + 5, y), width: 4, height: 14, anchor: "center", color: col, opacity: A });
        break;
    }
  }
}

/** small circular "swap" arrows in a dark disc (bottom-right of the swap icons) */
function swapBadge(k: KAPLAYCtx, x: number, y: number, col: ReturnType<KAPLAYCtx["rgb"]>, A = 1): void {
  const r = 5.5;
  k.drawCircle({ pos: k.vec2(x, y), radius: 9.5, color: k.rgb(8, 12, 26), opacity: 0.95 * A });
  // two clockwise arcs (each ~130 deg) with an arrow head at their end
  for (const a0 of [-160, 20]) {
    const seg = 5;
    for (let i = 0; i < seg; i++) {
      const p = ((a0 + (130 * i) / seg) * Math.PI) / 180;
      const q = ((a0 + (130 * (i + 1)) / seg) * Math.PI) / 180;
      k.drawLine({ p1: k.vec2(x + Math.cos(p) * r, y + Math.sin(p) * r), p2: k.vec2(x + Math.cos(q) * r, y + Math.sin(q) * r), width: 1.8, color: col, opacity: A });
    }
    const e = ((a0 + 130) * Math.PI) / 180;
    const ex = x + Math.cos(e) * r;
    const ey = y + Math.sin(e) * r;
    // tangent (clockwise in screen space) and radial unit vectors
    const tx = -Math.sin(e);
    const ty = Math.cos(e);
    const rx = Math.cos(e);
    const ry = Math.sin(e);
    k.drawTriangle({ p1: k.vec2(ex + tx * 3.5, ey + ty * 3.5), p2: k.vec2(ex + rx * 3, ey + ry * 3), p3: k.vec2(ex - rx * 3, ey - ry * 3), color: col, opacity: A });
  }
}

/** one tracer round tilted 45 deg (nose up-right) with three speed streaks: the VULCAN swap glyph */
function vecTracer(k: KAPLAYCtx, x: number, y: number, s: number, col: ReturnType<KAPLAYCtx["rgb"]>, A = 1): void {
  const ca = Math.SQRT1_2;
  // local frame: +v = nose direction (up-right), +u = perpendicular
  const P = (u: number, v: number) => k.vec2(x + (u * ca + v * ca) * s, y + (u * ca - v * ca) * s);
  // round (pointed nose + body) and a darker casing rim
  k.drawPolygon({ pts: [P(0, 1.05), P(0.3, 0.45), P(0.3, -0.45), P(-0.3, -0.45), P(-0.3, 0.45)], color: col, opacity: A });
  k.drawPolygon({ pts: [P(0.36, -0.45), P(0.36, -0.68), P(-0.36, -0.68), P(-0.36, -0.45)], color: col, opacity: 0.6 * A });
  // speed streaks trailing behind
  for (const [u, v0, v1] of [
    [0, -0.85, -1.35],
    [0.42, -0.25, -1.0],
    [-0.42, -0.25, -1.0],
  ] as const) {
    k.drawLine({ p1: P(u, v0), p2: P(u, v1), width: 2, color: col, opacity: 0.75 * A });
  }
}

function vecBomb(k: KAPLAYCtx, x: number, y: number, s: number, col: ReturnType<KAPLAYCtx["rgb"]>, A = 1): void {
  k.drawCircle({ pos: k.vec2(x, y + s * 0.2), radius: s * 0.7, color: col, opacity: A });
  k.drawRect({ pos: k.vec2(x, y - s * 0.75), width: s * 0.9, height: s * 0.5, anchor: "center", color: col, opacity: A });
}

function vecFlare(k: KAPLAYCtx, x: number, y: number, s: number, col: ReturnType<KAPLAYCtx["rgb"]>, A = 1): void {
  for (let i = 0; i < 6; i++) {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    k.drawLine({ p1: k.vec2(x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3), p2: k.vec2(x + Math.cos(a) * s, y + Math.sin(a) * s), width: 2, color: col, opacity: A });
  }
  k.drawCircle({ pos: k.vec2(x, y), radius: s * 0.25, color: col, opacity: A });
}
