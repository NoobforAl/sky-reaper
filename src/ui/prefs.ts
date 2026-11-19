/**
 * UI-only preferences (not part of the save contract). Shares the localStorage key `sky-reaper-ui` with the input
 * module (touch steering mode); every write merges into the stored object.
 */
import { CHAPTER_IDS, type ChapterId } from "../contracts";

const KEY = "sky-reaper-ui";

export interface UiPrefs {
  /** chapter whose biome the menu backdrop shows (last selected / played) */
  menuChapter?: ChapterId;
  /** calmer menus + backgrounds (null/undefined = follow the OS prefers-reduced-motion) */
  reducedMotion?: boolean;
}

let cache: UiPrefs | null = null;

export function readPrefs(): UiPrefs {
  if (cache) return cache;
  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(localStorage.getItem(KEY) || "{}") ?? {};
  } catch {
    p = {};
  }
  const out: UiPrefs = {};
  if (typeof p.menuChapter === "string" && (CHAPTER_IDS as readonly string[]).includes(p.menuChapter)) out.menuChapter = p.menuChapter as ChapterId;
  if (typeof p.reducedMotion === "boolean") out.reducedMotion = p.reducedMotion;
  cache = out;
  return out;
}

export function writePrefs(patch: UiPrefs): void {
  cache = { ...readPrefs(), ...patch };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") ?? {};
    localStorage.setItem(KEY, JSON.stringify({ ...raw, ...patch }));
  } catch {
    /* storage unavailable: keep the in-memory value */
  }
}

/** OS-level reduced motion preference */
export function osReducedMotion(): boolean {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function reducedMotion(): boolean {
  const p = readPrefs().reducedMotion;
  return p ?? osReducedMotion();
}
