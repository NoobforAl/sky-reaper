/**
 * In-game HUD (pure presentation of HudData). Compact, safe-area aware:
 *  top    : score (+ combo), chapter progress, lives, FPS, boss bar with phase notches
 *  bottom : hull + shield bars, air weapon + power pips, ordnance + stock, flare cooldown, temp power-ups
 *  overlay: hint line, banners, missile warning arrows / reticles, lock-on flash, low-hull vignette, touch controls
 */
import { GAME_H, GAME_W, WIDE, type HudData, type HudRenderer, type Services } from "../contracts";
import { isSkyInput, keyLabel, safeInsets } from "../input";
import { computeLoadout, PLAYER_WEAPONS } from "../weapons";
import { weaponIcon } from "./icons";
import { C, esc, fmtNum, resolveFont, resolveOutlineFont, type RGB } from "./theme";
import { Gfx, jet, refreshBuf } from "./widgets";

/** portrait bottom strip height */
const BOTTOM_H = 58;
/** wide: corner clusters (no full-width bars, the playfield centre stays clear) */
const PAD = 16;
const TOP_H = 74;
const BOT_H = 66;

export function createHud(svc: Services): HudRenderer {
  const { k } = svc;
  const g = new Gfx(k, resolveFont(svc), resolveOutlineFont(svc, resolveFont(svc)));
  // every HUD string sits over the moving playfield: outline font (dark ring + drop shadow) by default
  g.defaultOutline = 1;
  const canvas = k.canvas as HTMLCanvasElement;
  let flareMax = 12;
  try {
    flareMax = computeLoadout(svc.save.data).flareCooldown || 12;
  } catch {
    /* weapons module not ready */
  }
  let insets = safeInsets(canvas);
  let insetT = 0;
  let shownScore = 0;
  let lastLives = -1;
  let lifeFlash = 0;
  const touchIcon = (id: string, x: number, y: number, size: number, color: RGB, opacity = 1) => weaponIcon(g, id, x, y, size, svc.sprites, color, opacity);
  const weaponName = (id: string) => PLAYER_WEAPONS.find((w) => w.id === id)?.name ?? id.toUpperCase();

  function hullColor(f: number): RGB {
    return f > 0.5 ? C.green : f > 0.25 ? C.amber : C.red;
  }

  function drawTop(d: HudData): void {
    const it = insets.top;
    const p = d.player;
    const s = d.stats;
    g.rect(0, 0, GAME_W, it + 52, C.dark, 0.7);
    g.rect(0, it + 52, GAME_W, 1, C.steel, 0.6);
    // score
    shownScore += (s.score - shownScore) * Math.min(1, k.dt() * 12);
    if (Math.abs(s.score - shownScore) < 1) shownScore = s.score;
    // QA #8: the combo used to sit right after the digits at a guessed advance (15 units/char, no commas), so
    // "4,101" ran into "x1.4". Now the score owns the box 12..SCORE_R (shrinking a step for 7+ digit scores) and the
    // combo is right-aligned on the label row above the digits, so the two can never overlap.
    const SCORE_R = 160; // progress bar starts at 168
    g.text("SCORE", 12, it + 6, { size: 9, color: C.cyan });
    const scoreTxt = fmtNum(shownScore);
    let ss = 22;
    for (const cand of [22, 19, 16, 14]) {
      ss = cand;
      if (g.measure(scoreTxt, cand, true) <= SCORE_R - 12) break;
    }
    g.text(scoreTxt, 12, it + 18, { size: ss, color: C.white, outline: 1 });
    const combo = Number((s as unknown as { combo?: number }).combo ?? (d as unknown as { combo?: number }).combo ?? 0);
    if (combo > 1.01) {
      const pulse = 0.75 + 0.25 * Math.sin(k.time() * 12);
      g.text(`x${combo.toFixed(1)}`, SCORE_R, it + 3, { size: 12, color: combo >= 2 ? C.red : C.amber, outline: 1, anchor: "topright", opacity: pulse });
    }
    // progress
    const px = 168;
    // touch: shorter bar, the pause icon sits between it and the lives (src/input/touch.ts layout)
    const touchUi = isSkyInput(svc.input) && svc.input.touchVisible;
    const pw = touchUi ? 116 : 150;
    g.text(esc(d.chapterName.toUpperCase()).slice(0, touchUi ? 14 : 24), px + pw / 2, it + 14, { size: 9, color: C.text, anchor: "center" });
    g.bar(px, it + 28, pw, 6, d.progress, C.cyan, { opacity: 0.9 });
    g.circle(px + pw * Math.max(0, Math.min(1, d.progress)), it + 31, 4, C.amber);
    g.rect(px + pw - 2, it + 24, 4, 14, C.red);
    // lives
    if (lastLives >= 0 && p.lives < lastLives) lifeFlash = 1.2;
    lastLives = p.lives;
    lifeFlash = Math.max(0, lifeFlash - k.dt());
    const lives = Math.max(0, p.lives);
    g.text("LIVES", GAME_W - 12, it + 6, { size: 9, color: C.cyan, anchor: "topright" });
    if (lives <= 5) {
      for (let i = 0; i < lives; i++) {
        const lx = GAME_W - 22 - i * 24;
        if (svc.sprites.has("ui_heart")) k.drawSprite({ sprite: "ui_heart", pos: k.vec2(lx, it + 32), anchor: "center", width: 18, height: 18 });
        else jet(g, lx, it + 32, 9, lifeFlash > 0 && Math.sin(k.time() * 20) > 0 ? C.red : C.amber, p.aircraft);
      }
    } else g.text(`x${lives}`, GAME_W - 12, it + 22, { size: 18, color: C.amber, anchor: "topright" });
    if (svc.save.data.settings.showFps) {
      const fps = Math.round(d.fps);
      g.text(`FPS ${fps}`, GAME_W - 12, it + 58, { size: 10, color: fps >= 55 ? C.green : fps >= 40 ? C.amber : C.red, anchor: "topright" });
    }
  }

  function drawBoss(d: HudData): void {
    const b = d.boss;
    if (!b) return;
    // wide: between the top corner clusters when there is room, else just below them
    const room = GAME_W - 2 * (PAD + 330);
    const fits = room >= 360;
    const w = WIDE ? (fits ? Math.min(760, room) : GAME_W - 2 * PAD - 40) : GAME_W - 40;
    const x = (GAME_W - w) / 2;
    const y = insets.top + (WIDE ? (fits ? PAD + 6 : PAD + TOP_H + 8) : 60);
    g.rect(x, y, w, 32, C.dark, 0.7);
    g.frame(x, y, w, 32, C.red, 1, 0.8);
    g.text(esc(b.name.toUpperCase()), x + 8, y + 4, { size: 10, color: C.red });
    if (b.phases > 1) g.text(`PHASE ${Math.min(b.phase + 1, b.phases)}/${b.phases}`, x + w - 8, y + 4, { size: 10, color: C.amber, anchor: "topright" });
    const f = b.maxHp > 0 ? b.hp / b.maxHp : 0;
    const bx = x + 8;
    const bw = w - 16;
    g.rect(bx, y + 18, bw, 9, C.navy, 1);
    const pulse = 0.85 + 0.15 * Math.sin(k.time() * 10);
    g.rect(bx, y + 18, bw * Math.max(0, Math.min(1, f)), 9, f < 0.25 ? C.red : [230, 70, 60], pulse);
    for (let i = 1; i < b.phases; i++) {
      const nx = bx + bw * (1 - i / b.phases);
      g.rect(nx - 1, y + 15, 2, 15, C.white, 0.9);
    }
    g.frame(bx, y + 18, bw, 9, C.steel, 1);
  }

  /** translucent HUD plate for the wide corner clusters */
  function plate(x: number, y: number, w: number, h: number, accent: RGB = C.steel): void {
    // dark enough for text over bright biomes (desert / arctic)
    g.rect(x, y, w, h, C.dark, 0.68);
    g.frame(x, y, w, h, accent, 1, 0.5);
  }

  function drawLives(p: HudData["player"], rightX: number, y: number, size: number): void {
    if (lastLives >= 0 && p.lives < lastLives) lifeFlash = 1.2;
    lastLives = p.lives;
    lifeFlash = Math.max(0, lifeFlash - k.dt());
    const lives = Math.max(0, p.lives);
    if (lives <= 5) {
      for (let i = 0; i < lives; i++) {
        const lx = rightX - size / 2 - i * (size + 6);
        if (svc.sprites.has("ui_heart")) k.drawSprite({ sprite: "ui_heart", pos: k.vec2(lx, y), anchor: "center", width: size, height: size });
        else jet(g, lx, y, size / 2, lifeFlash > 0 && Math.sin(k.time() * 20) > 0 ? C.red : C.amber, p.aircraft);
      }
    } else g.text(`x${lives}`, rightX, y, { size: size, color: C.amber, anchor: "right" });
  }

  /** wide: score + chapter progress (top-left), lives + FPS (top-right) */
  function drawTopWide(d: HudData): void {
    const it = insets.top;
    const s = d.stats;
    const x = PAD + insets.left;
    const y = it + PAD;
    plate(x, y, 320, TOP_H, C.cyanDim);
    shownScore += (s.score - shownScore) * Math.min(1, k.dt() * 12);
    if (Math.abs(s.score - shownScore) < 1) shownScore = s.score;
    g.text("SCORE", x + 14, y + 10, { size: 10, color: C.cyan });
    g.text(fmtNum(shownScore), x + 14, y + 24, { size: 26, color: C.white, outline: 1 });
    const combo = Number((s as unknown as { combo?: number }).combo ?? (d as unknown as { combo?: number }).combo ?? 0);
    if (combo > 1.01) {
      const pulse = 1 + 0.08 * Math.sin(k.time() * 12);
      g.text(`x${combo.toFixed(1)}`, x + 306, y + 28, { size: 20 * pulse, color: combo >= 2 ? C.red : C.amber, outline: 1, anchor: "topright" });
    }
    // chapter progress
    const pw = 292;
    const py = y + TOP_H - 14;
    g.text(esc(d.chapterName.toUpperCase()).slice(0, 30), x + 306, y + 10, { size: 10, color: C.text, anchor: "topright" });
    g.bar(x + 14, py, pw, 6, d.progress, C.cyan, { opacity: 0.9 });
    g.circle(x + 14 + pw * Math.max(0, Math.min(1, d.progress)), py + 3, 5, C.amber);
    g.rect(x + 14 + pw - 2, py - 4, 4, 14, C.red);
    // lives
    const rw = 220;
    const rx = GAME_W - PAD - insets.right - rw;
    plate(rx, y, rw, 50, C.cyanDim);
    g.text("LIVES", rx + 14, y + 25, { size: 10, color: C.cyan, anchor: "left" });
    drawLives(d.player, rx + rw - 14, y + 25, 22);
    if (svc.save.data.settings.showFps) {
      const fps = Math.round(d.fps);
      g.text(`FPS ${fps}`, rx + rw - 8, y + 58, { size: 11, color: fps >= 55 ? C.green : fps >= 40 ? C.amber : C.red, anchor: "topright" });
    }
  }

  /** wide: hull / shield / power-ups (bottom-left), weapons + flare (bottom-right) */
  function drawBottomWide(d: HudData): void {
    const p = d.player;
    const y = GAME_H - insets.bottom - PAD - BOT_H;
    const x = PAD + insets.left;
    // --- left: hull + shield
    const lw = 340;
    plate(x, y, lw, BOT_H);
    const hf = p.maxHp > 0 ? p.hp / p.maxHp : 0;
    g.text("HULL", x + 14, y + 20, { size: 11, color: C.text, anchor: "left" });
    g.bar(x + 66, y + 12, 200, 16, hf, hullColor(hf), { segments: 5 });
    g.text(`${Math.ceil(Math.max(0, p.hp))}`, x + lw - 14, y + 20, { size: 14, color: hullColor(hf), anchor: "right" });
    const sf = p.maxShield > 0 ? p.shield / p.maxShield : 0;
    g.text("SHLD", x + 14, y + 46, { size: 11, color: C.text, anchor: "left" });
    g.bar(x + 66, y + 40, 200, 12, sf, C.blue, { segments: 5 });
    g.text(`${Math.ceil(Math.max(0, p.shield))}`, x + lw - 14, y + 46, { size: 12, color: C.blue, anchor: "right" });
    // temporary power-ups stack above the plate
    const temps: Array<[string, number, RGB]> = [
      ["RAPID FIRE", p.rapid, C.amber],
      ["OVERDRIVE", p.overdrive, C.red],
      ["MAGNET", p.magnet, C.cyan],
    ];
    let ty = y - 30;
    for (const [n, t, col] of temps) {
      if (!(t > 0)) continue;
      const blink = t < 2 && Math.sin(k.time() * 16) < 0;
      g.rect(x, ty, 170, 24, col, blink ? 0.2 : 0.35);
      g.text(n, x + 10, ty + 12, { size: 11, color: C.white, anchor: "left" });
      g.text(`${Math.ceil(t)}S`, x + 160, ty + 12, { size: 11, color: col, anchor: "right" });
      ty -= 30;
    }
    // --- right: air weapon, ordnance, flare
    const rw = 430;
    const rx = GAME_W - PAD - insets.right - rw;
    plate(rx, y, rw, BOT_H);
    const box = 44;
    const by = y + (BOT_H - box) / 2;
    g.rect(rx + 12, by, box, box, C.navy, 0.9);
    g.frame(rx + 12, by, box, box, C.cyan, 1, 0.8);
    weaponIcon(g, p.airWeapon, rx + 12 + box / 2, by + box / 2, 32, svc.sprites, C.cyan);
    g.text(weaponName(p.airWeapon), rx + 64, by + 4, { size: 12, color: C.cyan });
    g.pips(rx + 64, by + 24, 5, Math.max(0, Math.min(5, Math.round(p.power))), 11, C.amber, 3);
    const gx = rx + 176;
    g.rect(gx, by, box, box, C.navy, 0.9);
    g.frame(gx, by, box, box, C.amber, 1, 0.8);
    weaponIcon(g, p.groundWeapon, gx + box / 2, by + box / 2, 32, svc.sprites, C.amber);
    g.text(weaponName(p.groundWeapon).slice(0, 10), gx + 52, by + 4, { size: 12, color: C.amber });
    const bombs = Math.max(0, Math.floor(p.bombs));
    const maxB = Math.max(bombs, Math.floor(p.maxBombs));
    if (bombs === 0) g.text("EMPTY", gx + 52, by + 24, { size: 12, color: Math.sin(k.time() * 8) > 0 ? C.red : C.grey });
    else if (maxB <= 10) {
      for (let i = 0; i < maxB; i++) {
        const bx = gx + 58 + i * 12;
        if (svc.sprites.has("ui_bomb") && i < bombs) k.drawSprite({ sprite: "ui_bomb", pos: k.vec2(bx, by + 32), anchor: "center", width: 11, height: 11 });
        else g.circle(bx, by + 32, 4.5, i < bombs ? C.amber : C.steel);
      }
    } else g.text(`${bombs}/${maxB}`, gx + 52, by + 24, { size: 13, color: C.amber });
    // flare ring
    const fx = rx + rw - 36;
    const fy = y + BOT_H / 2;
    const ready = p.flareCd <= 0;
    const fr = ready ? 1 : 1 - Math.max(0, Math.min(1, p.flareCd / flareMax));
    // filled discs instead of an outline ring: far fewer primitives than a stroked circle
    g.circle(fx, fy, 25, ready ? C.cyan : C.steel, ready ? 0.7 + 0.3 * Math.sin(k.time() * 6) : 0.8);
    g.circle(fx, fy, ready ? 23 : 24, C.navy, 1);
    if (!ready) k.drawCircle({ pos: k.vec2(fx, fy), radius: 22, start: -90, end: -90 + 360 * fr, color: g.col(C.cyanDim), opacity: 0.9 });
    weaponIcon(g, "flare", fx, fy, 24, svc.sprites, ready ? C.white : C.grey);
    if (!ready) g.text(`${Math.ceil(p.flareCd)}`, fx, fy, { size: 14, color: C.white, anchor: "center", outline: 1 });
    // key hints above the right plate (keyboard players only)
    if (hintKeys()) {
      const bind = svc.save.data.settings.bindings;
      const lbl = (a: keyof typeof bind) => (bind[a]?.[0] ? keyLabel(bind[a]![0]!) : "-").toUpperCase().slice(0, 5);
      g.hintBar(
        [
          [[lbl("weaponPrev"), lbl("weaponNext")], "WEAPON"],
          [[lbl("groundNext")], "ORDNANCE"],
          [[lbl("bomb")], "BOMB"],
          [[lbl("special")], "FLARE"],
        ],
        rx + rw,
        y - 16,
        { size: 9, anchor: "right", opacity: 0.85 },
      );
    }
  }

  /** show keyboard hints in the wide HUD during the first seconds of a sortie (keyboard players only) */
  let hudAge = 0;
  function hintKeys(): boolean {
    if (hudAge > 25) return false;
    const inp = svc.input;
    return isSkyInput(inp) && (inp.lastDevice === "keyboard" || inp.lastDevice === "mouse") && !inp.touchActive;
  }

  function drawBottom(d: HudData): void {
    const p = d.player;
    const y0 = GAME_H - insets.bottom - BOTTOM_H;
    g.rect(0, y0, GAME_W, BOTTOM_H + insets.bottom, C.dark, 0.72);
    g.rect(0, y0, GAME_W, 1, C.steel, 0.6);
    // hull / shield
    const hf = p.maxHp > 0 ? p.hp / p.maxHp : 0;
    // label column width follows the (screen-snapped) font size
    const lbx = 10 + Math.max(g.measure("HULL", 9, true), g.measure("SHLD", 9, true)) + 6;
    const bw = Math.max(60, 176 - 34 - lbx);
    g.text("HULL", 10, y0 + 12, { size: 9, color: C.text, anchor: "left", outline: 1 });
    g.bar(lbx, y0 + 6, bw, 12, hf, hullColor(hf), { segments: 5 });
    g.text(`${Math.ceil(Math.max(0, p.hp))}`, lbx + bw + 4, y0 + 12, { size: 10, color: hullColor(hf), anchor: "left", outline: 1 });
    const sf = p.maxShield > 0 ? p.shield / p.maxShield : 0;
    g.text("SHLD", 10, y0 + 29, { size: 9, color: C.text, anchor: "left", outline: 1 });
    g.bar(lbx, y0 + 24, bw, 10, sf, C.blue, { segments: 5 });
    // temp power-ups
    const temps: Array<[string, number, RGB]> = [
      ["RPD", p.rapid, C.amber],
      ["OVD", p.overdrive, C.red],
      ["MAG", p.magnet, C.cyan],
    ];
    let tx = 10;
    for (const [n, t, col] of temps) {
      if (!(t > 0)) continue;
      const blink = t < 2 && Math.sin(k.time() * 16) < 0;
      g.rect(tx, y0 + 39, 54, 17, col, blink ? 0.2 : 0.4);
      g.text(`${n} ${Math.ceil(t)}`, tx + 27, y0 + 47.5, { size: 8, color: C.white, anchor: "center", outline: 1 });
      tx += 58;
    }
    // air weapon
    const ax = 184;
    g.rect(ax, y0 + 6, 30, 30, C.navy, 0.9);
    g.frame(ax, y0 + 6, 30, 30, C.cyan, 1, 0.8);
    weaponIcon(g, p.airWeapon, ax + 15, y0 + 21, 22, svc.sprites, C.cyan);
    g.text(weaponName(p.airWeapon), ax + 36, y0 + 4, { size: 10, color: C.cyan, outline: 1 });
    g.pips(ax + 36, y0 + 22, 5, Math.max(0, Math.min(5, Math.round(p.power))), 8, C.amber, 2);
    // ground weapon + ordnance
    const gx = 300;
    g.rect(gx, y0 + 6, 30, 30, C.navy, 0.9);
    g.frame(gx, y0 + 6, 30, 30, C.amber, 1, 0.8);
    weaponIcon(g, p.groundWeapon, gx + 15, y0 + 21, 22, svc.sprites, C.amber);
    g.text(weaponName(p.groundWeapon).slice(0, 7), gx + 36, y0 + 4, { size: 10, color: C.amber, outline: 1 });
    const bombs = Math.max(0, Math.floor(p.bombs));
    const maxB = Math.max(bombs, Math.floor(p.maxBombs));
    if (maxB <= 8) {
      for (let i = 0; i < maxB; i++) {
        const bx = gx + 40 + i * 9;
        if (svc.sprites.has("ui_bomb") && i < bombs) k.drawSprite({ sprite: "ui_bomb", pos: k.vec2(bx, y0 + 26), anchor: "center", width: 9, height: 9 });
        else g.circle(bx, y0 + 26, 3.5, i < bombs ? C.amber : C.steel);
      }
    } else g.text(`${bombs}/${maxB}`, gx + 36, y0 + 21, { size: 11, color: C.amber });
    if (bombs === 0) g.text("EMPTY", gx + 36, y0 + 40, { size: 8, color: Math.sin(k.time() * 8) > 0 ? C.red : C.text, outline: 1 });
    // flare
    const fx = GAME_W - 30;
    const fy = y0 + 26;
    const ready = p.flareCd <= 0;
    const fr = ready ? 1 : 1 - Math.max(0, Math.min(1, p.flareCd / flareMax));
    // filled discs instead of a stroked ring (cheaper)
    g.circle(fx, fy, 19, ready ? C.cyan : C.steel, ready ? 0.7 + 0.3 * Math.sin(k.time() * 6) : 0.8);
    g.circle(fx, fy, ready ? 17 : 18, C.navy, 1);
    if (!ready) k.drawCircle({ pos: k.vec2(fx, fy), radius: 16, start: -90, end: -90 + 360 * fr, color: g.col(C.cyanDim), opacity: 0.9 });
    weaponIcon(g, "flare", fx, fy, 18, svc.sprites, ready ? C.white : C.grey);
    if (!ready) g.text(`${Math.ceil(p.flareCd)}`, fx, fy, { size: 12, color: C.white, anchor: "center", outline: 1 });
  }

  function drawMissiles(d: HudData): void {
    const t = k.time();
    let locked = false;
    for (const m of d.incomingMissiles) {
      if (m.locked) locked = true;
      const on = m.x >= 0 && m.x <= GAME_W && m.y >= 0 && m.y <= GAME_H;
      const blink = Math.sin(t * 18 + m.id) > -0.2;
      if (on) {
        if (!blink) continue;
        const r = m.locked ? 16 : 12;
        g.ring(m.x, m.y, r, C.red, 2, 0.85);
        g.line(m.x - r - 5, m.y, m.x - r + 3, m.y, C.red, 2);
        g.line(m.x + r - 3, m.y, m.x + r + 5, m.y, C.red, 2);
        continue;
      }
      const margin = 26;
      const top = insets.top + (WIDE ? 26 : 62);
      const bottom = GAME_H - insets.bottom - (WIDE ? 26 : BOTTOM_H + 10);
      const cx = Math.max(margin, Math.min(GAME_W - margin, m.x));
      const cy = Math.max(top, Math.min(bottom, m.y));
      const ang = Math.atan2(m.y - cy, m.x - cx) || (m.y < 0 ? -Math.PI / 2 : Math.PI / 2);
      const pt = (a: number, r: number) => k.vec2(cx + Math.cos(ang + a) * r, cy + Math.sin(ang + a) * r);
      if (blink) {
        k.drawPolygon({ pts: [pt(0, 16), pt(2.5, 12), pt(-2.5, 12)], color: g.col(C.red), outline: { width: 2, color: g.col(C.dark) } });
        g.text("!", cx - Math.cos(ang) * 4, cy - Math.sin(ang) * 4, { size: 12, color: C.white, anchor: "center" });
      }
    }
    if (locked) {
      const p = d.player;
      const a = 0.5 + 0.5 * Math.sin(t * 20);
      const ins = 3;
      g.frame(ins, insets.top + ins, GAME_W - ins * 2, GAME_H - insets.top - insets.bottom - ins * 2, C.red, 4, 0.25 + 0.4 * a);
      if (p.alive) {
        const r = 22 + 4 * Math.sin(t * 14);
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          g.line(p.x + sx * r, p.y + sy * r, p.x + sx * (r - 8), p.y + sy * r, C.red, 2, 0.9);
          g.line(p.x + sx * r, p.y + sy * r, p.x + sx * r, p.y + sy * (r - 8), C.red, 2, 0.9);
        }
        g.text("LOCK ON", p.x, p.y - r - 14, { size: 11, color: C.red, anchor: "center", outline: 1, opacity: 0.5 + 0.5 * a });
      } else g.text("MISSILE LOCK", GAME_W / 2, insets.top + (WIDE ? 140 : 110), { size: 14, color: C.red, anchor: "center", outline: 1, opacity: a });
    }
  }

  /**
   * Tutorial / hint panel (QA #7). It used to sit at the top of the field (wide: an ~810x65 box at y 30-95),
   * exactly where gunboats, runway AA / radar and missile carriers enter.
   *  - wide    : bottom centre, in the free gap between the two bottom HUD plates (aligned with their bottom edge),
   *              well below the ship's home row (GAME_H - 150); when that gap is too narrow (4:3 windows) it sits
   *              just above the plates' key-hint row instead.
   *  - portrait: stays under the top bar (the bottom of the narrow field is ship + touch-icon territory).
   *  - both    : the panel turns see-through while the ship, an enemy or an incoming missile is under it.
   */
  let hintFade = 1;
  function hintBlocked(x: number, y: number, w: number, h: number, d: HudData): boolean {
    const hits = (cx: number, cy: number, hw: number, hh: number) => cx + hw > x && cx - hw < x + w && cy + hh > y && cy - hh < y + h;
    const p = d.player;
    if (p.alive && hits(p.x, p.y, 26, 26)) return true;
    for (const m of d.incomingMissiles) if (hits(m.x, m.y, 10, 10)) return true;
    try {
      const enemies = (window as unknown as { __sky?: { game?: { world?: { enemies?: ReadonlyArray<{ alive: boolean; x: number; y: number; def?: { size?: [number, number]; hitbox?: [number, number] } }> } } } }).__sky?.game?.world?.enemies;
      if (enemies) {
        for (const e of enemies) {
          if (!e.alive) continue;
          // sprite half extent: native size * PIXEL_SCALE(2) / 2
          const hw = e.def?.hitbox ? e.def.hitbox[0] / 2 : (e.def?.size?.[0] ?? 16);
          const hh = e.def?.hitbox ? e.def.hitbox[1] / 2 : (e.def?.size?.[1] ?? 16);
          if (hits(e.x, e.y, hw, hh)) return true;
        }
      }
    } catch {
      /* world not exposed (tests / menus): position-only behaviour */
    }
    return false;
  }

  function drawHint(d: HudData): void {
    let text = esc(d.hint ?? "");
    const hs = WIDE ? 14 : 12;
    // hints separate their parts with 3+ spaces ("ORANGE BRACKETS = BOMBS ONLY   GREEN = GUNS OR BOMBS"): when the
    // line does not fit (portrait), break at those separators instead of mid-phrase ("GREEN = GUNS OR / BOMBS")
    const maxTextW = (WIDE ? 640 : GAME_W - 60) - 24;
    if (/\s{3,}/.test(text) && g.measure(text, hs, true) > maxTextW) text = text.split(/\s{3,}/).join("\n");
    let w: number;
    let cx = GAME_W / 2;
    let y: number;
    let hh: number;
    // box grows with the wrapped hint (font sizes are snapped per screen)
    const boxH = (bw: number) => Math.max(52, g.textHeight(text, hs, bw - 24, 3, true) + 22);
    if (WIDE) {
      const plateBottom = GAME_H - insets.bottom - PAD;
      const gapL = PAD + insets.left + 340 + 16; // drawBottomWide left plate (340 wide)
      const gapR = GAME_W - PAD - insets.right - 430 - 16; // right plate (430 wide)
      if (gapR - gapL >= 420) {
        w = Math.min(640, gapR - gapL);
        cx = (gapL + gapR) / 2;
        hh = boxH(w);
        y = plateBottom - hh;
      } else {
        w = Math.min(640, GAME_W - 2 * PAD - 40);
        hh = boxH(w);
        y = plateBottom - BOT_H - 34 - hh; // above the plates and their key-hint row
      }
    } else {
      w = GAME_W - 60;
      hh = boxH(w);
      y = insets.top + (d.boss ? 100 : 64);
    }
    const hx = cx - w / 2;
    const want = hintBlocked(hx, y, w, hh, d) ? 0.25 : 1;
    hintFade += (want - hintFade) * Math.min(1, k.dt() * (want < hintFade ? 10 : 4));
    const f = hintFade;
    g.rect(hx, y, w, hh, C.dark, 0.85 * f);
    g.frame(hx, y, w, hh, C.amber, 1, (0.6 + 0.4 * Math.sin(k.time() * 4)) * f);
    g.text(text, cx, y + hh / 2, { size: hs, color: C.white, anchor: "center", align: "center", width: w - 24, lineSpacing: 3, opacity: 0.55 + 0.45 * f });
  }

  function drawOverlay(d: HudData): void {
    const p = d.player;
    // low hull vignette
    const hf = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    if (p.alive && hf < 0.25) {
      const a = (0.18 + 0.12 * Math.sin(k.time() * 6)) * (1 - hf / 0.25 + 0.3);
      for (let i = 0; i < 4; i++) {
        const w = 26 - i * 6;
        g.rect(0, 0, w, GAME_H, C.red, a * 0.4);
        g.rect(GAME_W - w, 0, w, GAME_H, C.red, a * 0.4);
      }
    }
    if (d.hint) drawHint(d);
    else hintFade = 1;
    // banner
    const b = d.banner;
    if (b && b.alpha > 0.01) {
      const a = Math.max(0, Math.min(1, b.alpha));
      const y = WIDE ? 320 : 300;
      const big = WIDE ? 1.3 : 1;
      const bw = WIDE ? Math.min(GAME_W, 1000) : GAME_W;
      const bx = (GAME_W - bw) / 2;
      g.rect(bx, y - 40, bw, b.subtext ? 92 : 72, C.dark, 0.74 * a);
      g.rect(bx, y - 40, bw, 2, C.amber, a);
      g.rect(bx, y + (b.subtext ? 50 : 30), bw, 2, C.amber, a);
      // fit long titles on one line (portrait field is narrow)
      let ts = 30 * big;
      const tw0 = g.measure(esc(b.text), ts, true);
      if (tw0 > bw - 40) ts = Math.max(14, (ts * (bw - 40)) / tw0);
      g.text(esc(b.text), GAME_W / 2, y - 4, { size: ts, color: C.amber, anchor: "center", outline: 2, opacity: a, width: bw - 20, align: "center" });
      if (b.subtext) g.text(esc(b.subtext), GAME_W / 2, y + 30, { size: 13 * big, color: C.white, anchor: "center", opacity: a, width: bw - 40, align: "center" });
    }
  }

  return {
    draw(d: HudData): void {
      refreshBuf(canvas);
      insetT += k.dt();
      if (insetT > 0.5) {
        insetT = 0;
        insets = safeInsets(canvas);
      }
      hudAge += k.dt();
      drawOverlay(d);
      drawMissiles(d);
      if (WIDE) {
        drawTopWide(d);
        drawBoss(d);
        drawBottomWide(d);
      } else {
        drawTop(d);
        drawBoss(d);
        drawBottom(d);
      }
      if (isSkyInput(svc.input)) {
        const p = d.player;
        const fr = p.flareCd <= 0 ? 1 : 1 - Math.max(0, Math.min(1, p.flareCd / flareMax));
        svc.input.drawTouchControls(k, g.font, {
          flareReady: fr,
          bombs: p.bombs,
          airWeapon: p.airWeapon,
          groundWeapon: p.groundWeapon,
          icon: touchIcon,
        });
      }
    },
  };
}
