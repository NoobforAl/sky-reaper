/**
 * Chapter select: 5 biome cards (lock, best score, medal, objectives) + briefing panel + launch.
 * Portrait: stacked cards, briefing below. Wide: cards in a row, briefing + medal ladder / record panel below.
 */
import { CHAPTER_IDS, GAME_W, SCENES, type Services } from "../contracts";
import { rememberChapter, setBackdropChapter } from "./backdrop";
import { beginScene } from "./core";
import { chapterList, type ChapterInfo } from "./data";
import { BOTTOM_H, BOTTOM_Y, cols, M, WIDE } from "./layout";
import { nextChapter } from "./menu";
import { C, esc, fmtNum, fmtTime, hexToRgb, MEDAL_COLORS, MEDAL_NAMES, type RGB } from "./theme";
import { button, type Gfx, type WState, type Widget } from "./widgets";

/** wide geometry */
const WCARD_Y = 104;
const WCARD_H = 300;
const WBRIEF_Y = 432;
const WBRIEF_H = 318;
const wideBottom = () => cols([1, Math.min(420, Math.max(300, GAME_W * 0.28))]);

export function registerChapters(svc: Services): void {
  const { k } = svc;
  k.scene(SCENES.chapters, () => {
    const chapters = chapterList();
    const save = svc.save.data;
    let selected = Math.max(0, CHAPTER_IDS.indexOf(nextChapter(svc)));
    const unlocked = (c: ChapterInfo) => c.index <= save.chaptersUnlocked;

    const kit = beginScene(svc, SCENES.chapters, {
      music: "menu",
      backdropChapter: chapters[selected]!.id,
      drawContent: (kk) => {
        const { g } = kk;
        const top = 18 + kk.insets.top;
        if (WIDE) {
          g.text("SELECT CHAPTER", M, top + 30, { size: 30, color: C.amber, anchor: "left", outline: 2 });
          g.text("CAMPAIGN  -  5 OPERATIONS", M + 440, top + 32, { size: 12, color: C.cyan, anchor: "left" });
        } else {
          g.text("SELECT CHAPTER", GAME_W / 2, top + 22, { size: 26, color: C.amber, anchor: "center", outline: 2 });
          g.text("CAMPAIGN", GAME_W / 2, top + 50, { size: 11, color: C.cyan, anchor: "center" });
        }
        // follow focus for selection
        const f = kit.root.focusId;
        if (f?.startsWith("ch_") && kit.root.showFocus) selected = Number(f.slice(3));
        // backdrop follows the selected chapter (crossfade); unlocked choices are remembered for the other screens
        const sel = chapters[selected]!;
        setBackdropChapter(sel.id);
        if (unlocked(sel)) rememberChapter(sel.id);
        // mouse hover previews a card's briefing without changing the selection
        const h = kit.root.hoverId;
        const shown = h?.startsWith("ch_") ? Number(h.slice(3)) : selected;
        const c = chapters[shown]!;
        if (WIDE) {
          const [bl, br] = wideBottom();
          drawBriefing(g, c, unlocked(c), svc, bl!.x, WBRIEF_Y, bl!.w, WBRIEF_H);
          drawRecordPanel(g, c, unlocked(c), svc, br!.x, WBRIEF_Y, br!.w, BOTTOM_Y - 22 - WBRIEF_Y);
        } else drawBriefing(g, c, unlocked(c), svc, 20, 488, GAME_W - 40, 274);
      },
    });
    const { root } = kit;
    root.back = () => k.go(SCENES.menu);
    root.onWheel = (dir) => {
      const n = Math.max(0, Math.min(chapters.length - 1, selected + dir));
      if (n === selected) return;
      selected = n;
      root.focus("ch_" + n);
      root.sfx("ui_move", 0.6);
    };

    const launch = () => {
      const c = chapters[selected]!;
      if (!unlocked(c)) {
        root.sfx("ui_deny");
        return;
      }
      k.go(SCENES.game, { chapterId: c.id });
    };

    const cardCols = WIDE ? cols(chapters.map(() => 1), 18) : [];
    const widgets: Widget[] = chapters.map((c, i) => {
      const geo = WIDE ? { x: cardCols[i]!.x, y: WCARD_Y, w: cardCols[i]!.w, h: WCARD_H } : { x: 20, y: 92 + i * 77, w: GAME_W - 40, h: 70 };
      const w: Widget = {
        id: "ch_" + i,
        ...geo,
        sfx: false,
        draw: (g, s) => (WIDE ? drawCardWide(g, s, w, c, unlocked(c), i === selected, svc) : drawCard(g, s, w, c, unlocked(c), i === selected, svc)),
        activate: () => {
          if (selected === i && unlocked(c)) {
            root.sfx("ui_select");
            launch();
            return;
          }
          selected = i;
          root.sfx(unlocked(c) ? "ui_move" : "ui_deny");
        },
        tooltip: () =>
          unlocked(c)
            ? [`${c.index + 1}. ${c.name}`, c.subtitle.toUpperCase(), selected === i ? "CLICK AGAIN TO LAUNCH" : "CLICK TO SELECT - DOUBLE CLICK TO LAUNCH"]
            : [`${c.index + 1}. CLASSIFIED`, `Clear chapter ${c.index} to unlock.`],
      };
      return w;
    });
    const [bl, br] = WIDE ? wideBottom() : [null, null];
    widgets.push(
      button({
        id: "back",
        x: WIDE ? bl!.x : 20,
        y: BOTTOM_Y,
        w: WIDE ? 220 : 140,
        h: BOTTOM_H,
        label: "BACK",
        onClick: () => root.goBack(),
        sfx: false,
        accent: C.cyan,
        cap: kit.cap("ESC", "B"),
      }),
      button({
        id: "launch",
        x: WIDE ? br!.x : 172,
        y: BOTTOM_Y,
        w: WIDE ? br!.w : GAME_W - 192,
        h: BOTTOM_H,
        label: "LAUNCH",
        sub: () => (unlocked(chapters[selected]!) ? `CHAPTER ${selected + 1}` : "LOCKED"),
        disabled: () => !unlocked(chapters[selected]!),
        onClick: launch,
        size: 22,
        cap: kit.cap("ENTER", "A"),
      }),
    );
    root.set(widgets, "ch_" + selected);
  });
}

function drawCard(g: Gfx, s: WState, w: Widget, c: ChapterInfo, open: boolean, sel: boolean, svc: Services): void {
  const pal = hexToRgb(c.palette.bg, C.navy);
  const mid = hexToRgb(c.palette.mid, C.steel);
  const acc = hexToRgb(c.palette.accent, C.cyan);
  const hot = s.focus || s.hover || sel;
  // biome strip
  g.rect(w.x, w.y, w.w, w.h, open ? pal : C.navy, 0.95, 3);
  for (let i = 0; i < 6; i++) g.rect(w.x + w.w - 150 + i * 26, w.y, 14, w.h, mid, open ? 0.25 : 0.08);
  g.rect(w.x, w.y, 6, w.h, open ? acc : C.steel);
  g.frame(w.x, w.y, w.w, w.h, hot ? (open ? acc : C.steel) : C.steel, hot ? 2 : 1, 1, 3);
  if (sel) g.frame(w.x - 3, w.y - 3, w.w + 6, w.h + 6, C.amber, 2, 0.5 + 0.4 * Math.sin(s.t * 6), 4);

  const num = String(c.index + 1).padStart(2, "0");
  g.text(num, w.x + 20, w.y + w.h / 2, { size: 30, color: open ? C.white : C.steel, outline: -1, anchor: "left" });
  g.text(open ? esc(c.name) : "CLASSIFIED", w.x + 74, w.y + 8, { size: 15, color: open ? C.white : C.text, outline: -1, width: w.w - 150 });
  g.text(esc(c.subtitle.toUpperCase()), w.x + 74, w.y + 29, { size: 11, color: open ? acc : C.grey, outline: 1 });
  if (!open) {
    g.lock(w.x + w.w - 34, w.y + w.h / 2, 26, C.grey);
    g.text("CLEAR PREVIOUS", w.x + 74, w.y + 49, { size: 10, color: C.text });
    return;
  }
  const rec = svc.save.data.chapters[c.id];
  if (rec?.completed) {
    const objN = c.objectives.length || 3;
    g.text(`BEST ${fmtNum(rec.bestScore)}   OBJ ${Math.min(rec.objectivesDone.length, objN)}/${objN}`, w.x + 74, w.y + 49, { size: 11, color: C.amber, outline: 1 });
    if (rec.medal > 0) g.medal(w.x + w.w - 34, w.y + w.h / 2 + 8, 15, rec.medal, svc.sprites);
    else g.check(w.x + w.w - 34, w.y + w.h / 2, 22, C.green);
  } else {
    g.text("NEW", w.x + 74, w.y + 49, { size: 11, color: C.green, outline: 1 });
  }
}

/** wide: tall card with a biome "terrain" illustration */
function drawCardWide(g: Gfx, s: WState, w: Widget, c: ChapterInfo, open: boolean, sel: boolean, svc: Services): void {
  const pal = hexToRgb(c.palette.bg, C.navy);
  const mid = hexToRgb(c.palette.mid, C.steel);
  const acc = hexToRgb(c.palette.accent, C.cyan);
  const hot = s.focus || s.hover;
  const lift = hot && open ? -4 : 0;
  const y = w.y + lift;
  g.rect(w.x + 4, w.y + 6, w.w, w.h, C.dark, 0.6, 4);
  g.rect(w.x, y, w.w, w.h, open ? pal : C.navy, 0.97, 4);
  // illustration: diagonal terrain bands scrolling slowly
  const artH = 150;
  const t = s.t * (hot ? 30 : 10);
  for (let i = 0; i < 8; i++) {
    const by = y + 8 + ((i * 22 + t) % artH);
    if (by > y + artH - 4) continue;
    g.rect(w.x + 8, by, w.w - 16, 10, mid, open ? 0.18 + (i % 3) * 0.06 : 0.05);
  }
  if (open) {
    // little jet over the terrain
    g.circle(w.x + w.w / 2, y + 90, 34, acc, 0.08);
    g.aircraft(svc.save.data.selectedAircraft, w.x + w.w / 2, y + 84 + Math.sin(s.t * 2 + c.index) * 4, 2, svc.sprites, C.steelHi);
  } else g.lock(w.x + w.w / 2, y + 84, 40, C.grey);
  g.rect(w.x, y + artH, w.w, 3, open ? acc : C.steel, 0.9);
  g.frame(w.x, y, w.w, w.h, hot ? (open ? acc : C.steelHi) : C.steel, hot ? 2 : 1, 1, 4);
  if (sel) g.frame(w.x - 4, y - 4, w.w + 8, w.h + 8, C.amber, 2, 0.5 + 0.4 * Math.sin(s.t * 6), 5);
  if (s.focus && !sel) g.frame(w.x - 4, y - 4, w.w + 8, w.h + 8, C.cyan, 1, 0.6, 5);

  const px = w.x + 16;
  g.text(String(c.index + 1).padStart(2, "0"), px, y + 12, { size: 26, color: open ? C.white : C.steel, outline: -1 });
  g.text(open ? esc(c.name.replace(/^OPERATION\s+/i, "")) : "CLASSIFIED", px, y + artH + 16, { size: 16, color: open ? C.white : C.grey, outline: -1, width: w.w - 32 });
  g.text(esc(c.subtitle.toUpperCase()), px, y + artH + 44, { size: 11, color: open ? acc : C.steel });
  const rec = svc.save.data.chapters[c.id];
  const ry = y + w.h - 46;
  if (!open) {
    g.text(`CLEAR CHAPTER ${c.index}`, px, ry + 12, { size: 11, color: C.grey });
    return;
  }
  if (rec?.completed) {
    g.text("BEST", px, ry, { size: 10, color: C.grey });
    g.text(fmtNum(rec.bestScore), px, ry + 16, { size: 15, color: C.amber });
    if (rec.medal > 0) g.medal(w.x + w.w - 34, ry + 14, 16, rec.medal, svc.sprites);
    else g.check(w.x + w.w - 34, ry + 14, 22, C.green);
  } else {
    g.rect(px, ry + 4, 56, 22, C.green, 0.25, 3);
    g.text("NEW", px + 28, ry + 15, { size: 12, color: C.green, anchor: "center" });
  }
}

function drawBriefing(g: Gfx, c: ChapterInfo, open: boolean, svc: Services, x: number, y: number, w: number, h: number): void {
  const acc = hexToRgb(c.palette.accent, C.cyan);
  const big = WIDE;
  g.panel(x, y, w, h, { title: big ? `BRIEFING  -  CHAPTER ${c.index + 1}` : "BRIEFING", accent: acc as RGB });
  if (!open) {
    g.text("Complete the previous chapter to receive this briefing.", x + 18, y + 26, { size: big ? 15 : 13, color: C.text, width: w - 36 });
    return;
  }
  let ty = y + 24;
  if (big) {
    g.text(esc(c.name), x + 18, ty + 4, { size: 20, color: C.white, outline: -1 });
    g.text(esc(c.subtitle.toUpperCase()), x + w - 18, ty + 8, { size: 12, color: acc, anchor: "topright" });
    ty += 40;
  }
  const bh = g.text(esc(c.briefing), x + 18, ty, { size: big ? 14 : 12, color: C.white, width: w - 36, lineSpacing: big ? 5 : 2 });
  const rec = svc.save.data.chapters[c.id];
  // objectives flow below the (wrapped) briefing text
  const oy = Math.max(big ? y + 154 : y + 104, ty + bh + (big ? 14 : 10));
  const rowH = big ? 30 : 24;
  g.text("OBJECTIVES", x + 18, oy, { size: big ? 14 : 12, color: acc });
  if (!c.objectives.length) g.text("Destroy the boss. Survive.", x + 18, oy + 22, { size: 12, color: C.white });
  c.objectives.slice(0, 3).forEach((o, i) => {
    const ry = oy + (big ? 28 : 24) + i * rowH;
    const done = !!rec?.objectivesDone.includes(o.id);
    const bs = big ? 18 : 14;
    g.frame(x + 18, ry, bs, bs, done ? C.green : C.steel, 1);
    if (done) g.check(x + 18 + bs / 2, ry + bs / 2, bs - 2, C.green);
    g.text(esc(o.text), x + 26 + bs, ry + (big ? 1 : 0), { size: big ? 14 : 12, color: done ? C.green : C.white, width: w - 130 });
    if (o.reward) g.text(`+${o.reward} CR`, x + w - 18, ry, { size: big ? 13 : 11, color: C.amber, anchor: "topright" });
  });
  if (big) return; // the wide layout shows medals + record in its own panel
  // medal thresholds + record
  const my = y + h - 26;
  const ms = c.medalScores;
  if (oy + 24 + 3 * rowH > my - 4) return; // no room left
  g.text(`GOLD ${fmtNum(ms[2])}  ACE ${fmtNum(ms[3])}`, x + 18, my, { size: 10, color: C.text });
  if (rec?.completed) {
    const t = rec.bestTimeSec ? `  ${fmtTime(rec.bestTimeSec)}` : "";
    g.text(`${MEDAL_NAMES[rec.medal] ?? ""}${t}`, x + w - 18, my, { size: 10, color: C.amber, anchor: "topright" });
  }
}

/** wide: medal ladder + personal record for the shown chapter */
function drawRecordPanel(g: Gfx, c: ChapterInfo, open: boolean, svc: Services, x: number, y: number, w: number, h: number): void {
  g.panel(x, y, w, h, { title: "MEDALS & RECORD", accent: C.amber });
  const rec = svc.save.data.chapters[c.id];
  const ms = c.medalScores;
  for (let m = 1; m <= 4; m++) {
    const ry = y + 30 + (m - 1) * 44;
    const got = !!rec && rec.medal >= m;
    if (got) g.rect(x + 10, ry - 6, w - 20, 40, C.navy3, 0.6, 3);
    g.medal(x + 34, ry + 14, 14, m, svc.sprites);
    g.text(MEDAL_NAMES[m]!, x + 60, ry + 6, { size: 14, color: MEDAL_COLORS[m]! });
    g.text(open ? fmtNum(ms[m - 1] ?? 0) : "???", x + w - 18, ry + 6, { size: 14, color: got ? C.white : C.text, anchor: "topright" });
  }
  const by = y + 30 + 4 * 44 + 8;
  g.rect(x + 16, by - 6, w - 32, 1, C.steel, 0.8);
  if (rec?.completed) {
    g.text("BEST SCORE", x + 18, by + 6, { size: 11, color: C.grey });
    g.text(fmtNum(rec.bestScore), x + w - 18, by + 4, { size: 16, color: C.amber, anchor: "topright" });
    g.text("BEST TIME", x + 18, by + 32, { size: 11, color: C.grey });
    g.text(rec.bestTimeSec ? fmtTime(rec.bestTimeSec) : "-", x + w - 18, by + 30, { size: 14, color: C.text, anchor: "topright" });
  } else g.text(open ? "NOT YET CLEARED" : "LOCKED", x + 18, by + 10, { size: 12, color: open ? C.green : C.grey });
  if (c.reward > 0 && open) g.text(`CLEAR BONUS  +${fmtNum(c.reward)} CR`, x + 18, y + h - 22, { size: 11, color: C.amber });
}
