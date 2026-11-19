/**
 * SaveService (UI/UX agent): versioned localStorage persistence.
 *  - defaults deep-merge + sanitising (unknown / wrongly typed fields are replaced by defaults)
 *  - migration hook per version (only v1 exists today; older unversioned blobs are treated as v0)
 *  - corruption safe: unparsable data is copied to `<KEY>-corrupt` and a fresh save is used
 *  - storage failures (private mode, quota) never throw; the game keeps working in memory
 *  - multi-tab: another tab's write is adopted via the `storage` event (no silent last-writer-wins)
 *  - a save from a newer build is backed up untouched to `<KEY>-v<n>` before we ever overwrite it
 *  - settings changes are written debounced (SETTINGS_SAVE_DEBOUNCE_MS), flushed on pagehide / hide
 */
import {
  AIR_WEAPON_IDS,
  AIRCRAFT_IDS,
  CHAPTER_IDS,
  DEFAULT_BINDINGS,
  DEFAULT_SETTINGS,
  GROUND_WEAPON_IDS,
  SKIN_IDS,
  type Action,
  type Bindings,
  type ChapterId,
  type ChapterRecord,
  type RunStats,
  type SaveData,
  type SaveService,
  type Settings,
  type SkinId,
  type UpgradeId,
} from "../contracts";

export const SAVE_KEY = "sky-reaper-save-v1";
export const SAVE_VERSION = 1;
export const MAX_HIGH_SCORES = 10;
const UPGRADE_IDS: UpgradeId[] = ["damage", "fireRate", "hull", "shield", "bombs", "speed", "flares"];
const MAX_UPGRADE_LEVEL = 8;

export function freshSave(): SaveData {
  return {
    version: 1,
    settings: freshSettings(),
    credits: 0,
    upgrades: { damage: 0, fireRate: 0, hull: 0, shield: 0, bombs: 0, speed: 0, flares: 0 },
    unlockedAir: ["vulcan"],
    unlockedGround: ["bomb"],
    unlockedAircraft: ["falcon"],
    selectedAircraft: "falcon",
    unlockedSkins: ["standard"],
    selectedSkin: {},
    chapters: {},
    chaptersUnlocked: 0,
    highScores: [],
    tutorialSeen: false,
    totals: { kills: 0, plays: 0, secondsPlayed: 0 },
  };
}

function freshSettings(): Settings {
  return { ...DEFAULT_SETTINGS, bindings: cloneBindings(DEFAULT_BINDINGS), language: detectLanguage() };
}

/**
 * Default UI language when the player has never chosen one: Farsi for devices set to Iran time (Asia/Tehran, or the
 * legacy "Iran" zone id), English otherwise. `?lang=fa|en` overrides it (testing). A saved choice always wins
 * (sanitizeSettings keeps it).
 */
export function detectLanguage(): "en" | "fa" {
  try {
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("lang") : null;
    if (q === "fa" || q === "en") return q;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === "Asia/Tehran" || tz === "Iran") return "fa";
  } catch {
    /* no Intl / no window: fall through */
  }
  return "en";
}

export function cloneBindings(b: Bindings): Bindings {
  const out = {} as Bindings;
  for (const a of Object.keys(DEFAULT_BINDINGS) as Action[]) out[a] = [...(b[a] ?? DEFAULT_BINDINGS[a])];
  return out;
}

// ------------------------------------------------------------------ sanitising helpers

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, min = -Infinity, max = Infinity): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const str = (v: unknown, d: string, maxLen = 64): string => (typeof v === "string" ? v.slice(0, maxLen) : d);
function idList<T extends string>(v: unknown, allowed: readonly T[], must: T): T[] {
  const out: T[] = [must];
  if (Array.isArray(v)) for (const x of v) if (allowed.includes(x as T) && !out.includes(x as T)) out.push(x as T);
  return out;
}

function sanitizeBindings(v: unknown): Bindings {
  const out = cloneBindings(DEFAULT_BINDINGS);
  if (!isObj(v)) return out;
  for (const a of Object.keys(DEFAULT_BINDINGS) as Action[]) {
    const keys = v[a];
    if (Array.isArray(keys)) {
      const clean = keys.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length < 24).slice(0, 4);
      if (clean.length) out[a] = clean;
    }
  }
  return out;
}

function sanitizeSettings(v: unknown): Settings {
  const d = freshSettings();
  if (!isObj(v)) return d;
  const tc = v.touchControls;
  return {
    masterVolume: num(v.masterVolume, d.masterVolume, 0, 1),
    musicVolume: num(v.musicVolume, d.musicVolume, 0, 1),
    sfxVolume: num(v.sfxVolume, d.sfxVolume, 0, 1),
    muted: bool(v.muted, d.muted),
    autoFire: bool(v.autoFire, d.autoFire),
    difficulty: num(v.difficulty, d.difficulty, 0, 1.5),
    screenShake: bool(v.screenShake, d.screenShake),
    showFps: bool(v.showFps, d.showFps),
    touchControls: tc === "auto" || tc === "on" || tc === "off" ? tc : d.touchControls,
    bindings: sanitizeBindings(v.bindings),
    // round 5 (optional in the contract): old saves have neither field -> defaults (popups on; language detected
    // from the device time zone, see detectLanguage)
    scorePopups: bool(v.scorePopups, d.scorePopups ?? true),
    language: v.language === "fa" || v.language === "en" ? v.language : (d.language ?? "en"),
  };
}

function sanitizeChapter(v: unknown): ChapterRecord | undefined {
  if (!isObj(v)) return undefined;
  const r: ChapterRecord = {
    completed: bool(v.completed, false),
    bestScore: Math.floor(num(v.bestScore, 0, 0)),
    medal: Math.floor(num(v.medal, 0, 0, 4)),
    objectivesDone: Array.isArray(v.objectivesDone) ? v.objectivesDone.filter((x): x is string => typeof x === "string").slice(0, 16) : [],
  };
  if (typeof v.bestTimeSec === "number" && Number.isFinite(v.bestTimeSec) && v.bestTimeSec > 0) r.bestTimeSec = v.bestTimeSec;
  return r;
}

/** Deep-merge a raw (possibly partial / old / hand-edited) object onto defaults. */
export function sanitizeSave(raw: unknown): SaveData {
  const d = freshSave();
  if (!isObj(raw)) return d;
  const up = isObj(raw.upgrades) ? raw.upgrades : {};
  const upgrades = { ...d.upgrades };
  for (const id of UPGRADE_IDS) upgrades[id] = Math.floor(num(up[id], 0, 0, MAX_UPGRADE_LEVEL));
  const chapters: SaveData["chapters"] = {};
  if (isObj(raw.chapters)) {
    for (const id of CHAPTER_IDS) {
      const r = sanitizeChapter(raw.chapters[id]);
      if (r) chapters[id] = r;
    }
  }
  const unlockedAircraft = idList(raw.unlockedAircraft, AIRCRAFT_IDS, "falcon");
  const sel = raw.selectedAircraft as (typeof AIRCRAFT_IDS)[number];
  // skins: "standard" always owned; a per-aircraft choice survives only if that skin is owned
  const unlockedSkins = idList(raw.unlockedSkins, SKIN_IDS, "standard");
  const selectedSkin: SaveData["selectedSkin"] = {};
  if (isObj(raw.selectedSkin)) {
    for (const ac of AIRCRAFT_IDS) {
      const s = raw.selectedSkin[ac] as SkinId;
      if (unlockedSkins.includes(s)) selectedSkin[ac] = s;
    }
  }
  const hs = Array.isArray(raw.highScores)
    ? raw.highScores
        .filter(isObj)
        .map((e) => ({ name: str(e.name, "???", 12), score: Math.floor(num(e.score, 0, 0)), chapter: str(e.chapter, "", 16), date: str(e.date, "", 32) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_HIGH_SCORES)
    : [];
  const tot = isObj(raw.totals) ? raw.totals : {};
  return {
    version: 1,
    settings: sanitizeSettings(raw.settings),
    credits: Math.floor(num(raw.credits, 0, 0, 1e9)),
    upgrades,
    unlockedAir: idList(raw.unlockedAir, AIR_WEAPON_IDS, "vulcan"),
    unlockedGround: idList(raw.unlockedGround, GROUND_WEAPON_IDS, "bomb"),
    unlockedAircraft,
    selectedAircraft: unlockedAircraft.includes(sel) ? sel : "falcon",
    unlockedSkins,
    selectedSkin,
    chapters,
    chaptersUnlocked: Math.floor(num(raw.chaptersUnlocked, 0, 0, CHAPTER_IDS.length - 1)),
    highScores: hs,
    tutorialSeen: bool(raw.tutorialSeen, false),
    totals: {
      kills: Math.floor(num(tot.kills, 0, 0)),
      plays: Math.floor(num(tot.plays, 0, 0)),
      secondsPlayed: num(tot.secondsPlayed, 0, 0),
    },
  };
}

/** Version migrations. Each step receives the raw object of version n and returns version n+1. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // v0 (pre-release, unversioned): identical shape; sanitizeSave fills the gaps.
  0: (raw) => ({ ...raw, version: 1 }),
};

export function migrate(raw: unknown): SaveData {
  if (!isObj(raw)) return freshSave();
  let cur: Record<string, unknown> = raw;
  let v = typeof cur.version === "number" ? cur.version : 0;
  if (v > SAVE_VERSION) {
    console.warn("[save] save from a newer version; loading best effort");
    v = SAVE_VERSION;
  }
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    cur = step ? step(cur) : { ...cur, version: v + 1 };
    v++;
  }
  return sanitizeSave(cur);
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function load(): SaveData {
  const ls = storage();
  if (!ls) return freshSave();
  let raw: string | null = null;
  try {
    raw = ls.getItem(SAVE_KEY);
  } catch {
    return freshSave();
  }
  if (!raw) return freshSave();
  try {
    const parsed: unknown = JSON.parse(raw);
    // CODE_REVIEW #13: a save written by a NEWER build is loaded best effort and our next write would drop the fields
    // we do not know. Keep the original blob untouched under `<KEY>-v<n>` (once) so the newer build can recover it.
    const ver = isObj(parsed) && typeof parsed.version === "number" ? parsed.version : 0;
    if (ver > SAVE_VERSION) {
      const backupKey = `${SAVE_KEY}-v${Math.floor(ver)}`;
      try {
        if (ls.getItem(backupKey) === null) ls.setItem(backupKey, raw);
      } catch {
        /* quota / private mode: best effort */
      }
    }
    return migrate(parsed);
  } catch (err) {
    console.warn("[save] corrupt save, starting fresh (backup kept)", err);
    try {
      ls.setItem(SAVE_KEY + "-corrupt", raw);
    } catch {
      /* ignore */
    }
    return freshSave();
  }
}

/** settings writes (slider drags, toggles) are coalesced: at most one localStorage write per this many ms */
export const SETTINGS_SAVE_DEBOUNCE_MS = 250;

export function createSaveService(): SaveService {
  let data = load();
  const listeners = new Set<() => void>();
  let warned = false;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const writeNow = (): void => {
    if (pending !== null) {
      clearTimeout(pending);
      pending = null;
    }
    const ls = storage();
    if (!ls) return;
    try {
      ls.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) {
      if (!warned) console.warn("[save] could not persist", err);
      warned = true;
    }
  };
  /** CODE_REVIEW #13: debounced write for high-frequency settings changes (every slider step used to write) */
  const writeSoon = (): void => {
    if (pending !== null) return;
    pending = setTimeout(writeNow, SETTINGS_SAVE_DEBOUNCE_MS);
  };
  const notify = (): void => {
    for (const f of [...listeners]) {
      try {
        f();
      } catch (err) {
        console.error("[save] settings listener failed", err);
      }
    }
  };

  if (typeof window !== "undefined") {
    // never lose a debounced write when the tab is hidden / closed
    const flush = () => {
      if (pending !== null) writeNow();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) flush();
    });
    // CODE_REVIEW #13: two open tabs each kept their own copy and the last writer silently erased the other's
    // purchases / progress. Adopt the other tab's save as soon as it writes (in place, so references held by open
    // screens, e.g. `save.data.settings`, stay live), then tell settings listeners.
    window.addEventListener("storage", (e: StorageEvent) => {
      if (e.key !== SAVE_KEY || e.newValue === null) return;
      try {
        if (e.storageArea && e.storageArea !== storage()) return;
      } catch {
        /* ignore */
      }
      let next: SaveData;
      try {
        next = migrate(JSON.parse(e.newValue));
      } catch {
        return; // the other tab wrote garbage: keep ours
      }
      if (pending !== null) {
        clearTimeout(pending); // our unsaved settings tweak loses to the other tab's newer full save
        pending = null;
      }
      const settings = data.settings;
      Object.assign(settings, next.settings);
      Object.assign(data, next, { settings });
      notify();
    });
  }

  const svc: SaveService = {
    get data() {
      return data;
    },
    save() {
      writeNow();
    },
    reset() {
      data = freshSave();
      svc.save();
      svc.notifySettingsChanged();
    },
    spend(c) {
      c = Math.max(0, Math.floor(c));
      if (!Number.isFinite(c) || data.credits < c) return false;
      data.credits -= c;
      svc.save();
      return true;
    },
    earn(c) {
      if (!Number.isFinite(c) || c <= 0) return;
      data.credits = Math.min(1e9, data.credits + Math.floor(c));
      svc.save();
    },
    recordChapter(id: ChapterId, stats: RunStats, medal: number, objectivesDone: string[]) {
      const prev = data.chapters[id];
      const rec: ChapterRecord = prev
        ? { ...prev, objectivesDone: [...prev.objectivesDone] }
        : { completed: false, bestScore: 0, medal: 0, objectivesDone: [] };
      rec.completed = true;
      rec.bestScore = Math.max(rec.bestScore, Math.floor(stats.score || 0));
      rec.medal = Math.max(rec.medal, Math.max(0, Math.min(4, Math.floor(medal || 0))));
      if (stats.timeSec > 0 && (!rec.bestTimeSec || stats.timeSec < rec.bestTimeSec)) rec.bestTimeSec = stats.timeSec;
      for (const o of objectivesDone) if (!rec.objectivesDone.includes(o)) rec.objectivesDone.push(o);
      data.chapters[id] = rec;
      const idx = CHAPTER_IDS.indexOf(id);
      if (idx >= 0) data.chaptersUnlocked = Math.max(data.chaptersUnlocked, Math.min(CHAPTER_IDS.length - 1, idx + 1));
      svc.save();
    },
    addHighScore(entry) {
      if (!Number.isFinite(entry.score) || entry.score <= 0) return;
      data.highScores.push({
        name: String(entry.name || "???").slice(0, 12),
        score: Math.floor(entry.score),
        chapter: String(entry.chapter || ""),
        date: new Date().toISOString(),
      });
      data.highScores.sort((a, b) => b.score - a.score);
      data.highScores.length = Math.min(data.highScores.length, MAX_HIGH_SCORES);
      svc.save();
    },
    onSettingsChanged(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    notifySettingsChanged() {
      writeSoon();
      notify();
    },
  };
  return svc;
}

/** True if a score would enter the top-10 table. */
export function qualifiesHighScore(save: SaveService, score: number): boolean {
  const hs = save.data.highScores;
  return score > 0 && (hs.length < MAX_HIGH_SCORES || score > (hs[hs.length - 1]?.score ?? 0));
}
