/**
 * i18n core (phase 1 of docs/I18N_FARSI_PLAN.md). Self-contained: not wired into any screen yet.
 *
 *   t("menu.start")                         -> "START MISSION" / "شروع"
 *   t("objective.pac_naval", { n: 6 })      -> "Sink 6 ships" / "6 کشتی را غرق کن" (۶ with Persian digits on)
 *   t("objective.cit_deaths", { n: 2, count: 2 }) -> picks the `one|other` plural form by `count`
 *
 * Placeholders: `{name}`. Number params are formatted with formatNumber (Persian digits when enabled); string params
 * are inserted verbatim (key names, player initials stay Latin). Literal ASCII digits in a Farsi template are
 * converted to Persian digits when that option is on.
 */
import { en, type StringKey, type StringTable } from "./locales/en";
import { fa } from "./locales/fa";

export type Locale = "en" | "fa";
export type { StringKey, StringTable };
export type TParams = Record<string, string | number>;

const TABLES: Record<Locale, StringTable> = { en, fa };
const RTL: Record<Locale, boolean> = { en: false, fa: true };

let locale: Locale = "en";
let persianDigits = true;
const listeners = new Set<(l: Locale) => void>();

export function setLocale(l: Locale): void {
  const next: Locale = l === "fa" ? "fa" : "en";
  if (next === locale) return;
  locale = next;
  for (const fn of listeners) {
    try {
      fn(locale);
    } catch (e) {
      console.warn("[i18n] locale listener failed", e);
    }
  }
}

export function getLocale(): Locale {
  return locale;
}

/** subscribe to locale changes (e.g. TextService clears its cache); returns an unsubscribe fn */
export function onLocaleChange(fn: (l: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isRtl(l: Locale = locale): boolean {
  return RTL[l];
}

/** user option (Settings.persianDigits proposal): only applies while the locale is "fa" */
export function setPersianDigits(on: boolean): void {
  persianDigits = on;
}

export function usesPersianDigits(): boolean {
  return locale === "fa" && persianDigits;
}

/** "fa" when navigator.language(s) prefers Persian (fa, fa-IR, fa-AF ...), else "en" */
export function detectLocale(nav: { language?: string; languages?: readonly string[] } | undefined = typeof navigator !== "undefined" ? navigator : undefined): Locale {
  const first = nav?.language || nav?.languages?.[0] || "";
  return /^fa(?:[-_]|$)/i.test(first) ? "fa" : "en";
}

/** resolve Settings.locale ("auto" | "en" | "fa") to a concrete locale */
export function resolveLocale(pref: "auto" | Locale | undefined): Locale {
  return pref === "en" || pref === "fa" ? pref : detectLocale();
}

// ------------------------------------------------------------------ digits / numbers

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** ASCII digits -> Persian digits; "." between digits -> Persian decimal separator "٫" */
export function toPersianDigits(s: string): string {
  return s.replace(/(\d)\.(?=\d)/g, "$1٫").replace(/[0-9]/g, (d) => FA_DIGITS[d.charCodeAt(0) - 48]!);
}

/** Persian / Arabic-Indic digits -> ASCII (for parsing) */
export function toAsciiDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/٫/g, ".");
}

export interface NumberFormatOpts {
  /** default: usesPersianDigits() */
  persianDigits?: boolean;
  /** thousands grouping (default true): "12,345" / "۱۲٬۳۴۵" */
  grouping?: boolean;
  /** fixed decimals (default: as-is, max 2) */
  decimals?: number;
}

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(lang: string, grouping: boolean, decimals: number | undefined): Intl.NumberFormat | null {
  const key = `${lang}|${grouping}|${decimals}`;
  let f = nfCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(lang, {
        useGrouping: grouping,
        minimumFractionDigits: decimals ?? 0,
        maximumFractionDigits: decimals ?? 2,
      });
    } catch {
      return null;
    }
    nfCache.set(key, f);
  }
  return f;
}

export function formatNumber(n: number, opts: NumberFormatOpts = {}): string {
  const pd = opts.persianDigits ?? usesPersianDigits();
  const grouping = opts.grouping ?? true;
  if (!Number.isFinite(n)) return pd ? "∞" : String(n);
  // Intl "fa-IR" gives Persian digits + "٬" grouping + "٫" decimals; "en-US" the ASCII equivalents
  const f = nf(pd ? "fa-IR" : "en-US", grouping, opts.decimals);
  let s = f ? f.format(n) : manual(n, grouping, opts.decimals);
  if (pd && /[0-9]/.test(s)) s = toPersianDigits(s.replace(/,/g, "٬")); // engines without fa-IR data
  // keep the sign as ASCII hyphen-minus/plus after the digits are converted: Intl fa-IR may emit U+2212 / LRM marks
  return s.replace(/[‎‏]/g, "").replace(/−/g, "-");
}

function manual(n: number, grouping: boolean, decimals: number | undefined): string {
  const fixed = decimals !== undefined ? n.toFixed(decimals) : String(Math.round(n * 100) / 100);
  if (!grouping) return fixed;
  const [i, d] = fixed.split(".");
  const g = i!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d ? `${g}.${d}` : g;
}

// ------------------------------------------------------------------ t()

const warned = new Set<string>();

export function hasKey(key: string): key is StringKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

/**
 * Translate `key` in the current locale. Falls back to English, then to the key itself (warns once).
 * `params.count` (number) selects the plural form when the string has `one|other` forms.
 */
export function t(key: StringKey | (string & {}), params?: TParams, l: Locale = locale): string {
  const table = TABLES[l] as Record<string, string>;
  let raw = table[key];
  if (raw === undefined) {
    raw = (en as Record<string, string>)[key];
    if (raw === undefined) {
      if (!warned.has(key)) {
        warned.add(key);
        console.warn(`[i18n] missing key "${key}"`);
      }
      return key;
    }
  }
  if (raw.includes("|")) {
    const forms = raw.split("|");
    const c = params && typeof params.count === "number" ? params.count : typeof params?.n === "number" ? params.n : 2;
    raw = pluralForm(forms, c, l);
  }
  const pd = l === "fa" && persianDigits;
  // split into literal text + placeholders so only literal digits / number params are converted
  let out = "";
  let last = 0;
  const re = /\{(\w+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const lit = raw.slice(last, m.index);
    out += pd ? toPersianDigits(lit) : lit;
    const v = params?.[m[1]!];
    if (v === undefined) out += m[0];
    else out += typeof v === "number" ? formatNumber(v, { persianDigits: pd, grouping: Math.abs(v) >= 10000 }) : v;
    last = m.index + m[0].length;
  }
  const tail = raw.slice(last);
  out += pd ? toPersianDigits(tail) : tail;
  return out;
}

/** en: one / other; fa: Persian nouns after numbers stay singular -> always the first form unless a 2nd exists for 0 */
function pluralForm(forms: string[], count: number, l: Locale): string {
  if (forms.length < 2) return forms[0]!;
  if (l === "fa") return forms[forms.length - 1]!;
  return count === 1 ? forms[0]! : forms[1]!;
}

/** true when `s` contains Arabic-script letters (needs shaping / RTL rendering) */
export function hasArabicScript(s: string): boolean {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(s);
}

/** all keys (for tests / tooling) */
export const STRING_KEYS = Object.keys(en) as StringKey[];
