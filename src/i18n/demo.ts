/**
 * Standalone TextService demo (not part of the game build). `npx vite --port 5281 --strictPort`, then open
 * http://localhost:5281/src/i18n/demo.html . Shows shaping, RTL + embedded Latin, outline, alignment, wrapping,
 * Persian digits (digit atlas) and an overflow report next to the unchanged English bitmap path.
 */
import kaplay from "kaplay";
import { setLocale, t, setPersianDigits } from "./index";
import { loadPersianFont } from "./font";
import { createTextService, textService as T } from "./text";

const W = 720;
const H = 980;

async function boot() {
  const k = kaplay({
    canvas: document.getElementById("demo") as HTMLCanvasElement,
    width: W,
    height: H,
    global: false,
    crisp: true,
    texFilter: "nearest",
    pixelDensity: 1,
    background: [8, 12, 24],
    debug: false,
  });

  // Latin bitmap fonts, exactly as the game's loader registers them (read-only use of the asset manifest)
  try {
    const man = await (await fetch("/assets/manifest.json")).json();
    for (const f of man.fonts ?? []) k.loadBitmapFont(f.key, `/${f.src}`, f.gridW, f.gridH, { chars: f.chars, ...(f.filter ? { filter: f.filter } : {}) });
  } catch (e) {
    console.warn("demo: no bitmap fonts", e);
  }

  const fontOk = await loadPersianFont("/");
  await T.init(k);
  setLocale("fa");
  setPersianDigits(true);

  const cyan: [number, number, number] = [80, 220, 255];
  const amber: [number, number, number] = [255, 196, 64];
  const grey: [number, number, number] = [150, 160, 180];
  const white: [number, number, number] = [240, 244, 255];

  const frame = (x: number, y: number, w: number, h: number) =>
    k.drawRect({ pos: k.vec2(x, y), width: w, height: h, fill: false, outline: { width: 1, color: k.rgb(60, 80, 110) } });

  k.onDraw(() => {
    const tm = k.time();
    setLocale("fa");
    // 1) title with outline (right aligned to the right margin: RTL screen)
    T.drawText(k, t("menu.start"), { pos: [W - 24, 20], size: 40, color: amber, outline: 3, anchor: "topright", id: "menu.start" });
    T.drawText(k, "Vazirmatn " + (fontOk ? "OK" : "FALLBACK"), { pos: [24, 34], size: 14, color: grey, weight: 400 });

    // 2) the three reference words from the plan + mixed-direction sentence
    T.drawText(k, "شروع، تنظیمات، آشیانه", { pos: [W - 24, 92], size: 28, color: white, outline: 2, anchor: "topright" });
    T.drawText(k, "SPACE را نگه دارید", { pos: [W - 24, 142], size: 26, color: cyan, outline: 2, anchor: "topright" });
    T.drawText(k, t("tutorial.fire_air.key"), { pos: [W - 24, 190], size: 18, color: white, anchor: "topright", id: "tutorial.fire_air.key" });
    T.drawText(k, t("tutorial.weapons.key"), { pos: [W - 24, 222], size: 18, color: white, anchor: "topright" });

    // 3) alignment inside a 300-wide box (start = right edge in RTL)
    const bx = W - 24 - 330;
    frame(bx, 266, 330, 132);
    T.drawText(k, `${t("settings.title")} (راست)`, { pos: [bx + 330 - 8, 274], size: 18, color: white, anchor: "topright" });
    T.drawText(k, `${t("shop.title")} (وسط)`, { pos: [bx + 165, 314], size: 18, color: white, anchor: "top" });
    T.drawText(k, `${t("pause.title")} (چپ)`, { pos: [bx + 8, 354], size: 18, color: white, anchor: "topleft" });

    // 4) wrapping: chapter briefing in a 320-wide column, multi-line, start aligned
    frame(24, 266, 320, 300);
    T.drawText(k, t("chapter.pacific.name"), { pos: [24 + 320 - 8, 272], size: 20, color: amber, anchor: "topright", outline: 1 });
    T.drawText(k, t("chapter.pacific.briefing"), { pos: [24 + 320 - 8, 304], size: 15, color: white, maxWidth: 304, anchor: "topright", weight: 400, id: "chapter.pacific.briefing" });

    // 5) numbers: Persian digits through the digit atlas (changes every frame, no re-raster)
    const score = Math.floor(tm * 1234) * 10;
    T.drawText(k, t("hud.score"), { pos: [W - 24, 420], size: 16, color: cyan, anchor: "topright" });
    T.drawNumber(k, score, { pos: [W - 24, 446], size: 30, color: white, outline: 2, anchor: "topright" });
    T.drawText(k, t("results.rank", { n: 3 }), { pos: [W - 24, 494], size: 20, color: amber, anchor: "topright" });
    T.drawText(k, t("common.creditsShort", { n: 12500 }), { pos: [W - 24, 528], size: 20, color: amber, anchor: "topright" });
    T.drawText(k, t("objective.pac_naval", { n: 6 }), { pos: [W - 24, 562], size: 18, color: white, anchor: "topright" });

    // 6) HUD-sized labels (14 px minimum) + objective with percent
    T.drawText(k, `${t("hud.hull")}  ${t("hud.shield")}  ${t("hud.flare")}  ${t("hud.ordnance")}`, { pos: [W - 24, 606], size: 14, color: grey, anchor: "topright" });
    T.drawText(k, t("objective.jun_rate", { n: 70 }), { pos: [W - 24, 634], size: 16, color: white, anchor: "topright" });
    T.drawText(k, t("boss.ice_dreadnought"), { pos: [W / 2, 680], size: 22, color: [255, 90, 80], outline: 2, anchor: "top" });

    // 7) overflow report: a button label in a 90-wide box without wrapping
    frame(W - 24 - 90, 730, 90, 30);
    T.drawText(k, t("settings.resetKeys"), { pos: [W - 24 - 4, 736], size: 14, color: white, maxWidth: 90, wrap: false, anchor: "topright", id: "settings.resetKeys" });

    // 8) English path (bitmap font, unchanged) for comparison
    setLocale("en");
    k.drawLine({ p1: k.vec2(24, 790), p2: k.vec2(W - 24, 790), width: 1, color: k.rgb(60, 80, 110) });
    T.drawText(k, t("menu.start"), { pos: [24, 806], size: 24, color: amber, outline: 1 });
    T.drawText(k, t("tutorial.fire_air.key"), { pos: [24, 846], size: 14, color: white });
    T.drawNumber(k, score, { pos: [24, 878], size: 22, color: white });
    T.drawText(k, `${t("settings.language")}: ${t("settings.language.fa")}`, { pos: [24, 916], size: 16, color: cyan });
    const s = T.stats();
    T.drawText(k, `overflow reports ${T.overflows.length}  cache ${s.entries}  pages ${s.pages}  rasterized ${s.rasterized}`, { pos: [24, 950], size: 12, color: grey });
    setLocale("fa");
  });

  // ?stress=1: a tiny service (64 entries, 2 pages of 256) fed 40 new strings per frame -> exercises LRU + page recycling
  let stress: { frames: number; errors: number; stats: () => unknown } | null = null;
  if (new URLSearchParams(location.search).get("stress")) {
    const S = createTextService({ maxEntries: 64, pageSize: 256, maxPages: 2 });
    stress = { frames: 0, errors: 0, stats: () => S.stats() };
    k.onDraw(() => {
      const st = stress!;
      st.frames++;
      for (let i = 0; i < 40; i++) {
        try {
          S.drawText(k, `${t("hud.score")} ${st.frames * 40 + i}`, { pos: [8 + (i % 4) * 170, 8 + Math.floor(i / 4) * 24], size: 14, color: [255, 255, 255], weight: 400 });
        } catch {
          st.errors++;
        }
      }
    });
  }

  (window as unknown as Record<string, unknown>).__i18nDemo = { stress: () => stress && { frames: stress.frames, errors: stress.errors, stats: stress.stats() }, ready: true, fontOk, stats: () => T.stats(), overflows: T.overflows };
}

boot().catch((e) => {
  console.error(e);
  (window as unknown as Record<string, unknown>).__i18nDemo = { ready: false, error: String(e) };
});
