/**
 * Persian UI font loader (Vazirmatn, SIL OFL 1.1 — see public/fonts/OFL-Vazirmatn.txt).
 * Registers the subset woff2 files with the FontFace API and waits for document.fonts.load() so the first
 * Canvas2D draw already uses the real glyphs (plan §10 "font loading race").
 */

export const FA_FONT_FAMILY = "Vazirmatn";
/** CSS font stack used by the Canvas2D renderer (fallbacks only matter if the woff2 failed to load) */
export const FA_FONT_STACK = `${FA_FONT_FAMILY}, "Noto Sans Arabic", Tahoma, sans-serif`;

const FILES: Array<{ file: string; weight: string }> = [
  { file: "vazirmatn-regular-subset.woff2", weight: "400" },
  { file: "vazirmatn-bold-subset.woff2", weight: "700" },
];

let loading: Promise<boolean> | null = null;

/** base URL of the public dir (vite base is "./"; the demo page lives at /src/i18n/ so use the site root there) */
function defaultBase(): string {
  try {
    const b = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
    if (b === "./" && typeof location !== "undefined" && location.pathname.includes("/src/")) return "/";
    return b.endsWith("/") ? b : `${b}/`;
  } catch {
    return "/";
  }
}

/**
 * Load Vazirmatn once (idempotent). Resolves true when at least one weight is usable, false on failure
 * (callers then fall back to the system Arabic font: still shaped correctly, just a different look).
 */
export function loadPersianFont(baseUrl: string = defaultBase()): Promise<boolean> {
  if (loading) return loading;
  loading = (async () => {
    if (typeof document === "undefined" || typeof FontFace === "undefined" || !document.fonts) return false;
    let ok = 0;
    await Promise.all(
      FILES.map(async (f) => {
        try {
          const face = new FontFace(FA_FONT_FAMILY, `url(${baseUrl}fonts/${f.file}) format("woff2")`, {
            weight: f.weight,
            style: "normal",
            display: "block",
          });
          await face.load();
          document.fonts.add(face);
          ok++;
        } catch (e) {
          console.warn(`[i18n] font ${f.file} failed to load`, e);
        }
      }),
    );
    try {
      // make sure both weights are resolved for canvas use (canvas does not trigger lazy font loads by itself)
      await Promise.all([document.fonts.load(`400 16px ${FA_FONT_FAMILY}`, "شروع"), document.fonts.load(`700 16px ${FA_FONT_FAMILY}`, "شروع")]);
    } catch {
      /* ignore */
    }
    return ok > 0;
  })();
  return loading;
}

/** true once the bold weight is available to Canvas2D */
export function persianFontReady(): boolean {
  try {
    return typeof document !== "undefined" && !!document.fonts && document.fonts.check(`700 16px ${FA_FONT_FAMILY}`, "شروع");
  } catch {
    return false;
  }
}
