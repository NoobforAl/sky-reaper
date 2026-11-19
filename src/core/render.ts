/**
 * Renderer: ONE draw pass for the whole game scene.
 * Order: background back -> ground enemies (+vulnerability brackets) -> air shadows -> air enemies -> pickups ->
 *        bullets -> player -> fx -> hazard telegraphs -> background front -> HUD (+ flash overlay).
 * Sprites (svc.sprites.has) are drawn at integer PIXEL_SCALE; everything falls back to colored shapes.
 * Draw option objects are reused to keep GC pressure low.
 */
import type { KAPLAYCtx, Color, DrawRectOpt, DrawCircleOpt, DrawSpriteOpt, DrawTextOpt, Vec2 } from "kaplay";
import { GAME_H, GAME_W, PIXEL_SCALE, type HudRenderer, type Services, type SpriteInfo } from "../contracts";
import { FXDEF } from "./fxdefs";
import { pickupKey } from "./spritekeys";
import type { Bullet, EnemyRT, Fx, Hazard, Pickup } from "./types";
import type { World } from "./world";

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
  private co: DrawCircleOpt;
  /** reused outline-circle (ring) and text options */
  private ringOutline: { width: number; color: Color };
  private rgo: DrawCircleOpt;
  private to: DrawTextOpt;
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
    this.co = { pos: this.pv, radius: 1, color: this.WHITE, opacity: 1 };
    this.ringOutline = { width: 1, color: this.WHITE };
    this.rgo = { pos: this.pv, radius: 1, fill: false, outline: this.ringOutline, opacity: 1 };
    this.to = { text: "", pos: this.pv, size: 12, anchor: "center", color: this.WHITE, opacity: 1 };
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

  private circ(x: number, y: number, r: number, c: Color, opacity = 1): void {
    const o = this.co;
    this.pv.x = x;
    this.pv.y = y;
    o.radius = r;
    o.color = c;
    o.opacity = opacity;
    o.fill = true;
    o.outline = undefined;
    this.k.drawCircle(o);
  }

  private ring(x: number, y: number, r: number, width: number, c: Color, opacity = 1): void {
    const o = this.rgo;
    this.pv.x = x;
    this.pv.y = y;
    o.radius = r;
    o.opacity = opacity;
    this.ringOutline.width = width;
    this.ringOutline.color = c;
    this.k.drawCircle(o);
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
      if (e.alive && e.def.layer === "air") this.drawShadow(e.keys.base, e);
    }
    this.drawPlayerShadow();
    for (let i = 0; i < en.length; i++) {
      const e = en[i]!;
      if (e.alive && e.def.layer === "air") this.drawEnemy(e);
    }
    for (let i = 0; i < en.length; i++) {
      const e = en[i]!;
      if (e.alive && e.def.layer === "air") this.drawBrackets(e);
    }
    this.drawPickups();
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
    k.popTransform();

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
    let key = keys.base;
    // optional banking art: `<key>_bankl` / `<key>_bankr` (same frame layout) while sliding sideways
    if (e.bank < -0.45 || e.bank > 0.45) {
      const bk = e.bank < 0 ? keys.bankL : keys.bankR;
      if (this.info(bk)) key = bk;
    }
    const info = this.info(key);
    const w = this.w;
    if (info) {
      const frame = info.frames > 1 ? e.frame % info.frames : 0;
      const ang = def.layer === "air" ? e.facing - 90 : 0;
      if (e.flash > 0) this.sprFlash(key, e.x, e.y, frame, PIXEL_SCALE, ang);
      else this.spr(key, e.x, e.y, frame, PIXEL_SCALE, ang, 1);
      if (def.rotatesToPlayer) {
        const gk = keys.gun;
        if (this.info(gk)) {
          const p = w.pc.state;
          const a = p.alive ? (Math.atan2(p.y - e.y, p.x - e.x) * 180) / PI : e.facing;
          if (e.flash > 0) this.sprFlash(gk, e.x, e.y, 0, PIXEL_SCALE, a - 90);
          else this.spr(gk, e.x, e.y, 0, PIXEL_SCALE, a - 90, 1);
        }
      }
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
      if (f.delay > 0) continue;
      if ((f.kind === "wreck" || f.kind === "blast_ground") !== groundOnly) continue;
      this.drawOneFx(f);
    }
  }

  private drawOneFx(f: Fx): void {
    const p = f.t / f.life;
    const d = FXDEF[f.kind];
    if (f.kind === "wreck") {
      const info = this.info(f.sprite);
      const a = f.life - f.t < 1 ? f.life - f.t : 1;
      if (info) this.spr(f.sprite, f.x, f.y, 0, PIXEL_SCALE, 0, a);
      else this.rect(f.x, f.y, 24, 24, this.col(30, 30, 30), 0.7 * a);
      return;
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
  private drawHazards(): void {
    const list = this.w.hazards.items;
    const t = this.w.time;
    for (let i = 0; i < list.length; i++) {
      const h = list[i]!;
      const c = this.col(h.r, h.g, h.b);
      if (h.state === 0) {
        const p = Math.min(1, h.t / h.telegraph);
        this.circ(h.x, h.y, h.radius, c, 0.1 + 0.14 * p);
        this.circ(h.x, h.y, h.radius * p, c, 0.22);
        this.ring(h.x, h.y, h.radius, 2, c, 0.55 + 0.35 * Math.sin(t * 18));
        if (this.info("fx_warning") && h.cls === "enemy") this.spr("fx_warning", h.x, h.y, 0, PIXEL_SCALE, 0, 0.9);
      } else {
        const p = h.blastT / 0.3;
        this.circ(h.x, h.y, h.radius * (0.7 + 0.3 * p), this.col(255, 240, 180), 0.55 * (1 - p));
        this.ring(h.x, h.y, h.radius, 3, c, 1 - p);
      }
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
