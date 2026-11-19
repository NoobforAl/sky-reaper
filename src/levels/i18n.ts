/**
 * Level / boss string lookup with a guaranteed English fallback (round 5 i18n wiring, docs/I18N_STATUS.md section 6).
 * `tr(key, english)` returns the translated string when the key exists in the string tables, otherwise the English
 * text given here, so a key the i18n agent has not added yet never shows up as a raw key on screen.
 * Keys requested from the i18n owner: docs/I18N_KEYS_REQUESTED.md.
 */
import { hasKey, t, type TParams } from "../i18n";

export function tr(key: string | undefined, english: string, params?: TParams): string {
  if (!key) return english;
  try {
    return hasKey(key) ? t(key, params) : english;
  } catch {
    return english;
  }
}

/**
 * Optional i18n info carried on authored banner events (extra field, not part of the LevelEvent contract). Resolved
 * when the banner fires, so a language switch applies to the next banner.
 *  - key / subKey: string keys for text / subtext (English authored text is the fallback)
 *  - params / subParams: placeholder values; `paramKeys` values are [key, english] pairs resolved with tr() first
 *  - upper: upper-case the resolved title (no-op for Farsi), e.g. "Operation Tidebreak" -> "OPERATION TIDEBREAK"
 */
export interface BannerI18n {
  key?: string;
  subKey?: string;
  params?: TParams;
  paramKeys?: Record<string, [string, string]>;
  subParams?: TParams;
  subParamKeys?: Record<string, [string, string]>;
}

function withKeys(p: TParams | undefined, keys: Record<string, [string, string]> | undefined): TParams | undefined {
  if (!keys) return p;
  const out: TParams = { ...(p ?? {}) };
  for (const k in keys) {
    const [key, en] = keys[k]!;
    out[k] = tr(key, en);
  }
  return out;
}

/** resolve a banner's text / subtext (event time only; allocates a small params object when paramKeys are used) */
export function bannerText(i: BannerI18n | undefined, text: string, subtext: string | undefined): { text: string; subtext: string | undefined } {
  if (!i) return { text, subtext };
  const title = tr(i.key, text, withKeys(i.params, i.paramKeys));
  const sub = subtext !== undefined ? tr(i.subKey, subtext, withKeys(i.subParams ?? i.params, i.subParamKeys)) : undefined;
  return { text: title, subtext: sub };
}
