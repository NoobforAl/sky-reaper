/** Main menu: Start/Continue, Chapters, Hangar, Settings, Credits (+ records). Wide: logo + pilot record left, menu right. */
import { CHAPTER_IDS, GAME_H, GAME_W, SCENES, type ChapterId, type Services } from "../contracts";
import { beginScene, type SceneKit } from "./core";
import { chapterInfo } from "./data";
import { cols, M, WIDE } from "./layout";
import { equippedSkin, drawSkinnedAircraft } from "./skins";
import { C, esc, fmtNum, MEDAL_COLORS } from "./theme";
import { button, type HintItem, type Widget } from "./widgets";
import { aircraftName, isFa, skinName, tr } from "./i18n";

export function nextChapter(svc: Services): ChapterId {
  const d = svc.save.data;
  for (let i = 0; i <= Math.min(d.chaptersUnlocked, CHAPTER_IDS.length - 1); i++) {
    const id = CHAPTER_IDS[i]!;
    if (!d.chapters[id]?.completed) return id;
  }
  return CHAPTER_IDS[Math.min(d.chaptersUnlocked, CHAPTER_IDS.length - 1)]!;
}

export function hasProgress(svc: Services): boolean {
  const d = svc.save.data;
  return d.chaptersUnlocked > 0 || Object.keys(d.chapters).length > 0 || d.credits > 0;
}

export function drawLogo(kit: SceneKit, svc: Services, cy: number, scale = 1, cx = GAME_W / 2): void {
  const { g } = kit;
  const k = svc.k;
  const t = k.time();
  const bob = Math.sin(t * 1.6) * 3;
  // the logo stays Latin "SKY REAPER" in every language; Farsi adds a small subtitle under it (FA_STYLE_GUIDE)
  const sub = isFa() ? tr("menu.subtitle") : "";
  if (svc.sprites.has("ui_logo")) {
    const info = (svc.sprites as { info?: (k: string) => { frameW: number; frameH: number } | undefined }).info?.("ui_logo");
    const w = Math.min(420, (info?.frameW ?? 200) * 2) * scale;
    const h = info ? (w * info.frameH) / info.frameW : w * 0.4;
    g.unflip(cx, () => k.drawSprite({ sprite: "ui_logo", pos: k.vec2(cx, cy + bob), anchor: "center", width: w, height: h }));
    if (sub) g.text(sub, cx, cy + h / 2 + 14 + bob, { size: 14 * Math.max(1, scale * 0.85), color: C.cyan, anchor: "center", outline: -1 });
    return;
  }
  // stripes behind
  const sw = 400 * scale;
  for (let i = 0; i < 3; i++) g.rect(cx - sw / 2, cy - 28 * scale + i * 22 * scale + bob, sw, 3, C.cyanDim, 0.35);
  g.text("SKY", cx, cy - 44 * scale + bob, { size: 52 * scale, color: C.cyan, anchor: "center", outline: 3 });
  g.text("REAPER", cx + 3, cy + 18 * scale + bob + 3, { size: 70 * scale, color: C.amberDim, anchor: "center" });
  g.text("REAPER", cx, cy + 18 * scale + bob, { size: 70 * scale, color: C.amber, anchor: "center", outline: 3 });
  // sweeping shine
  const sx = cx - sw / 2 - 100 + ((t * 160) % (sw + 400)) - 100;
  k.drawRect({ pos: k.vec2(sx, cy - 70 * scale + bob), width: 18, height: 130 * scale, color: k.rgb(255, 255, 255), opacity: 0.07, angle: 18 });
  g.text(sub || "TACTICAL AIR STRIKE", cx, cy + 70 * scale + bob, { size: 14 * Math.max(1, scale * 0.85), color: C.text, anchor: "center", outline: -1 });
}

/** wide layout geometry: [left = logo + record, right = menu] */
const wideCols = () => cols([1, Math.min(440, Math.max(340, GAME_W * 0.3))], 48, M + 20, GAME_W - M - 20);

export function registerMenu(svc: Services): void {
  const { k } = svc;
  k.scene(SCENES.menu, () => {
    let overlay: "credits" | null = null;
    const kit = beginScene(svc, SCENES.menu, {
      music: "menu",
      drawContent: (kk) => {
        if (WIDE) {
          const [left] = wideCols();
          drawLogo(kk, svc, 210, 1.35, left!.x + left!.w / 2);
          if (overlay === "credits") drawCredits(kk, svc);
          else drawRecord(kk, svc, left!.x, 380, left!.w);
          return;
        }
        drawLogo(kk, svc, 190);
        if (overlay === "credits") drawCredits(kk, svc);
        else drawFooter(kk, svc);
      },
      navHint: (m) => menuHint(m, overlay !== null),
    });
    const { root } = kit;

    const build = (focus?: string) => {
      if (overlay === "credits") {
        root.back = () => {
          overlay = null;
          build("credits");
        };
        const bw = WIDE ? 260 : 200;
        root.set([button({ id: "close", x: (GAME_W - bw) / 2, y: 764, w: bw, h: 52, label: tr("common.back"), onClick: () => root.back?.(), cap: kit.cap("ESC", "B") })], "close");
        return;
      }
      root.back = null;
      const right = WIDE ? wideCols()[1]! : null;
      const W = right ? right.w : 300;
      const X = right ? right.x : (GAME_W - W) / 2;
      const bh = WIDE ? 70 : 58;
      const step = WIDE ? 88 : 70;
      let y = WIDE ? 200 : 340;
      const items: Widget[] = [];
      const add = (id: string, label: string, sub: string | undefined, onClick: () => void, accent = C.amber, cap?: string, tip?: string[]) => {
        items.push(
          button({
            id,
            x: X,
            y,
            w: W,
            h: bh,
            label,
            sub,
            onClick,
            accent,
            size: WIDE ? 24 : 20,
            align: WIDE ? "left" : "center",
            cap: cap ? kit.cap(cap) : undefined,
            tooltip: tip ? () => tip : undefined,
          }),
        );
        y += step;
      };
      const prog = hasProgress(svc);
      const next = nextChapter(svc);
      add(
        "start",
        prog ? tr("menu.continue") : tr("menu.start"),
        tr("menu.continue.sub", { n: CHAPTER_IDS.indexOf(next) + 1, operation: chapterInfo(next).subtitle.toUpperCase() }),
        () => k.go(SCENES.game, { chapterId: next }),
        C.amber,
        undefined,
        [chapterInfo(next).name, chapterInfo(next).briefing],
      );
      add("chapters", tr("menu.chapters"), WIDE ? tr("menu.chapters.sub") : undefined, () => k.go(SCENES.chapters), C.cyan);
      add("hangar", tr("menu.hangar"), tr("common.creditsShort", { n: fmtNum(svc.save.data.credits) }), () => k.go(SCENES.shop), C.cyan, undefined, [tr("menu.hangar"), tr("menu.hangar.desc")]);
      add("settings", tr("menu.settings"), WIDE ? tr("menu.settings.sub") : undefined, () => k.go(SCENES.settings), C.cyan);
      add(
        "credits",
        tr("menu.credits"),
        WIDE ? tr("menu.credits.sub") : undefined,
        () => {
          overlay = "credits";
          build();
        },
        C.cyan,
      );
      root.set(items, focus);
    };
    build();
  });
}

function menuHint(m: "kb" | "pad" | "touch", overlay: boolean): HintItem[] {
  if (overlay) return m === "kb" ? [[["ESC"], tr("common.back")]] : [[["B"], tr("common.back")]];
  return m === "kb"
    ? [
        [["ARROWS"], tr("common.move")],
        [["ENTER"], tr("common.select")],
        [["CLICK"], tr("common.select")],
      ]
    : [
        [["D-PAD"], tr("common.move")],
        [["A"], tr("common.select")],
      ];
}

/** in-flight controls summary for the current device */
function controlsHint(kit: SceneKit): HintItem[] | string {
  const mode = kit.mode();
  if (mode === "touch") return tr("menu.touchHint");
  const MOVE = tr("common.move");
  const FIRE = tr("controls.fire");
  const BOMB = tr("controls.bomb");
  const FLARE = tr("controls.flare");
  const SWAP = tr("controls.swap");
  if (mode === "pad")
    return [
      [["STICK"], MOVE],
      [["A"], FIRE],
      [["B"], BOMB],
      [["Y"], FLARE],
      [["LB", "LT"], SWAP],
    ];
  if (!WIDE)
    return [
      [["WASD"], MOVE],
      [["SPACE"], FIRE],
      [["K"], BOMB],
      [["SHIFT"], FLARE],
      [["Q/E/R"], SWAP],
    ];
  return [
    [["W", "A", "S", "D"], MOVE],
    [["SPACE"], FIRE],
    [["K"], BOMB],
    [["SHIFT"], FLARE],
    [["Q", "E", "R"], SWAP],
  ];
}

function drawFooter(kit: SceneKit, svc: Services): void {
  const { g } = kit;
  const hs = svc.save.data.highScores[0];
  const y = GAME_H - 88 - kit.insets.bottom;
  if (hs) {
    g.text(tr("menu.hiScore", { score: fmtNum(hs.score), name: esc(hs.name) }), GAME_W / 2, y, { size: 14, color: C.amber, anchor: "center", outline: -1 });
  }
  const hint = controlsHint(kit);
  if (typeof hint === "string") g.text(hint, GAME_W / 2, y + 28, { size: 11, color: C.text, anchor: "center", width: 440, align: "center", outline: 1 });
  else g.hintBar(hint, GAME_W / 2, y + 28, { size: 8 });
  g.text(tr("common.version", { version: "0.1" }), GAME_W / 2, y + 54, { size: 10, color: C.grey, anchor: "center", outline: 1 });
}

/** wide: pilot record (progress, medals, totals, top pilots, controls) under the logo */
function drawRecord(kit: SceneKit, svc: Services, x: number, y: number, w: number): void {
  const { g } = kit;
  const d = svc.save.data;
  const h = 296;
  g.panel(x, y, w, h, { title: tr("menu.pilotRecord"), accent: C.cyan });
  const [a, b] = cols([0.46, 0.54], 28, x + 22, x + w - 22);
  // left: aircraft + progress
  const ac = d.selectedAircraft;
  const skin = equippedSkin(d, ac);
  g.ring(a!.x + 50, y + 82, 44, C.cyanDim, 1, 0.6);
  drawSkinnedAircraft(g, svc.sprites, ac, skin, a!.x + 50, y + 82 + Math.sin(svc.k.time() * 2) * 3, 2.6);
  g.text(aircraftName(ac), a!.x + 112, y + 54, { size: 18, color: C.white, outline: -1 });
  g.text(tr("menu.schemeName", { skin: skinName(skin) }), a!.x + 112, y + 80, { size: 11, color: C.cyan, width: a!.w - 112, maxLines: 1 });
  g.text(tr("common.creditsShort", { n: fmtNum(d.credits) }), a!.x + 112, y + 100, { size: 14, color: C.amber });
  const cleared = CHAPTER_IDS.filter((id) => d.chapters[id]?.completed).length;
  g.text(tr("menu.campaign"), a!.x, y + 146, { size: 11, color: C.grey });
  g.text(tr("menu.clearedOf", { n: cleared, total: CHAPTER_IDS.length }), a!.x + a!.w, y + 146, { size: 11, color: C.text, anchor: "topright" });
  const segW = (a!.w - 4 * 6) / CHAPTER_IDS.length;
  CHAPTER_IDS.forEach((id, i) => {
    const rec = d.chapters[id];
    const open = i <= d.chaptersUnlocked;
    const sx = a!.x + i * (segW + 6);
    g.rect(sx, y + 166, segW, 26, rec?.completed ? C.navy3 : C.dark, 0.9, 3);
    g.frame(sx, y + 166, segW, 26, rec?.completed ? (MEDAL_COLORS[rec.medal] ?? C.steel) : open ? C.cyanDim : C.steel, 1, 1, 3);
    g.text(String(i + 1), sx + segW / 2, y + 179, { size: 12, color: rec?.completed ? C.white : open ? C.cyan : C.steel, anchor: "center" });
  });
  const t = d.totals;
  const hrs = Math.floor(t.secondsPlayed / 3600);
  const mins = Math.floor((t.secondsPlayed % 3600) / 60);
  [
    [tr("menu.sorties"), fmtNum(t.plays)],
    [tr("menu.kills"), fmtNum(t.kills)],
    [tr("menu.flightTime"), hrs > 0 ? tr("menu.flightTimeHM", { h: hrs, m: mins }) : tr("menu.flightTimeM", { m: mins })],
  ].forEach(([n, v], i) => {
    g.text(n!, a!.x, y + 214 + i * 22, { size: 11, color: C.grey });
    g.text(v!, a!.x + a!.w, y + 214 + i * 22, { size: 12, color: C.text, anchor: "topright" });
  });
  // right: top pilots
  g.text(tr("common.topPilots"), b!.x, y + 28, { size: 13, color: C.cyan });
  const hs = d.highScores.slice(0, 8);
  if (!hs.length) g.text(tr("common.noRecordsFly"), b!.x, y + 56, { size: 12, color: C.grey, width: b!.w });
  hs.forEach((e, i) => {
    const ry = y + 54 + i * 26;
    const col = i === 0 ? C.gold : i < 3 ? C.white : C.text;
    if (i % 2 === 0) g.rect(b!.x - 6, ry - 5, b!.w + 12, 24, C.navy2, 0.5, 2);
    g.text(`${i + 1}.`, b!.x, ry, { size: 12, color: C.text });
    g.text(esc(e.name), b!.x + 34, ry, { size: 13, color: col });
    const ci = CHAPTER_IDS.indexOf(e.chapter as ChapterId);
    g.text(ci >= 0 ? tr("common.chapterShort", { n: ci + 1 }) : "", b!.x + 150, ry, { size: 11, color: C.text });
    g.text(fmtNum(e.score), b!.x + b!.w, ry, { size: 13, color: col, anchor: "topright" });
  });
  // controls strip under the panel
  const hint = controlsHint(kit);
  const cy = y + h + 30;
  if (typeof hint === "string") g.text(hint, x + w / 2, cy, { size: 12, color: C.text, anchor: "center", outline: 1 });
  else g.hintBar(hint, x + w / 2, cy, { size: 10 });
  g.text(tr("common.version", { version: "0.1" }), x + w / 2, cy + 32, { size: 10, color: C.grey, anchor: "center", outline: 1 });
}

function drawCredits(kit: SceneKit, svc: Services): void {
  const { g } = kit;
  const w = WIDE ? Math.min(820, GAME_W - 2 * M) : GAME_W - 48;
  const x = (GAME_W - w) / 2;
  const y = WIDE ? 360 : 300;
  const h = WIDE ? 380 : 440;
  if (WIDE) g.rect(0, 0, GAME_W, GAME_H, C.dark, 0.55);
  g.panel(x, y, w, h, { title: tr("menu.creditsTitle") });
  const lines = [tr("menu.creditsLine1"), tr("menu.creditsLine2"), tr("menu.creditsLine3"), tr("menu.creditsLine4"), tr("menu.creditsLine5")];
  const [c1, c2] = WIDE ? cols([0.45, 0.55], 32, x + 20, x + w - 20) : [{ x: x + 20, w: w - 40 }, { x: x + 20, w: w - 40 }];
  lines.forEach((l, i) => g.text(l, c1!.x, y + 28 + i * 22, { size: 12, color: i === 0 ? C.amber : C.text, width: c1!.w }));
  const ly = WIDE ? y + 28 : y + 140;
  g.text(tr("common.topPilots"), c2!.x, ly, { size: 14, color: C.cyan });
  const hs = svc.save.data.highScores;
  if (!hs.length) g.text(tr("common.noRecordsFly"), c2!.x, ly + 28, { size: 12, color: C.grey, width: c2!.w });
  hs.slice(0, 10).forEach((e, i) => {
    const ry = ly + 26 + i * (WIDE ? 30 : 24);
    const col = i === 0 ? C.gold : i < 3 ? C.white : C.text;
    g.text(`${String(i + 1).padStart(2, " ")}.`, c2!.x, ry, { size: 13, color: C.grey });
    g.text(esc(e.name), c2!.x + 40, ry, { size: 13, color: col });
    const ci = CHAPTER_IDS.indexOf(e.chapter as ChapterId);
    g.text(ci >= 0 ? tr("common.chapterShort", { n: ci + 1 }) : "", c2!.x + 180, ry, { size: 12, color: C.grey });
    g.text(fmtNum(e.score), c2!.x + c2!.w, ry, { size: 13, color: col, anchor: "topright" });
  });
}
