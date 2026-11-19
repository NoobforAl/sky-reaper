/**
 * UI-side glue for src/i18n (round 5, Farsi step B):
 *  - tr(key, params): t() with a memo for parameterless keys (HUD labels are drawn every frame: no allocation) and a
 *    local fallback table for keys requested in docs/I18N_KEYS_REQUESTED.md that src/i18n does not have yet.
 *  - fromEn(str): strings produced by other modules in English (banners, tutorial hints, boss names, chapter names)
 *    are mapped back to their key through the English table and shown translated; unknown strings pass through.
 *  - content helpers (chapter / weapon / upgrade / aircraft / skin / objective texts): English keeps the game data
 *    as the source of truth; other locales use the keyed translation.
 *  - applyLocale(): setLocale + Vazirmatn loading + TextService cache reset.
 */
import type { KAPLAYCtx } from "kaplay";
import type { ObjectiveDef } from "../contracts";
import { getLocale, hasKey, isRtl, onLocaleChange, setLocale, setPersianDigits, t, type Locale, type TParams } from "../i18n";
import { en } from "../i18n/locales/en";
import { loadPersianFont } from "../i18n/font";
import { textService } from "../i18n/text";

/** keys not (yet) in src/i18n/locales: English + Farsi fallback (listed in docs/I18N_KEYS_REQUESTED.md) */
const EXTRA: Record<string, { en: string; fa: string }> = {
  "menu.flightTimeHM": { en: "{h}H {m}M", fa: "{h} ساعت {m} دقیقه" },
  "menu.flightTimeM": { en: "{m}M", fa: "{m} دقیقه" },
  "settings.secondsShort": { en: "{n}S", fa: "{n} ث" },
};

const memo = new Map<string, string>();
onLocaleChange(() => {
  memo.clear();
  enIndex = null;
});

function fill(tpl: string, params?: TParams): string {
  if (!params) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    return v === undefined ? m : String(v);
  });
}

/** translate a UI key; parameterless results are memoised per locale (safe to call every frame) */
export function tr(key: string, params?: TParams): string {
  if (!params) {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
  }
  let out: string;
  if (hasKey(key)) out = t(key, params);
  else {
    const e = EXTRA[key];
    out = e ? fill(getLocale() === "fa" ? e.fa : e.en, params) : t(key, params);
  }
  if (!params) memo.set(key, out);
  return out;
}

export const rtl = (): boolean => isRtl();
export const isFa = (): boolean => getLocale() === "fa";

// ------------------------------------------------------------------ reverse lookup for English strings from other modules

let enIndex: Map<string, string> | null = null;
const fromEnMemo = new Map<string, string>();

/** English text produced elsewhere (engine banners, level hints, boss names) -> translated text in the current locale */
export function fromEn(str: string): string {
  if (getLocale() === "en" || !str) return str;
  const hit = fromEnMemo.get(str);
  if (hit !== undefined) return hit;
  if (!enIndex) {
    enIndex = new Map();
    for (const [k, v] of Object.entries(en)) if (!v.includes("{") && !enIndex.has(norm(v))) enIndex.set(norm(v), k);
  }
  const key = enIndex.get(norm(str));
  const out = key ? t(key) : str;
  if (fromEnMemo.size > 400) fromEnMemo.clear();
  fromEnMemo.set(str, out);
  return out;
}
onLocaleChange(() => fromEnMemo.clear());
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

// ------------------------------------------------------------------ content strings

/** content text: game data in English, keyed translation otherwise (falls back to the data when a key is missing) */
export function content(key: string, fallback: string, params?: TParams): string {
  if (getLocale() === "en" || !hasKey(key)) return fallback;
  return t(key, params);
}

export const weaponName = (id: string, fb: string) => content(`weapon.${id}.name`, fb);
export const weaponDesc = (id: string, fb: string) => content(`weapon.${id}.desc`, fb);
export const upgradeName = (id: string, fb: string) => content(`upgrade.${id}.name`, fb);
export const upgradeDesc = (id: string, fb: string) => content(`upgrade.${id}.desc`, fb);
export const aircraftName = (id: string, fb?: string) => content(`aircraft.${id}.name`, fb ?? id.toUpperCase());
export const aircraftDesc = (id: string, fb: string) => content(`aircraft.${id}.desc`, fb);
export const skinName = (id: string, fb?: string) => content(`skin.${id}.name`, fb ?? id.toUpperCase());
export const skinDesc = (id: string, fb: string) => content(`skin.${id}.desc`, fb);
export const medalName = (m: number) => tr(`medal.${Math.max(0, Math.min(4, m | 0))}`);

/** objective line: keyed text with the goal as {n} (jun_rate is a ratio: shown as a percentage) */
export function objectiveText(o: ObjectiveDef): string {
  const key = `objective.${o.id}`;
  if (getLocale() === "en" || !hasKey(key)) return o.text;
  const n = o.id === "jun_rate" || (o.goal > 0 && o.goal < 1) ? Math.round(o.goal * 100) : o.goal;
  return t(key, { n, count: n });
}

// ------------------------------------------------------------------ locale switching

let fontReady = false;

/** set the UI language (from Settings.language); Farsi loads Vazirmatn first use and then re-rasterises cached text */
export function applyLocale(lang: Locale | undefined): Promise<void> {
  setPersianDigits(false); // FA_STYLE_GUIDE rule 8: Western digits are the default
  const l: Locale = lang === "fa" ? "fa" : "en";
  setLocale(l);
  try {
    document.documentElement.lang = l; // screen readers / browser translation; never `dir` (would flip the page CSS)
  } catch {
    /* no DOM */
  }
  if (l !== "fa" || fontReady) return Promise.resolve();
  return loadPersianFont().then(() => {
    fontReady = true;
    textService.clear();
  });
}

/** bind the shared TextService to the KAPLAY context (creates its atlas page) */
export function initText(k: KAPLAYCtx): void {
  void textService.init(k);
}
