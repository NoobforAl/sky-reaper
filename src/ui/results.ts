/** Results: stats, objectives, medal animation, credits count-up, top-10 initials, Retry / Next / Hangar / Menu. */
import { CHAPTER_IDS, GAME_H, GAME_W, SCENES, type ChapterId, type ResultsParams, type RunStats, type Services } from "../contracts";
import type { MenuPad } from "../input";
import { MAX_HIGH_SCORES } from "../save";
import { rememberChapter } from "./backdrop";
import { beginScene } from "./core";
import { chapterInfo } from "./data";
import { cols, WIDE } from "./layout";
import { C, esc, fmtNum, fmtTime, MEDAL_COLORS } from "./theme";
import { button, type HintItem, type Widget } from "./widgets";
import { medalName, objectiveText, tr } from "./i18n";

const ENGINE_DEFAULT_NAME = "PILOT";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const counted = new WeakSet<object>();
let lastInitials = "AAA";

function emptyStats(): RunStats {
  return {
    score: 0,
    kills: 0,
    airKills: 0,
    groundKills: 0,
    tagKills: {},
    damageTaken: 0,
    deaths: 0,
    coins: 0,
    bombsUsed: 0,
    flaresUsed: 0,
    timeSec: 0,
    bossDefeated: false,
    killRate: 0,
    spawned: 0,
  };
}

function sanitizeParams(raw: unknown): ResultsParams {
  const p = (raw ?? {}) as Partial<ResultsParams>;
  const id = CHAPTER_IDS.includes(p.chapterId as ChapterId) ? (p.chapterId as ChapterId) : "pacific";
  return {
    chapterId: id,
    victory: !!p.victory,
    stats: { ...emptyStats(), ...(p.stats ?? {}) },
    medal: Math.max(0, Math.min(4, Math.floor(p.medal ?? 0))),
    creditsEarned: Math.max(0, Math.floor(p.creditsEarned ?? 0)),
    objectives: Array.isArray(p.objectives) ? p.objectives : [],
    // CODE_REVIEW #9: only a victory is ever stored as the chapter best (save.recordChapter), so a failed run must
    // never claim "NEW BEST!" even if the engine sends newBest for it
    newBest: !!p.newBest && !!p.victory,
  };
}

export function registerResults(svc: Services): void {
  const { k } = svc;
  k.scene(SCENES.results, (raw?: ResultsParams) => {
    const P = sanitizeParams(raw);
    const save = svc.save;
    const ch = chapterInfo(P.chapterId);
    rememberChapter(P.chapterId);
    const idx = CHAPTER_IDS.indexOf(P.chapterId);
    const S = P.stats;

    // lifetime totals (once per run object)
    if (raw && typeof raw === "object" && !counted.has(raw)) {
      counted.add(raw);
      save.data.totals.plays += 1;
      save.data.totals.kills += Math.max(0, S.kills | 0);
      save.data.totals.secondsPlayed += Math.max(0, S.timeSec || 0);
      // CODE_REVIEW #22: the chapter 1 tutorial (src/levels/chapters/pacific.ts hint timeline) counts as seen once
      // the player has cleared chapter 1
      if (P.victory && P.chapterId === "pacific") save.data.tutorialSeen = true;
      save.save();
    }

    // high score entry: the engine records `PILOT`; we let the player rename it
    const hs = save.data.highScores;
    let entryIdx = hs.findIndex((e) => e.name === ENGINE_DEFAULT_NAME && e.score === Math.floor(S.score) && e.chapter === P.chapterId);
    const qualifies = S.score > 0 && (entryIdx >= 0 || hs.length < MAX_HIGH_SCORES || S.score > (hs[hs.length - 1]?.score ?? 0));
    let initialsState: "none" | "entry" | "done" = qualifies ? "entry" : "none";
    const letters = lastInitials.split("").map((c) => Math.max(0, ALPHABET.indexOf(c)));
    let slot = 0;
    let rank = entryIdx >= 0 ? entryIdx + 1 : 0;

    let skipped = false;
    let medalPlayed = false;
    let lastTick = 0;
    const T_SCORE = [0.35, 1.6];
    const T_MEDAL = 1.7;
    const T_CREDITS = [2.0, 3.1];
    const T_DONE = 3.2;

    // geometry: portrait = one column; wide = debrief + objectives left, credits + pilots right, buttons in a row
    const [c1, c2] = WIDE ? cols([1, 1], 32) : [{ x: 20, w: GAME_W - 40 }, { x: 20, w: GAME_W - 40 }];
    const L = c1!;
    const R = c2!;
    const G = WIDE
      ? { statsY: 120, statsH: 290, statStep: 26, objY: 434, objH: 190, objStep: 44, credY: 120, initY: 214, initH: 410, pilots: 10, btnY: 680 }
      : { statsY: 112, statsH: 228, statStep: 20, objY: 352, objH: 118, objStep: 32, credY: 482, initY: 536, initH: 164, pilots: 5, btnY: 708 };

    const kit = beginScene(svc, SCENES.results, {
      music: "results",
      navHint: (m): HintItem[] | null =>
        phase === "anim"
          ? null
          : initialsState === "entry"
            ? m === "kb"
              ? [
                  [["A-Z"], tr("common.type")],
                  [["ARROWS"], tr("common.pick")],
                  [["ENTER"], tr("common.save")],
                ]
              : [
                  [["D-PAD"], tr("common.pick")],
                  [["A"], tr("common.next")],
                ]
            : m === "kb"
              ? [
                  [["ARROWS"], tr("common.move")],
                  [["ENTER"], tr("common.select")],
                  [["ESC"], tr("common.menu")],
                ]
              : [
                  [["D-PAD"], tr("common.move")],
                  [["A"], tr("common.select")],
                  [["B"], tr("common.menu")],
                ],
      drawContent: (kk) => {
        const { g } = kk;
        const age = skipped ? 99 : kk.age();
        const top = 22 + kk.insets.top;
        // title
        const drop = Math.max(0, 1 - age / 0.35);
        const titleCol = P.victory ? C.amber : C.red;
        g.text(P.victory ? tr("results.complete") : tr("results.failed"), GAME_W / 2, top + 24 - drop * 40, {
          size: WIDE ? 38 : 30,
          color: titleCol,
          anchor: "center",
          outline: 2,
          opacity: 1 - drop,
        });
        g.text(tr("results.chapterLine", { n: idx + 1, name: esc(ch.name) }), GAME_W / 2, top + (WIDE ? 64 : 58), { size: WIDE ? 14 : 12, color: C.cyan, anchor: "center" });

        // stats panel
        const px = L.x;
        const py = G.statsY;
        const pw = L.w;
        g.panel(px, py, pw, G.statsH, { title: tr("results.debrief") });
        const sf = Math.max(0, Math.min(1, (age - T_SCORE[0]!) / (T_SCORE[1]! - T_SCORE[0]!)));
        const score = Math.floor(S.score * (1 - Math.pow(1 - sf, 3)));
        g.text(tr("results.score"), px + 18, py + 22, { size: 12, color: C.grey });
        g.text(fmtNum(score), px + 18, py + 38, { size: WIDE ? 36 : 30, color: C.white, outline: -1 });
        if (P.newBest && age > T_SCORE[1]!) {
          const pulse = 0.6 + 0.4 * Math.sin(k.time() * 8);
          g.text(tr("results.newBest"), px + 18, py + 76, { size: 13, color: C.amber, opacity: pulse });
        }
        const rows: Array<[string, string]> = [
          [tr("results.kills"), WIDE ? tr("results.killsDetail", { kills: S.kills, air: S.airKills, ground: S.groundKills }) : `${S.kills}`],
          [tr("results.killRate"), `${Math.round((S.killRate || 0) * 100)}%`],
          [tr("results.time"), fmtTime(S.timeSec)],
          [tr("results.damageTaken"), `${Math.round(S.damageTaken)}`],
          [tr("results.deaths"), `${S.deaths}`],
          [WIDE ? tr("results.bombsFlares") : tr("results.bombsFlaresShort"), `${S.bombsUsed} / ${S.flaresUsed}`],
        ];
        // round 5: highest THREAT rank reached this run (RunStats.threatMax, 0..3)
        const tm = (S as { threatMax?: number }).threatMax;
        if (typeof tm === "number" && Number.isFinite(tm)) rows.push([tr("results.maxThreat"), `${Math.max(0, Math.min(3, Math.round(tm)))} / 3`]);
        const statStep = !WIDE && rows.length > 6 ? 18 : G.statStep;
        // value column right of the widest label (font sizes are snapped per screen, so measure)
        const vx = px + 18 + Math.max(...rows.map(([a]) => g.measure(a, WIDE ? 13 : 11))) + 16;
        rows.forEach(([a, b], i) => {
          const ra = Math.max(0, Math.min(1, (age - 0.3 - i * 0.1) / 0.2));
          if (ra <= 0) return;
          const ry = py + 100 + i * statStep;
          g.text(a, px + 18, ry, { size: WIDE ? 13 : 11, color: C.grey, opacity: ra });
          g.text(b, vx, ry, { size: WIDE ? 14 : 12, color: C.white, opacity: ra });
        });
        // medal
        const mx = px + pw - (WIDE ? 110 : 76);
        const my = py + (WIDE ? 110 : 74);
        if (P.medal > 0 && age >= T_MEDAL) {
          if (!medalPlayed && !skipped) {
            medalPlayed = true;
            kit.root.sfx("medal");
          }
          const ma = age - T_MEDAL;
          const pop = ma < 0.25 ? 0.4 + (ma / 0.25) * 0.8 : ma < 0.4 ? 1.2 - ((ma - 0.25) / 0.15) * 0.2 : 1;
          const shine = (k.time() * 0.6) % 1.6;
          // rays
          for (let i = 0; i < 12; i++) {
            const a = ((i * 30 + k.time() * 20) * Math.PI) / 180;
            g.line(mx, my, mx + Math.cos(a) * 62 * pop, my + Math.sin(a) * 62 * pop, MEDAL_COLORS[P.medal]!, 2, 0.25);
          }
          g.medal(mx, my, 34 * pop, P.medal, svc.sprites, shine < 1 ? shine : 0);
          g.text(medalName(P.medal), mx, my + 54, { size: 14, color: MEDAL_COLORS[P.medal]!, anchor: "center", outline: -1 });
        } else if (P.medal === 0 && age >= T_MEDAL) {
          g.ring(mx, my, 32, C.steel, 2, 0.6);
          g.text(tr("medal.none"), mx, my + 54, { size: 11, color: C.grey, anchor: "center" });
        }

        // objectives
        const oy = G.objY;
        g.panel(px, oy, pw, G.objH, { title: tr("results.objectives"), accent: C.cyan });
        if (!P.objectives.length) g.text(P.victory ? tr("results.chapterCleared") : tr("results.objectivesVoid"), px + 18, oy + 24, { size: 12, color: C.grey, width: pw - 36 });
        P.objectives.slice(0, 3).forEach((o, i) => {
          const ra = Math.max(0, Math.min(1, (age - 0.9 - i * 0.15) / 0.2));
          if (ra <= 0) return;
          const ry = oy + (WIDE ? 30 : 22) + i * G.objStep;
          g.frame(px + 18, ry, 18, 18, o.done ? C.green : C.steel, 2, ra);
          if (o.done) g.check(px + 27, ry + 9, 14, C.green);
          else g.cross(px + 27, ry + 9, 12, C.red);
          g.text(esc(objectiveText(o.def)), px + 46, ry + 2, { size: WIDE ? 14 : 12, color: o.done ? C.green : C.grey, width: pw - 140, opacity: ra, maxLines: 1 });
          g.text(o.done ? `+${o.def.reward}` : "-", px + pw - 18, ry + 2, { size: WIDE ? 14 : 12, color: o.done ? C.amber : C.grey, anchor: "topright", opacity: ra });
        });

        // right column in WIDE (same column in portrait)
        const rx = R.x;
        const rw = R.w;
        // credits count-up
        const cy = G.credY;
        const cf = Math.max(0, Math.min(1, (age - T_CREDITS[0]!) / (T_CREDITS[1]! - T_CREDITS[0]!)));
        const shown = Math.floor(P.creditsEarned * cf);
        if (cf > 0 && cf < 1 && !skipped && k.time() - lastTick > 0.07) {
          lastTick = k.time();
          kit.root.sfx("pickup_coin", 0.35);
        }
        const ch2 = WIDE ? 64 : 42;
        g.rect(rx, cy, rw, ch2, C.navy, 0.9, 3);
        g.frame(rx, cy, rw, ch2, C.amberDim, 1, 1, 3);
        const earnedLbl = tr("results.creditsEarned");
        g.text(earnedLbl, rx + 16, cy + ch2 / 2, { size: 12, color: C.grey, anchor: "left" });
        const totalLbl = tr("results.total", { n: fmtNum(save.data.credits - P.creditsEarned + shown) });
        // the count-up sits in the gap between the two labels (Farsi labels are wider than the English ones)
        const gl = rx + 16 + g.measure(earnedLbl, 12) + 8;
        const gr = rx + rw - 16 - g.measure(totalLbl, 11) - 8;
        g.text(`+${fmtNum(shown)}`, Math.max(gl + 40, Math.min(rx + rw / 2 + 40, (gl + gr) / 2)), cy + ch2 / 2, { size: WIDE ? 28 : 20, color: C.amber, anchor: "center" });
        g.text(totalLbl, rx + rw - 16, cy + ch2 / 2, { size: 11, color: C.text, anchor: "right" });

        // initials / ranking
        const iy = G.initY;
        if (initialsState === "entry" && age >= T_DONE) {
          g.panel(rx, iy, rw, G.initH, { title: tr("results.newHighScore"), accent: C.amber });
          const m = kk.mode();
          g.text(m === "kb" ? tr("results.typeInitials") : m === "pad" ? tr("results.padInitials") : tr("results.enterInitials"), rx + rw / 2, iy + 22, {
            size: 12,
            color: C.text,
            anchor: "center",
          });
          if (WIDE && rank > 0) g.text(tr("results.rank", { n: rank }), rx + rw / 2, iy + G.initH - 30, { size: 14, color: C.amber, anchor: "center" });
        } else if (age >= T_DONE) {
          g.panel(rx, iy, rw, G.initH, { title: tr("common.topPilots"), accent: C.cyan });
          const list = save.data.highScores.slice(0, G.pilots);
          const step = WIDE ? 34 : 28;
          if (!list.length) g.text(tr("common.noRecords"), rx + 18, iy + 26, { size: 12, color: C.grey });
          list.forEach((e, i) => {
            const ry = iy + (WIDE ? 26 : 20) + i * step;
            const mine = rank === i + 1;
            const col = mine ? C.amber : i === 0 ? C.gold : C.text;
            if (mine) g.rect(rx + 8, ry - 5, rw - 16, step - 4, C.amberDim, 0.35, 3);
            g.text(`${i + 1}.`, rx + 18, ry, { size: 13, color: C.grey });
            g.text(esc(e.name), rx + 56, ry, { size: 14, color: col });
            const ci = CHAPTER_IDS.indexOf(e.chapter as ChapterId);
            g.text(ci >= 0 ? tr("common.chapterShort", { n: ci + 1 }) : "", rx + 180, ry, { size: 11, color: C.grey });
            g.text(fmtNum(e.score), rx + rw - 18, ry, { size: 14, color: col, anchor: "topright" });
          });
          if (rank > G.pilots) g.text(tr("results.yourRank", { n: rank }), rx + rw - 14, iy, { size: 11, color: C.amber, anchor: "right" });
        }
        if (age < T_DONE) {
          const blink = Math.sin(k.time() * 5) > 0;
          const m = kk.mode();
          const skip = m === "touch" ? tr("results.tapSkip") : m === "pad" ? tr("results.padSkip") : tr("results.keySkip");
          if (blink) g.text(skip, GAME_W / 2, WIDE ? G.btnY + 30 : GAME_H - 60, { size: WIDE ? 13 : 11, color: C.grey, anchor: "center" });
        }
      },
    });
    const { root } = kit;

    // ------------------------------------------------------------ widgets
    let phase: "anim" | "final" = "anim";
    const finishAnim = () => {
      if (phase !== "anim") return;
      skipped = kit.age() < T_DONE;
      if (skipped && P.medal > 0 && !medalPlayed) {
        medalPlayed = true;
        root.sfx("medal");
      }
      phase = "final";
      build();
    };

    const commitInitials = () => {
      if (initialsState !== "entry") return;
      const name = letters.map((i) => ALPHABET[i] ?? "A").join("");
      lastInitials = name;
      const list = save.data.highScores;
      const at = list.findIndex((e) => e.name === ENGINE_DEFAULT_NAME && e.score === Math.floor(S.score) && e.chapter === P.chapterId);
      if (at >= 0) {
        list[at]!.name = name;
        save.save();
        rank = at + 1;
      } else {
        save.addHighScore({ name, score: S.score, chapter: P.chapterId });
        rank = save.data.highScores.findIndex((e) => e.name === name && e.score === Math.floor(S.score)) + 1;
      }
      entryIdx = rank - 1;
      initialsState = "done";
      root.capture = null;
      root.padCapture = null;
      root.sfx("ui_buy");
      build("retry");
    };

    const changeLetter = (s: number, d: number) => {
      letters[s] = (letters[s]! + d + ALPHABET.length) % ALPHABET.length;
      root.sfx("ui_move", 0.6);
    };

    const go = (scene: string, params?: unknown) => {
      if (initialsState === "entry") commitInitials();
      k.go(scene, params);
    };

    const build = (focus?: string) => {
      const ws: Widget[] = [];
      if (phase === "anim") {
        ws.push({
          id: "skip",
          x: 0,
          y: 0,
          w: GAME_W,
          h: GAME_H,
          sfx: false,
          draw: () => {},
          activate: finishAnim,
        });
        root.set(ws, "skip");
        return;
      }
      if (initialsState === "entry") {
        const iy = G.initY + (WIDE ? 90 : 0);
        const sx0 = R.x + R.w / 2 - 96;
        // initials are Latin and read left to right: on the mirrored RTL layer the slots are laid out reversed
        const flipSlots = kit.root.g.mirrored;
        for (let s = 0; s < 3; s++) {
          const x = sx0 + (flipSlots ? 2 - s : s) * 64;
          ws.push(
            button({ id: `up${s}`, x, y: iy + 40, w: 56, h: 30, label: "+", size: 16, sfx: false, accent: C.cyan, onClick: () => ((slot = s), changeLetter(s, 1)) }),
            {
              id: `slot${s}`,
              x,
              y: iy + 74,
              w: 56,
              h: 48,
              sfx: false,
              draw: (g, st) => {
                const on = slot === s;
                g.rect(x, iy + 74, 56, 48, on ? C.navy3 : C.navy, 1, 3);
                g.frame(x, iy + 74, 56, 48, on ? C.amber : C.steel, on ? 2 : 1, 1, 3);
                const blink = on && Math.sin(st.t * 8) > -0.3;
                g.text(ALPHABET[letters[s]!]!, x + 28, iy + 98, { size: 28, color: blink ? C.amber : C.white, anchor: "center" });
              },
              activate: () => {
                slot = s;
              },
            },
            button({ id: `dn${s}`, x, y: iy + 126, w: 56, h: 30, label: "-", size: 16, sfx: false, accent: C.cyan, onClick: () => ((slot = s), changeLetter(s, -1)) }),
          );
        }
        ws.push(button({ id: "ok", x: flipSlots ? sx0 - 80 : sx0 + 3 * 64 + 4, y: iy + 74, w: 72, h: 48, label: tr("common.ok"), size: 18, onClick: commitInitials }));
        root.capture = (name) => {
          if (/^[a-z0-9]$/.test(name)) {
            letters[slot] = Math.max(0, ALPHABET.indexOf(name.toUpperCase()));
            root.sfx("ui_move", 0.6);
            if (slot < 2) slot++;
            return true;
          }
          if (name === "up") changeLetter(slot, 1);
          else if (name === "down") changeLetter(slot, -1);
          else if (name === "left") slot = Math.max(0, slot - 1);
          else if (name === "right") slot = Math.min(2, slot + 1);
          else if (name === "backspace") slot = Math.max(0, slot - 1);
          else if (name === "enter" || name === "escape") commitInitials();
          return true;
        };
        root.padCapture = (p: MenuPad) => {
          if (p.up) changeLetter(slot, 1);
          if (p.down) changeLetter(slot, -1);
          if (p.left) slot = Math.max(0, slot - 1);
          if (p.right) {
            if (slot < 2) slot++;
          }
          if (p.confirm || p.start) {
            if (slot < 2) slot++;
            else commitInitials();
          }
          if (p.back) slot = Math.max(0, slot - 1);
        };
      }
      const nextId = idx >= 0 && idx < CHAPTER_IDS.length - 1 ? CHAPTER_IDS[idx + 1]! : null;
      const canNext = P.victory && nextId !== null && idx + 1 <= save.data.chaptersUnlocked;
      // slots: portrait 2x2 grid, wide 4 in a row
      const slot4 = WIDE ? cols([1, 1, 1, 1], 16) : null;
      const bw = (GAME_W - 48) / 2;
      const at = (i: number) =>
        slot4 ? { x: slot4[i]!.x, y: G.btnY, w: slot4[i]!.w, h: 64 } : { x: i % 2 === 0 ? 20 : 28 + bw, y: G.btnY + (i >= 2 ? 58 : 0), w: bw, h: 50 };
      const sz = WIDE ? 20 : 17;
      const cap = (kb: string) => (WIDE ? kit.cap(kb) : undefined);
      ws.push(
        button({ id: "retry", ...at(0), label: tr("results.retry"), size: sz, onClick: () => go(SCENES.game, { chapterId: P.chapterId }), cap: cap("R") }),
        canNext
          ? button({ id: "next", ...at(1), label: tr("common.next"), sub: tr("common.chapterN", { n: idx + 2 }), size: sz, onClick: () => go(SCENES.game, { chapterId: nextId! }), cap: cap("N") })
          : button({ id: "chapters", ...at(1), label: tr("results.chapters"), size: sz, accent: C.cyan, onClick: () => go(SCENES.chapters), cap: cap("C") }),
        button({ id: "hangar", ...at(2), label: tr("results.hangar"), size: sz, accent: C.cyan, onClick: () => go(SCENES.shop), cap: cap("H") }),
        button({ id: "menu", ...at(3), label: tr("common.menu"), size: sz, accent: C.cyan, onClick: () => go(SCENES.menu), cap: kit.cap("ESC", "B") }),
      );
      root.back = () => go(SCENES.menu);
      root.shortcuts = { r: "retry", n: "next", c: "chapters", h: "hangar" };
      root.set(ws, focus ?? (initialsState === "entry" ? "ok" : canNext ? "next" : "retry"));
    };
    build();
    k.wait(T_DONE, () => {
      if (phase === "anim") {
        phase = "final";
        build();
      }
    });
  });
}
