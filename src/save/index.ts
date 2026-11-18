// STUB (Orchestrator) - UI/UX agent replaces with the full SaveService (versioned localStorage + migration).
import { DEFAULT_SETTINGS, type SaveData, type SaveService } from "../contracts";

const KEY = "sky-reaper-save-v1";

function fresh(): SaveData {
  return {
    version: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    credits: 0,
    upgrades: { damage: 0, fireRate: 0, hull: 0, shield: 0, bombs: 0, speed: 0, flares: 0 },
    unlockedAir: ["vulcan"],
    unlockedGround: ["bomb"],
    unlockedAircraft: ["falcon"],
    selectedAircraft: "falcon",
    chapters: {},
    chaptersUnlocked: 0,
    highScores: [],
    tutorialSeen: false,
    totals: { kills: 0, plays: 0, secondsPlayed: 0 },
  };
}

export function createSaveService(): SaveService {
  let data = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = { ...data, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  const listeners = new Set<() => void>();
  const svc: SaveService = {
    get data() {
      return data;
    },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* ignore */
      }
    },
    reset() {
      data = fresh();
      svc.save();
    },
    spend(c) {
      if (data.credits < c) return false;
      data.credits -= c;
      svc.save();
      return true;
    },
    earn(c) {
      data.credits += c;
      svc.save();
    },
    recordChapter() {},
    addHighScore() {},
    onSettingsChanged(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    notifySettingsChanged() {
      listeners.forEach((f) => f());
    },
  };
  return svc;
}
