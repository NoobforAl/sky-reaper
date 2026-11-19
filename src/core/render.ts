/**
 * Renderer: ONE draw pass for the whole game scene.
 * Order: background back -> ground enemies (+vulnerability brackets) -> air shadows -> air enemies -> pickups ->
 *        score popups -> bullets -> player -> fx -> hazard telegraphs -> background front -> HUD (+ flash overlay).
 * Sprites (svc.sprites.has) are drawn at integer PIXEL_SCALE; everything falls back to colored shapes.
 * Draw option objects are reused to keep GC pressure low.
 */
import type { KAPLAYCtx, Color, DrawRectOpt, DrawPolygonOpt, DrawSpriteOpt, DrawTextOpt, FormattedText, Vec2 } from "kaplay";
import { GAME_H, GAME_W, PIXEL_SCALE, type HudRenderer, type Services, type SpriteInfo } from "../contracts";
import { ANIM_QA, BURN_SECS, DMG_FRAC, FLASH_SECS, gunFrame, muzzleFrame } from "./anim";
import { FXDEF } from "./fxdefs";
import { pickupKey } from "./spritekeys";
import type { Bullet, EnemyRT, Fx, Hazard, Pickup } from "./types";
import { WORLD_TUNING, type ScorePopup, type World } from "./world";
import { PLAYER_TUNING } from "../player";

const PI = Math.PI;

const PICKUP_COLOR: Record<string, [number, number, number]> = {
  coin: [255, 214, 60],
  power: [255, 70, 70],
  bomb: [255, 150, 40],
  repair: [90, 230, 110],
  shield: [80, 170, 255],
  rapid: [255, 240, 90],
  overdrive: [230, 90, 255],
  magnet: [200, 200, 220],
};
/** flash shader uniform: constant, so drawing a flashing enemy allocates nothing */
const FLASH_UNIFORM = { u_amt: 0.85 };
/** the flash shader is compiled once per KAPLAY context, not on every game-scene entry */
let flashShaderCtx: KAPLAYCtx | null = null;

const PICKUP_LETTER: Record<string, string> = { coin: "$", power: "P", bomb: "B", repair: "+", shield: "S", rapid: "R", overdrive: "O", magnet: "M" };

/**
 * Circle tessellation levels (segments). KAPLAY 3001's drawCircle always builds 46 points, and its stroked variant draws
 * a line quad plus a 45-triangle "join" circle for EVERY segment (~2.3k vertices, ~10k short-lived objects per ring;
 * docs/PERF_BOMBERS.md). Discs and rings here are drawn with ONE drawPolygon each from cached unit-circle points.
 */
const SEG_LEVELS = [10, 16, 24, 32] as const;
function segLevel(r: number): number {
  return r < 6 ? 0 : r < 16 ? 1 : r < 48 ? 2 : 3;
}

/** score popup fade / near-player dimming */
/**
 * round 6 item 14 gust telegraph: sand / snow streaks crossing the screen in the gust direction (fixed pool, cosmetic,
 * render-clock only), a HUD-style arrow at the upwind side edge, and a translucent veil scaled by gust strength.
 */
const WIND_FX = {
  streaks: 44,
  /** streaks spawned per second at full strength (telegraph uses teleRate) */
  rate: 70,
  teleRate: 26,
  speedMin: 520,
  speedMax: 900,
  lenMin: 18,
  lenMax: 64,
  /** veil alpha at full gust (desert; snow uses 0.8x) */
  veilMax: 0.2,
  /**
   * round 7 (QA R6-6): the arrow moved out of the enemy entry band (was top centre, y 92) to the upwind side edge at
   * mid-height (arrowYFrac of GAME_H, arrowEdge units in from the edge), pointing the way the gust pushes.
   */
  arrowYFrac: 0.46,
  arrowEdge: 58,
  arrowW: 46,
  /** the arrow fades to this alpha when the player or an enemy is under it */
  arrowNearAlpha: 0.25,
  arrowNearDist: 56,
  /** half extents of the box tested for enemies under the arrow */
  arrowBoxHalfW: 46,
  arrowBoxHalfH: 30,
} as const;

const POPUP_NEAR = 70;
const POPUP_NEAR_ALPHA = 0.3;

export class Renderer {
  private k: KAPLAYCtx;
  private svc: Services;
  private w: World;
  private hud: HudRenderer;
  private colors = new Map<number, Color>();
  private infos = new Map<string, SpriteInfo | null>();
  private pv: Vec2;
  private so: DrawSpriteOpt;
  private ro: DrawRectOpt;
  /** cached unit-circle cos/sin tables and per-level point buffers (mutated in place, never reallocated) */
  private unitCos: Float32Array[] = [];
  private unitSin: Float32Array[] = [];
  private discPts: Vec2[][] = [];
  private ringPts: Vec2[][] = [];
  private ringIdx: number[][] = [];
  /** reused polygon options for discs (fan triangulation) and rings (annulus with cached indices) */
  private dpo: DrawPolygonOpt;
  private rpo: DrawPolygonOpt;
  private to: DrawTextOpt;
  /** score popups: resolved font + shadow fallback flag */
  private popupFont: string | undefined = undefined;
  private popupShadow = false;
  private popupFontResolved = false;
  /** playerKey cache: recomputed only when aircraft / skin change */
  private pkAircraft = "";
  private pkSkin = "";
  private pkStd = "";
  private pkDmg = "";
  private WHITE: Color;
  private BLACK: Color;
  private flashOk = true;
  private flashShaderReady = false;
  private fontOk: boolean | null = null;
  // gust telegraph state (pooled; see WIND_FX)
  private wsX = new Float32Array(WIND_FX.streaks);
  private wsY = new Float32Array(WIND_FX.streaks);
  private wsV = new Float32Array(WIND_FX.streaks);
  private wsL = new Float32Array(WIND_FX.streaks);
  private wsA = new Float32Array(WIND_FX.streaks);
  private wsLive = new Uint8Array(WIND_FX.streaks);
  private wsAcc = 0;
  private wsClock = 0;
  private triPts: Vec2[] = [];
  private tpo!: DrawPolygonOpt;

  constructor(svc: Services, world: World, hud: HudRenderer) {
    this.k = svc.k;
    this.svc = svc;
    this.w = world;
    this.hud = hud;
    const k = this.k;
    this.pv = k.vec2(0, 0);
    this.WHITE = k.rgb(255, 255, 255);
    this.BLACK = k.rgb(0, 0, 0);
    this.so = { sprite: "", pos: this.pv, anchor: "center", frame: 0, scale: PIXEL_SCALE, angle: 0, opacity: 1, color: this.WHITE };
    this.ro = { pos: this.pv, width: 1, height: 1, anchor: "center", color: this.WHITE, opacity: 1, angle: 0 };
    for (let l = 0; l < SEG_LEVELS.length; l++) {
      const n = SEG_LEVELS[l]!;
      const c = new Float32Array(n);
      const sn = new Float32Array(n);
      const dp: Vec2[] = [];
      const rp: Vec2[] = [];
      const idx: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2;
        c[i] = Math.cos(a);
        sn[i] = Math.sin(a);
        dp.push(k.vec2(0, 0));
        rp.push(k.vec2(0, 0), k.vec2(0, 0));
        // annulus: outer 2i, inner 2i+1; two triangles per segment
        const o0 = 2 * i;
        const i0 = 2 * i + 1;
        const o1 = (2 * (i + 1)) % (2 * n);
        const i1 = o1 + 1;
        idx.push(o0, i0, o1, i0, i1, o1);
      }
      this.unitCos.push(c);
      this.unitSin.push(sn);
      this.discPts.push(dp);
      this.ringPts.push(rp);
      this.ringIdx.push(idx);
    }
    this.dpo = { pts: this.discPts[0]!, pos: this.pv, color: this.WHITE, opacity: 1 };
    this.rpo = { pts: this.ringPts[0]!, indices: this.ringIdx[0]!, pos: this.pv, color: this.WHITE, opacity: 1 };
    this.to = { text: "", pos: this.pv, size: 12, anchor: "center", color: this.WHITE, opacity: 1 };
    this.triPts = [k.vec2(0, 0), k.vec2(0, 0), k.vec2(0, 0)];
    this.tpo = { pts: this.triPts, pos: this.pv, color: this.WHITE, opacity: 1 };
    if (flashShaderCtx === k) this.flashShaderReady = true;
    else {
      try {
        k.loadShader(
          "srflash",
          null,
          `uniform float u_amt;
vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
  vec4 c = def_frag();
  return vec4(mix(c.rgb, vec3(1.0), u_amt), c.a);
}`,
        );
        flashShaderCtx = k;
        this.flashShaderReady = true;
      } catch {
        this.flashOk = false;
      }
    }
  }

  // ------------------------------------------------------------------ helpers
  private col(r: number, g: number, b: number): Color {
    const key = ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
    let c = this.colors.get(key);
    if (!c) {
      c = this.k.rgb(r & 255, g & 255, b & 255);
      this.colors.set(key, c);
    }
    return c;
  }

  private info(key: string): SpriteInfo | null {
    let i = this.infos.get(key);
    if (i === undefined) {
      i = this.svc.sprites.has(key) ? (this.svc.sprites.info(key) ?? null) : null;
      this.infos.set(key, i);
    }
    return i;
  }

  private spr(key: string, x: number, y: number, frame: number, scale: number, angle: number, opacity: number, color?: Color): void {
    const o = this.so;
    o.sprite = key;
    this.pv.x = Math.round(x);
    this.pv.y = Math.round(y);
    o.frame = frame;
    o.scale = scale;
    o.angle = angle;
    o.opacity = opacity;
    o.color = color ?? this.WHITE;
    o.shader = undefined;
    o.uniform = undefined;
    this.k.drawSprite(o);
  }

  private sprFlash(key: string, x: number, y: number, frame: number, scale: number, angle: number): void {
    const o = this.so;
    if (this.flashOk && this.flashShaderReady) {
      try {
        o.sprite = key;
        this.pv.x = Math.round(x);
        this.pv.y = Math.round(y);
        o.frame = frame;
        o.scale = scale;
        o.angle = angle;
        o.opacity = 1;
        o.color = this.WHITE;
        o.shader = "srflash";
        o.uniform = FLASH_UNIFORM;
        this.k.drawSprite(o);
        o.shader = undefined;
        o.uniform = undefined;
        return;
      } catch {
        this.flashOk = false;
        o.shader = undefined;
        o.uniform = undefined;
      }
    }
    this.spr(key, x, y, frame, scale, angle, 1);
    this.spr(key, x, y, frame, scale, angle, 0.55);
  }

  private rect(x: number, y: number, w: number, h: number, c: Color, opacity = 1, angle = 0, round = true): void {
    const o = this.ro;
    this.pv.x = round ? Math.round(x) : x;
    this.pv.y = round ? Math.round(y) : y;
    o.width = w;
    o.height = h;
    o.color = c;
    o.opacity = opacity;
    o.angle = angle;
    o.anchor = "center";
    this.k.drawRect(o);
  }

  private rectTL(x: number, y: number, w: number, h: number, c: Color, opacity = 1): void {
    const o = this.ro;
    this.pv.x = x;
    this.pv.y = y;
    o.width = w;
    o.height = h;
    o.color = c;
    o.opacity = opacity;
    o.angle = 0;
    o.anchor = "topleft";
    this.k.drawRect(o);
  }

  /** filled circle: one drawPolygon (fan) from cached points; small circles use fewer segments */
  private circ(x: number, y: number, r: number, c: Color, opacity = 1): void {
    if (r <= 0 || opacity <= 0) return;
    const l = segLevel(r);
    const cs = this.unitCos[l]!;
    const sn = this.unitSin[l]!;
    const pts = this.discPts[l]!;
    for (let i = 0; i < pts.length; i++) {
      const v = pts[i]!;
      v.x = cs[i]! * r;
      v.y = sn[i]! * r;
    }
    const o = this.dpo;
    this.pv.x = x;
    this.pv.y = y;
    o.pts = pts;
    o.color = c;
    o.opacity = opacity;
    this.k.drawPolygon(o);
  }

  /**
   * Stroked circle: ONE drawPolygon of an annulus (cached points + cached indices), no KAPLAY line joins.
   * (KAPLAY's drawCircle({fill:false, outline}) cost ~0.55 ms + ~10k objects per ring: docs/PERF_BOMBERS.md.)
   */
  private ring(x: number, y: number, r: number, width: number, c: Color, opacity = 1): void {
    if (r <= 0 || opacity <= 0 || width <= 0) return;
    const l = segLevel(r);
    const cs = this.unitCos[l]!;
    const sn = this.unitSin[l]!;
    const pts = this.ringPts[l]!;
    const ro = r + width * 0.5;
    const ri = Math.max(0, r - width * 0.5);
    for (let i = 0; i < cs.length; i++) {
      const ox = cs[i]!;
      const oy = sn[i]!;
      const a = pts[2 * i]!;
      const b = pts[2 * i + 1]!;
      a.x = ox * ro;
      a.y = oy * ro;
      b.x = ox * ri;
      b.y = oy * ri;
    }
    const o = this.rpo;
    this.pv.x = x;
    this.pv.y = y;
    o.pts = pts;
    o.indices = this.ringIdx[l]!;
    o.color = c;
    o.opacity = opacity;
    this.k.drawPolygon(o);
  }

  private text(t: string, x: number, y: number, size: number, c: Color, opacity = 1): void {
    const o = this.to;
    this.pv.x = x;
    this.pv.y = y;
    o.text = t;
    o.size = size;
    o.color = c;
    o.opacity = opacity;
    this.k.drawText(o);
  }

  // ------------------------------------------------------------------ main
  draw(): void {
    const w = this.w;
    const k = this.k;
    k.pushTransform();
    if (w.shakeT > 0 && w.shakePow > 0) {
      const m = w.shakePow * Math.min(1, w.shakeT / w.shakeTotal);
      k.pushTranslate(Math.round((w.frng() - 0.5) * 2 * m), Math.round((w.frng() - 0.5) * 2 * m));
    }
    try {
      w.runner.background.drawBack(k, w.scrollY, w.time);
    } catch (err) {
      this.bgErr(err);
    }

    const en = w.enemyPool.items;
    for (let i = 0; i < en.length; i++) {
      const e = en[i]!;
      if (e.alive && e.def.layer === "ground") this.drawEnemy(e);
    }
    for (let i = 0; i < en.length; i++) {
      const e = en[i]!;
      if (e.alive && e.def.layer === "ground") this.drawBrackets(e);
    }
    this.drawFx(true);
    for (let i = 0; i < en.length; i++) {
      const e = en[i]!;
      if (e.alive && e.def.layer === "air") this.drawShadow(this.bodyKey(e), e);
    }
    this.drawPlayerShadow();
    this.drawSpinouts();
    for (let i = 0; i < en.length; i++) {
      const e = en[i]!;
      if (e.alive && e.def.layer === "air") this.drawEnemy(e);
    }
    for (let i = 0; i < en.length; i++) {
      const e = en[i]!;
      if (e.alive && e.def.layer === "air") this.drawBrackets(e);
    }
    this.drawPickups();
    this.drawPopups();
    this.drawLockTarget();
    this.drawBeam();
    this.drawBullets();
    this.drawPlayer();
    this.drawFx(false);
    this.drawHazards();
    try {
      w.runner.background.drawFront(k, w.scrollY, w.time);
    } catch (err) {
      this.bgErr(err);
    }
    this.drawWindStreaks();
    k.popTransform();
    this.drawWindHud();

    // screen flash
    if (w.flashT > 0) {
      const a = 0.55 * Math.min(1, w.flashT / w.flashTotal);
      const f = w.flashColor;
      this.rectTL(0, 0, GAME_W, GAME_H, this.col(f[0], f[1], f[2]), a);
    }
    try {
      this.hud.draw(w.buildHud());
    } catch (err) {
      this.hudErr(err);
    }
  }

  // ------------------------------------------------------------------ wind (gust telegraph)
  /** 0..1 gust strength shown by the telegraph (live wind, or the announced gust during telegraphWind) */
  private windVis(): { s: number; dir: number; tele: boolean } {
    const w = this.w;
    const wi = w.windInfo;
    const s = Math.min(1, Math.abs(wi.push) / PLAYER_TUNING.windPushFrac);
    const vis = this.wvis;
    if (wi.telegraph > 0 && (s < WORLD_TUNING.windTelegraphMin || Math.sign(wi.ax) !== wi.telegraphDir)) {
      vis.s = 0.45;
      vis.dir = wi.telegraphDir;
      vis.tele = true;
    } else {
      vis.s = s >= WORLD_TUNING.windTelegraphMin ? s : 0;
      vis.dir = wi.ax < 0 ? -1 : 1;
      vis.tele = false;
    }
    return vis;
  }
  private wvis = { s: 0, dir: 1, tele: false };
  /** renderer-local rng: the world's frng also moves pickups, so render-rate calls must not consume it */
  private wSeed = 0x2545f491;
  private wrng(): number {
    let x = this.wSeed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.wSeed = x >>> 0;
    return this.wSeed / 4294967296;
  }

  private drawWindStreaks(): void {
    const F = WIND_FX;
    const dt = Math.min(0.05, this.k.dt());
    this.wsClock += dt;
    const v = this.windVis();
    const w = this.w;
    const n = this.wsX.length;
    // spawn: entering from the upwind edge (plus some mid-field so the screen fills at once)
    if (v.s > 0) {
      this.wsAcc += dt * (v.tele ? F.teleRate : F.rate * v.s);
      let guard = 6;
      while (this.wsAcc >= 1 && guard-- > 0) {
        this.wsAcc -= 1;
        for (let i = 0; i < n; i++) {
          if (this.wsLive[i]) continue;
          this.wsLive[i] = 1;
          const edge = this.wrng() < 0.7;
          this.wsX[i] = edge ? (v.dir > 0 ? -40 : GAME_W + 40) : this.wrng() * GAME_W;
          this.wsY[i] = 60 + this.wrng() * (GAME_H - 80);
          this.wsV[i] = v.dir * (F.speedMin + (F.speedMax - F.speedMin) * this.wrng()) * (0.6 + 0.4 * Math.max(v.s, 0.5));
          this.wsL[i] = F.lenMin + (F.lenMax - F.lenMin) * this.wrng();
          this.wsA[i] = 0.45 + 0.4 * this.wrng();
          break;
        }
      }
    } else this.wsAcc = 0;
    const snow = w.chapter.biome === "arctic";
    const c = snow ? this.col(235, 242, 255) : this.col(236, 204, 140);
    const fade = v.s > 0 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      if (!this.wsLive[i]) continue;
      const vx = this.wsV[i]!;
      const x = (this.wsX[i] = this.wsX[i]! + vx * dt);
      // slight downward slant with the scroll so streaks read as wind, not lasers
      const y = (this.wsY[i] = this.wsY[i]! + 40 * dt);
      if (!fade) this.wsA[i] = this.wsA[i]! - dt * 2.5;
      if (x < -80 || x > GAME_W + 80 || y > GAME_H + 10 || this.wsA[i]! <= 0) {
        this.wsLive[i] = 0;
        continue;
      }
      this.rect(x, y, this.wsL[i]!, 2, c, this.wsA[i]!, 0, false);
    }
  }

  private drawWindHud(): void {
    const F = WIND_FX;
    const v = this.windVis();
    if (v.s <= 0) return;
    const w = this.w;
    const snow = w.chapter.biome === "arctic";
    // translucent veil (visibility drop) only for a real gust, not the telegraph
    if (!v.tele) this.rectTL(0, 0, GAME_W, GAME_H, snow ? this.col(225, 232, 245) : this.col(206, 162, 96), F.veilMax * v.s * (snow ? 0.8 : 1));
    // arrow: blinks during the telegraph, solid (pulsing) during the gust; fades when the player is right under it
    let a = v.tele ? (Math.floor(this.wsClock * 6) % 2 === 0 ? 0.95 : 0.25) : 0.6 + 0.3 * v.s + 0.1 * Math.sin(this.wsClock * 10);
    const p = w.pc.state;
    const d = v.dir;
    // upwind edge: a gust pushing right (d = 1) is shown on the left edge, so the arrow never covers where you are pushed
    const cx = d >= 0 ? F.arrowEdge : GAME_W - F.arrowEdge;
    const cy = Math.round(GAME_H * F.arrowYFrac);
    let near = p.alive && Math.abs(p.y - cy) < F.arrowNearDist && Math.abs(p.x - cx) < F.arrowW + F.arrowNearDist * 0.5;
    if (!near) {
      const en = w.enemyPool.items;
      const bw = F.arrowBoxHalfW;
      const bh = F.arrowBoxHalfH;
      for (let i = 0; i < en.length; i++) {
        const e = en[i]!;
        if (e.alive && Math.abs(e.x - cx) < bw + e.hw && Math.abs(e.y - cy) < bh + e.hh) {
          near = true;
          break;
        }
      }
    }
    if (near) a *= F.arrowNearAlpha;
    const half = F.arrowW / 2;
    const col = snow ? this.col(220, 235, 255) : this.col(255, 196, 70);
    // dark outline then the fill
    this.rect(cx - d * 6, cy, F.arrowW - 8, 12, this.BLACK, a * 0.55);
    this.arrowHead(cx + d * (half - 4), cy, d, 15, 13, this.BLACK, a * 0.55);
    this.rect(cx - d * 6, cy, F.arrowW - 12, 6, col, a);
    this.arrowHead(cx + d * (half - 6), cy, d, 11, 9, col, a);
    // strength chevrons behind the shaft (1..3)
    const pips = v.tele ? 1 : v.s > 0.8 ? 3 : v.s > 0.5 ? 2 : 1;
    for (let i = 0; i < pips; i++) this.rect(cx - d * (half + 6 + i * 9), cy, 4, 10, col, a * (0.8 - i * 0.2));
  }

  /** filled triangle pointing along +x (d = 1) or -x (d = -1), tip at (x + d*len, y) */
  private arrowHead(x: number, y: number, d: number, len: number, halfH: number, c: Color, opacity: number): void {
    const pts = this.triPts;
    pts[0]!.x = d * len;
    pts[0]!.y = 0;
    pts[1]!.x = 0;
    pts[1]!.y = -halfH;
    pts[2]!.x = 0;
    pts[2]!.y = halfH;
    this.pv.x = x;
    this.pv.y = y;
    const o = this.tpo;
    o.color = c;
    o.opacity = opacity;
    this.k.drawPolygon(o);
  }

  private bgErrN = 0;
  private bgErr(err: unknown): void {
    if (this.bgErrN++ < 3) console.error("[render] background", err);
  }
  private hudErrN = 0;
  private hudErr(err: unknown): void {
    if (this.hudErrN++ < 3) console.error("[render] hud", err);
  }

  // ------------------------------------------------------------------ enemies
  private drawEnemy(e: EnemyRT): void {
    // off-screen cull: far to either side, or well above / below the field (big sprites may still poke in near the edge)
    if (!e.onScreen && (Math.abs(e.x - GAME_W / 2) > GAME_W || e.y < -200 || e.y > GAME_H + 200)) return;
    const def = e.def;
    const keys = e.keys;
    const key = this.bodyKey(e);
    const info = this.info(key);
    const w = this.w;
    if (info) {
      // bank / dmg strips have exactly the base frame count, so the base-driven e.frame indexes them directly
      const frame = info.frames > 1 ? e.frame % info.frames : 0;
      const ang = def.layer === "air" ? e.facing - 90 : 0;
      if (e.flash > 0) this.sprFlash(key, e.x, e.y, frame, PIXEL_SCALE, ang);
      else this.spr(key, e.x, e.y, frame, PIXEL_SCALE, ang, 1);
      let muzAng = ang;
      const anim = ANIM_QA.enabled;
      if (def.rotatesToPlayer) {
        const gk = keys.gun;
        const gi = this.info(gk);
        if (gi) {
          const p = w.pc.state;
          const a = p.alive ? (Math.atan2(p.y - e.y, p.x - e.x) * 180) / PI : e.facing;
          // `_gun` state strip: 0 rest, 1 fire (recoil), 2 return
          const gf = anim && gi.frames >= 3 ? gunFrame(e.fireT) : 0;
          if (e.flash > 0) this.sprFlash(gk, e.x, e.y, gf, PIXEL_SCALE, a - 90);
          else this.spr(gk, e.x, e.y, gf, PIXEL_SCALE, a - 90, 1);
          muzAng = a - 90;
        }
      }
      if (anim && e.fireT < FLASH_SECS && keys.muzzle) this.drawMuzzle(e, muzAng, def.layer === "air" ? e.facing : 90);
      return;
    }
    // fallback
    const c = def.color;
    const wdt = def.size[0] * PIXEL_SCALE;
    const hgt = def.size[1] * PIXEL_SCALE;
    const body = e.flash > 0 ? this.WHITE : this.col(c[0], c[1], c[2]);
    this.rect(e.x, e.y, wdt + 4, hgt + 4, this.col(10, 10, 20), 0.8);
    this.rect(e.x, e.y, wdt, hgt, body, 1);
    if (def.layer === "air") {
      // nose marker
      const r = ((e.facing) * PI) / 180;
      this.rect(e.x + Math.cos(r) * wdt * 0.3, e.y + Math.sin(r) * hgt * 0.3, wdt * 0.25, hgt * 0.25, this.col(255, 255, 255), 0.7);
    } else if (def.rotatesToPlayer) {
      const p = w.pc.state;
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      this.rect(e.x + Math.cos(a) * wdt * 0.3, e.y + Math.sin(a) * wdt * 0.3, 5, 5, this.col(30, 30, 30), 1);
    }
    // hp bar for big things
    if (e.maxHp >= 100 && e.hp < e.maxHp && !e.bossId) {
      this.rectTL(e.x - wdt / 2, e.y - hgt / 2 - 8, wdt, 3, this.col(20, 20, 20), 0.8);
      this.rectTL(e.x - wdt / 2, e.y - hgt / 2 - 8, wdt * Math.max(0, e.hp / e.maxHp), 3, this.col(220, 60, 60), 1);
    }
  }

  /**
   * Body sprite key (ANIM_SPEC §2): `_dmg` below 50 % HP, `_bankl` / `_bankr` (+ `_dmg`) while banking (hysteresis in
   * e.bankSel). Every variant falls back to the next one when the registry lacks it. Cached keys only: no allocation.
   */
  private bodyKey(e: EnemyRT): string {
    const keys = e.keys;
    const damaged = e.hp < e.maxHp * DMG_FRAC && !e.bossId && ANIM_QA.enabled;
    const hasDmg = damaged && this.info(keys.dmg) !== null;
    let key = hasDmg ? keys.dmg : keys.base;
    const s = e.bankSel;
    if (s !== 0) {
      const bk = s < 0 ? (damaged ? keys.bankLDmg : keys.bankL) : damaged ? keys.bankRDmg : keys.bankR;
      if (this.info(bk)) key = bk;
      else if (damaged && !hasDmg) {
        const b2 = s < 0 ? keys.bankL : keys.bankR;
        if (this.info(b2)) key = b2;
      }
    }
    return key;
  }

  /**
   * Enemy muzzle flash (ANIM_SPEC §3): `fx_muzzle_e(_l)` at each muzzle point, rotated with the body (or `_gun`
   * overlay), pushed forward along the shot heading by half a flash frame. `aft` points when firing backwards.
   */
  private drawMuzzle(e: EnemyRT, ang: number, bodyFacing: number): void {
    const m = e.keys.muzzle!;
    const info = this.info(m.fx);
    if (!info) return;
    const fd = e.fireDir;
    const fr = (fd * PI) / 180;
    const pts = m.aft && Math.cos(fr - (bodyFacing * PI) / 180) < 0 ? m.aft : m.fore;
    const rr = (ang * PI) / 180;
    const c = Math.cos(rr);
    const s = Math.sin(rr);
    const push = (info.frameH * PIXEL_SCALE) / 2;
    const px = Math.cos(fr) * push;
    const py = Math.sin(fr) * push;
    const frame = muzzleFrame(e.fireT);
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const mx = pts[i]!;
      const my = pts[i + 1]!;
      this.spr(m.fx, e.x + (mx * c - my * s) * PIXEL_SCALE + px, e.y + (mx * s + my * c) * PIXEL_SCALE + py, frame, PIXEL_SCALE, fd - 90, 1);
    }
  }

  private drawShadow(key: string, e: EnemyRT): void {
    if (!e.onScreen) return;
    const info = this.info(key);
    if (info) {
      const frame = info.frames > 1 ? e.frame % info.frames : 0;
      this.spr(key, e.x + 12, e.y + 18, frame, PIXEL_SCALE, e.facing - 90, 0.28, this.BLACK);
    } else {
      this.rect(e.x + 10, e.y + 16, e.def.size[0] * PIXEL_SCALE * 0.85, e.def.size[1] * PIXEL_SCALE * 0.85, this.BLACK, 0.25);
    }
  }

  private drawBrackets(e: EnemyRT): void {
    const def = e.def;
    if (!e.onScreen || def.destructible === false || e.invuln) return;
    if (def.vulnerableTo === "air") return;
    const both = def.vulnerableTo === "both";
    const info = this.info(e.keys.base);
    const hx = Math.max(e.hw, info ? (info.frameW * PIXEL_SCALE) / 2 : 0) + 4;
    const hy = Math.max(e.hh, info ? (info.frameH * PIXEL_SCALE) / 2 : 0) + 4;
    const c = both ? this.col(90, 235, 120) : this.col(255, 150, 40);
    const a = 0.6 + 0.3 * Math.sin(this.w.time * 6);
    const L = 7;
    const t = 2;
    const x0 = Math.round(e.x - hx);
    const x1 = Math.round(e.x + hx);
    const y0 = Math.round(e.y - hy);
    const y1 = Math.round(e.y + hy);
    // four corners, two rects each
    this.rectTL(x0, y0, L, t, c, a);
    this.rectTL(x0, y0, t, L, c, a);
    this.rectTL(x1 - L, y0, L, t, c, a);
    this.rectTL(x1 - t, y0, t, L, c, a);
    this.rectTL(x0, y1 - t, L, t, c, a);
    this.rectTL(x0, y1 - L, t, L, c, a);
    this.rectTL(x1 - L, y1 - t, L, t, c, a);
    this.rectTL(x1 - t, y1 - L, t, L, c, a);
    if (!both) {
      // tiny bomb glyph above the top-left corner
      const bx = x0 + 5;
      const by = y0 - 7;
      this.circ(bx, by, 3.2, this.col(30, 30, 30), 0.95);
      this.circ(bx, by, 2.2, this.col(255, 150, 40), 0.95);
      this.rectTL(bx + 1, by - 6, 2, 3, this.col(255, 230, 120), 0.95);
    }
  }

  // ------------------------------------------------------------------ pickups
  private drawPickups(): void {
    const list = this.w.pickups.items;
    const t = this.w.time;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      const key = pickupKey(p.kind);
      const info = this.info(key);
      const bob = Math.sin(t * 6 + p.id) * 2;
      if (info) {
        const frame = info.frames > 1 ? Math.floor(t * (info.fps ?? 6) + p.id) % info.frames : 0;
        this.spr(key, p.x, p.y + bob, frame, PIXEL_SCALE, 0, 1);
      } else {
        const c = PICKUP_COLOR[p.kind] ?? [255, 255, 255];
        this.circ(p.x, p.y + bob, 10.5, this.col(10, 10, 20), 0.85);
        this.circ(p.x, p.y + bob, 8.5, this.col(c[0], c[1], c[2]), 1);
        this.text(PICKUP_LETTER[p.kind] ?? "?", p.x, p.y + bob + 1, 12, this.col(20, 20, 30));
      }
    }
  }

  // ------------------------------------------------------------------ bullets
  private drawBullets(): void {
    const w = this.w;
    const pb = w.pBullets.items;
    for (let i = 0; i < pb.length; i++) this.drawBullet(pb[i]!);
    const eb = w.eBullets.items;
    for (let i = 0; i < eb.length; i++) this.drawBullet(eb[i]!);
  }

  private drawBullet(b: Bullet): void {
    const v = b.visual;
    let x = b.x;
    let y = b.y;
    let sc = PIXEL_SCALE * (v.scale ?? 1);
    if (b.motion === "lobbed" && b.lobT > 0) {
      // arc: shadow stays on the ground, body is lifted
      const p = Math.min(1, b.age / b.lobT);
      const h = Math.sin(p * PI);
      this.circ(x, y + 2, b.radius * (0.8 + 0.3 * h), this.BLACK, 0.3);
      y -= h * (b.kind === "heavy" ? 34 : 26);
      sc *= 1 + 0.45 * h;
    }
    const info = this.info(v.sprite);
    if (info) {
      const rot = v.rotate === false ? 0 : b.angle + 90;
      const frame = info.frames > 1 ? Math.floor(b.age * (info.fps ?? 12)) % info.frames : 0;
      this.spr(v.sprite, x, y, frame, sc, rot, 1);
      return;
    }
    const c = v.color;
    const r = b.radius * (sc / PIXEL_SCALE);
    if (b.player) {
      const long = b.motion === "linear" || b.motion === "accel" || b.motion === "homing";
      if (long) this.rect(x, y, r * 1.6, r * 4.2, this.col(c[0], c[1], c[2]), 1, b.angle + 90);
      else this.circ(x, y, r + 1, this.col(c[0], c[1], c[2]), 1);
      if (long) this.rect(x, y, r * 0.7, r * 2.6, this.WHITE, 0.9, b.angle + 90);
      return;
    }
    if (r >= 7) {
      this.circ(x, y, r + 2, this.col(25, 10, 30), 0.9);
      this.circ(x, y, r, this.col(c[0], c[1], c[2]), 1);
      this.circ(x, y, r * 0.5, this.WHITE, 1);
    } else {
      const s = r * 2;
      this.rect(x, y, s + 4, s + 4, this.col(25, 10, 30), 0.9);
      this.rect(x, y, s, s, this.col(c[0], c[1], c[2]), 1);
      this.rect(x, y, s * 0.45, s * 0.45, this.WHITE, 1);
    }
  }

  // ------------------------------------------------------------------ player
  private drawPlayerShadow(): void {
    const p = this.w.pc.state;
    if (!p.alive) return;
    const key = this.playerKey(false);
    if (this.info(key)) this.spr(key, p.x + 12, p.y + 18, this.bankFrame(p.bank), PIXEL_SCALE, 0, 0.28, this.BLACK);
    else this.rect(p.x + 10, p.y + 16, 30, 34, this.BLACK, 0.25);
  }

  /**
   * Player sprite key: `player_<aircraft>_<skin>` (+ `_dmg`) when the skin art exists, else `player_<aircraft>` (+ `_dmg`).
   * A skinned plane without a `_dmg` variant keeps its paint when damaged rather than reverting to standard.
   */
  private playerKey(dmg: boolean): string {
    const p = this.w.pc.state;
    if (p.aircraft !== this.pkAircraft || p.skin !== this.pkSkin) {
      // resolve once per aircraft / skin change (string building + sprite lookups are not per-frame work)
      this.pkAircraft = p.aircraft;
      this.pkSkin = p.skin;
      const std = "player_" + p.aircraft;
      const skin = p.skin && p.skin !== "standard" ? std + "_" + p.skin : "";
      if (skin && this.info(skin)) {
        this.pkStd = skin;
        this.pkDmg = this.info(skin + "_dmg") ? skin + "_dmg" : skin;
      } else {
        this.pkStd = std;
        this.pkDmg = this.info(std + "_dmg") ? std + "_dmg" : std;
      }
    }
    return dmg ? this.pkDmg : this.pkStd;
  }

  private bankFrame(b: number): number {
    return b < -0.35 ? 1 : b > 0.35 ? 2 : 0;
  }

  private drawPlayer(): void {
    const w = this.w;
    const p = w.pc.state;
    if (!p.alive) return;
    const k = this.k;
    let opacity = 1;
    if (p.invuln > 0 && Math.floor(w.time * 16) % 2 === 0) opacity = 0.35;
    // shield bubble
    if (p.shield > 0) {
      const f = p.shield / p.maxShield;
      this.ring(p.x, p.y, 25 + Math.sin(w.time * 5) * 0.8, 1.5, this.col(90, 190, 255), 0.12 + 0.28 * f);
    }
    const key = this.playerKey(p.hp / p.maxHp < 0.4);
    if (this.info(key)) {
      this.spr(key, p.x, p.y, this.bankFrame(p.bank), PIXEL_SCALE, 0, opacity);
    } else {
      // fallback fighter silhouette
      const o = opacity;
      const body = this.col(80, 170, 255);
      this.rect(p.x, p.y + 2, 10, 34, this.col(20, 30, 60), o);
      this.rect(p.x, p.y + 2, 6, 30, body, o);
      this.rect(p.x, p.y + 8, 40 - Math.abs(p.bank) * 8, 10, this.col(20, 30, 60), o);
      this.rect(p.x, p.y + 8, 36 - Math.abs(p.bank) * 8, 6, this.col(60, 130, 220), o);
      this.rect(p.x, p.y - 6, 6, 8, this.col(255, 255, 255), o);
      // exhaust
      const fl = 5 + (Math.floor(w.time * 30) % 3) * 2;
      this.rect(p.x, p.y + 20 + fl / 2, 4, fl, this.col(255, 190, 60), o);
    }
    if (p.rapid > 0 || p.overdrive > 0) {
      const c = p.overdrive > 0 ? this.col(230, 90, 255) : this.col(255, 240, 90);
      this.ring(p.x, p.y, 21, 1, c, 0.3 + 0.2 * Math.sin(w.time * 14));
    }
    // hit dot
    this.circ(p.x, p.y, p.hitRadius + 1.6, this.col(10, 10, 20), 0.7);
    this.circ(p.x, p.y, p.hitRadius, this.col(255, 80, 80), 0.95);
    this.circ(p.x, p.y, Math.max(1, p.hitRadius - 2), this.WHITE, 1);
    // lock-on warning
    if (w.anyLock) {
      const a = w.time * 3;
      const r = 30 + Math.sin(w.time * 12) * 2;
      this.ring(p.x, p.y, r, 2, this.col(255, 50, 50), 0.85);
      for (let i = 0; i < 4; i++) {
        const an = a + (i * PI) / 2;
        this.rect(p.x + Math.cos(an) * (r + 5), p.y + Math.sin(an) * (r + 5), 6, 6, this.col(255, 50, 50), 0.9, (an * 180) / PI);
      }
      if (this.info("fx_lock")) this.spr("fx_lock", p.x, p.y, 0, PIXEL_SCALE, 0, 0.9);
    }
    void k;
  }

  private drawLockTarget(): void {
    const w = this.w;
    const id = w.pc.lockTargetId;
    if (!id || !w.pc.state.alive) return;
    const e = w.findEnemy(id);
    if (!e || !e.alive) return;
    const hx = e.hw + 8;
    const hy = e.hh + 8;
    const a = 0.6 + 0.4 * Math.sin(w.time * 14);
    const c = this.col(255, 70, 200);
    const s = 5;
    this.rectTL(e.x - hx, e.y - hy, s, 2, c, a);
    this.rectTL(e.x - hx, e.y - hy, 2, s, c, a);
    this.rectTL(e.x + hx - s, e.y - hy, s, 2, c, a);
    this.rectTL(e.x + hx - 2, e.y - hy, 2, s, c, a);
    this.rectTL(e.x - hx, e.y + hy - 2, s, 2, c, a);
    this.rectTL(e.x - hx, e.y + hy - s, 2, s, c, a);
    this.rectTL(e.x + hx - s, e.y + hy - 2, s, 2, c, a);
    this.rectTL(e.x + hx - 2, e.y + hy - s, 2, s, c, a);
    this.circ(e.x, e.y, 2, c, a);
  }

  private drawBeam(): void {
    const w = this.w;
    const pc = w.pc;
    const p = pc.state;
    if (!pc.beamActive || !p.alive) return;
    const hw = pc.beamHalfW;
    const len = p.y - 12;
    const fl = 0.8 + 0.2 * Math.sin(w.time * 60);
    const key = "bullet_player_laser";
    const info = this.info(key);
    const x0 = p.x;
    this.rectTL(x0 - hw - 4, 0, hw * 2 + 8, len, this.col(40, 200, 255), 0.18 * fl);
    this.rectTL(x0 - hw, 0, hw * 2, len, this.col(90, 230, 255), 0.5 * fl);
    if (info) {
      const seg = info.frameH * PIXEL_SCALE;
      const n = Math.ceil(len / seg);
      for (let i = 0; i < n; i++) this.spr(key, x0, p.y - 14 - seg * (i + 0.5), 0, PIXEL_SCALE, 0, 0.9);
    }
    this.rectTL(x0 - hw * 0.45, 0, hw * 0.9, len, this.WHITE, 0.9 * fl);
    this.circ(x0, p.y - 14, hw + 3, this.col(160, 240, 255), 0.6);
  }

  // ------------------------------------------------------------------ fx
  private drawFx(groundOnly: boolean): void {
    const list = this.w.fxPool.items;
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      if (f.delay > 0 || f.kind === "spinout") continue;
      if ((f.kind === "wreck" || f.kind === "blast_ground") !== groundOnly) continue;
      this.drawOneFx(f);
    }
  }

  /** dying aircraft: tumbling, shrinking body; drawn with the air layer so explosions / bullets stay on top */
  private drawSpinouts(): void {
    const list = this.w.fxPool.items;
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      if (f.kind !== "spinout" || f.delay > 0) continue;
      const info = this.info(f.sprite);
      if (!info) continue;
      const p = f.t / f.life;
      const frame = info.frames > 1 ? f.frame % info.frames : 0;
      this.spr(f.sprite, f.x, f.y, frame, PIXEL_SCALE * (1 - 0.45 * p), f.rot, 1 - p * p);
    }
  }

  private drawOneFx(f: Fx): void {
    const p = f.t / f.life;
    const d = FXDEF[f.kind];
    if (f.kind === "wreck") {
      const a = f.life - f.t < 1 ? f.life - f.t : 1;
      // burning strip (`_burn`, 3 @ 10 fps, per-wreck phase) for the first BURN_SECS, then the cold `_dead` decal
      if (f.t < BURN_SECS && f.sprite2 !== "" && this.info(f.sprite2)) {
        this.spr(f.sprite2, f.x, f.y, (((f.t * 10) | 0) + f.frame) % 3, PIXEL_SCALE, 0, a);
        return;
      }
      const info = this.info(f.sprite);
      if (info) this.spr(f.sprite, f.x, f.y, 0, PIXEL_SCALE, 0, a);
      else this.rect(f.x, f.y, 24, 24, this.col(30, 30, 30), 0.7 * a);
      return;
    }
    if (f.kind === "debris" && f.sprite !== "") {
      const di = this.info(f.sprite);
      if (di) {
        // chunk variant = frame; fade over the last 30 % of life
        const q = p < 0.7 ? 0 : (p - 0.7) / 0.3;
        this.spr(f.sprite, f.x, f.y, di.frames > 1 ? f.frame % di.frames : 0, PIXEL_SCALE, f.rot, 1 - q * q);
        return;
      }
    }
    const info = d.sprite ? this.info(d.sprite) : null;
    if (info) {
      const frame = info.frames > 1 ? Math.min(info.frames - 1, Math.floor(p * info.frames)) : 0;
      let sc = PIXEL_SCALE * f.scale;
      if (f.kind === "ring") sc *= 0.35 + 0.9 * p;
      const tint = f.kind === "ping" ? this.col(f.r, f.g, f.b) : undefined;
      this.spr(d.sprite, f.x, f.y, frame, sc, f.rot, f.kind === "ring" || f.kind === "smoke" ? 1 - p : 1, tint);
      return;
    }
    const base = d.size * f.scale;
    switch (f.kind) {
      case "explosion_s":
      case "explosion_m":
      case "explosion_l": {
        const rad = base * 0.5 * (0.35 + 0.65 * Math.sqrt(p));
        const a = 1 - p * p;
        this.circ(f.x, f.y, rad, this.col(255, 120 + 100 * (1 - p), 40), a);
        this.circ(f.x, f.y, rad * 0.62, this.col(255, 235, 140), a);
        if (p < 0.5) this.circ(f.x, f.y, rad * 0.3, this.WHITE, 1 - p * 2);
        return;
      }
      case "smoke":
        this.circ(f.x, f.y, base * 0.5 * (0.6 + p), this.col(f.r, f.g, f.b), 0.45 * (1 - p));
        return;
      case "fire":
        this.circ(f.x, f.y, base * 0.5 * (1 - 0.5 * p), this.col(255, 200 - 120 * p, 40), 1 - p);
        return;
      case "spark":
        this.rect(f.x, f.y, 3, 3, this.col(f.r, f.g, f.b), 1 - p);
        return;
      case "ring":
        this.ring(f.x, f.y, base * 0.5 * (0.3 + 0.7 * p), 2, this.col(f.r, f.g, f.b), 1 - p);
        return;
      case "flare":
        this.circ(f.x, f.y, base * 0.5 * (0.6 + 0.4 * p), this.col(255, 255, 200), 0.5 * (1 - p));
        this.circ(f.x, f.y, base * 0.22, this.WHITE, 0.9 * (1 - p));
        return;
      case "muzzle":
      case "hit":
        this.circ(f.x, f.y, base * 0.5 * (1 + p), this.WHITE, 1 - p);
        return;
      case "ping":
        this.circ(f.x, f.y, base * 0.5 * (0.6 + p), this.col(f.r, f.g, f.b), 1 - p);
        this.ring(f.x, f.y, base * (0.5 + p), 1.5, this.col(220, 225, 235), 1 - p);
        return;
      case "blast_ground":
        this.circ(f.x, f.y, base * 0.5 * (0.5 + 0.5 * Math.sqrt(p)), this.col(f.r, f.g, f.b), 0.6 * (1 - p));
        this.ring(f.x, f.y, base * 0.5 * (0.3 + 0.8 * p), 3, this.col(255, 190, 90), 1 - p);
        return;
      case "debris":
        this.rect(f.x, f.y, 4, 4, this.col(f.r, f.g, f.b), 1 - p * p);
        return;
      default:
        this.circ(f.x, f.y, base * 0.5, this.WHITE, 1 - p);
    }
  }

  // ------------------------------------------------------------------ hazards
  /**
   * Two passes so KAPLAY's batch switches texture once per frame instead of twice per hazard (docs/PERF_BOMBERS.md #3):
   * every untextured shape first (discs + rings), then every fx_warning sprite.
   */
  private drawHazards(): void {
    const list = this.w.hazards.items;
    if (list.length === 0) return;
    const t = this.w.time;
    const pulse = 0.55 + 0.35 * Math.sin(t * 18);
    let warn = false;
    for (let i = 0; i < list.length; i++) {
      const h = list[i]!;
      const c = this.col(h.r, h.g, h.b);
      if (h.state === 0) {
        const p = Math.min(1, h.t / h.telegraph);
        this.circ(h.x, h.y, h.radius, c, 0.1 + 0.14 * p);
        this.circ(h.x, h.y, h.radius * p, c, 0.22);
        this.ring(h.x, h.y, h.radius, 2, c, pulse);
        if (h.cls === "enemy") warn = true;
      } else {
        const p = h.blastT / 0.3;
        this.circ(h.x, h.y, h.radius * (0.7 + 0.3 * p), this.col(255, 240, 180), 0.55 * (1 - p));
        this.ring(h.x, h.y, h.radius, 3, c, 1 - p);
      }
    }
    if (!warn || !this.info("fx_warning")) return;
    for (let i = 0; i < list.length; i++) {
      const h = list[i]!;
      if (h.state === 0 && h.cls === "enemy") this.spr("fx_warning", h.x, h.y, 0, PIXEL_SCALE, 0, 0.9);
    }
  }

  // ------------------------------------------------------------------ score popups
  /** sr_font_outline (baked outline + shadow) when loaded; else the plain font with a drawn drop shadow */
  private resolvePopupFont(): void {
    this.popupFontResolved = true;
    const k = this.k as KAPLAYCtx & { getBitmapFont?: (n: string) => unknown };
    try {
      if (k.getBitmapFont?.("sr_font_outline")) {
        this.popupFont = "sr_font_outline";
        return;
      }
      if (k.getBitmapFont?.("sr_font")) this.popupFont = "sr_font";
    } catch {
      /* ignore */
    }
    this.popupShadow = true;
  }

  private popupColor(q: ScorePopup): Color {
    if (q.big) return this.col(255, 214, 60);
    const c = q.combo;
    if (c >= 1.95) return this.col(255, 90, 200);
    if (c >= 1.6) return this.col(255, 150, 60);
    if (c >= 1.3) return this.col(255, 235, 90);
    return this.col(235, 240, 255);
  }

  /** (re)format one popup's text: only when it spawns or merges, never per frame */
  private formatPopup(q: ScorePopup): FormattedText | null {
    let ft = q.cache as FormattedText | null;
    try {
      const opt: DrawTextOpt = ft ? ft.opt : { text: "", pos: this.k.vec2(0, 0), anchor: "center", size: 12 };
      opt.text = "+" + q.value;
      opt.size = q.big ? 20 : 12;
      opt.font = this.popupFont;
      opt.color = this.popupColor(q);
      opt.opacity = 1;
      ft = this.k.formatText(opt);
    } catch {
      ft = null;
    }
    q.cache = ft;
    q.dirty = false;
    return ft;
  }

  private drawPopups(): void {
    const w = this.w;
    if (w.settings.scorePopups === false) return;
    const list = w.popups;
    const rise = WORLD_TUNING.popups.rise;
    const p = w.pc.state;
    if (!this.popupFontResolved) this.resolvePopupFont();
    for (let i = 0; i < list.length; i++) {
      const q = list[i]!;
      if (!q.active) continue;
      const ft = q.dirty ? this.formatPopup(q) : (q.cache as FormattedText | null);
      if (!ft) continue;
      const u = Math.min(1, q.t / q.life);
      // ease-out drift up, quick pop-in, fade over the last 60 %
      const y = q.y - rise * (1 - (1 - u) * (1 - u));
      let a = u < 0.4 ? 1 : 1 - (u - 0.4) / 0.6;
      if (q.t < 0.06) a *= q.t / 0.06;
      if (p.alive) {
        const dx = q.x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy < POPUP_NEAR * POPUP_NEAR) a *= POPUP_NEAR_ALPHA;
      }
      if (a <= 0.01) continue;
      const pos = ft.opt.pos as Vec2;
      const chars = ft.chars;
      if (this.popupShadow) {
        pos.x = Math.round(q.x) + 1;
        pos.y = Math.round(y) + 1;
        for (let j = 0; j < chars.length; j++) {
          chars[j]!.opacity = a * 0.8;
          chars[j]!.color = this.BLACK;
        }
        this.k.drawFormattedText(ft);
        const c = this.popupColor(q);
        for (let j = 0; j < chars.length; j++) chars[j]!.color = c;
      }
      pos.x = Math.round(q.x);
      pos.y = Math.round(y);
      for (let j = 0; j < chars.length; j++) chars[j]!.opacity = a;
      this.k.drawFormattedText(ft);
    }
  }

  // ------------------------------------------------------------------ pause overlay helpers
  /** whether the bitmap font is usable */
  fontName(): string | undefined {
    return this.fontOk === false ? undefined : "sr_font";
  }
  markFontBad(): void {
    this.fontOk = false;
  }
}

export type { Hazard, Pickup };
