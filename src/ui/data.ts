/** Chapter info for menus, with fallbacks while src/levels is still a stub. */
import { CHAPTER_IDS, type ChapterDef, type ChapterId, type ObjectiveDef } from "../contracts";
import { levels } from "../levels";
import { content } from "./i18n";

export interface ChapterInfo {
  id: ChapterId;
  index: number;
  name: string;
  subtitle: string;
  briefing: string;
  palette: { bg: string; mid: string; accent: string; fg: string };
  objectives: ObjectiveDef[];
  medalScores: [number, number, number, number];
  reward: number;
}

const FALLBACK: Record<ChapterId, Omit<ChapterInfo, "id" | "index" | "objectives" | "medalScores" | "reward">> = {
  pacific: {
    name: "OPERATION TIDEBREAKER",
    subtitle: "Pacific Ocean",
    briefing: "Enemy carrier group spotted at sea. Break through the air screen, sink the escorts and cripple the carrier.",
    palette: { bg: "#0b2a4a", mid: "#1d5d8c", accent: "#5fd3ff", fg: "#e6f6ff" },
  },
  jungle: {
    name: "OPERATION GREEN HELL",
    subtitle: "River Jungle",
    briefing: "Hidden bases line the river delta. Bomb the camouflaged installations and bring down the gunship.",
    palette: { bg: "#10301a", mid: "#2f6b2a", accent: "#9be15d", fg: "#eaffd9" },
  },
  desert: {
    name: "OPERATION DUST DEVIL",
    subtitle: "Desert Storm",
    briefing: "Sandstorms cut visibility. Crosswinds push your aircraft. A land fortress guards the oil fields.",
    palette: { bg: "#4a3418", mid: "#a8773a", accent: "#ffcc66", fg: "#fff3d6" },
  },
  arctic: {
    name: "OPERATION WHITEOUT",
    subtitle: "Arctic Shelf",
    briefing: "Blizzards over the ice shelf hide an airborne dreadnought. Destroy its engines before it escapes.",
    palette: { bg: "#1c2f44", mid: "#8fb3cf", accent: "#bff0ff", fg: "#ffffff" },
  },
  citadel: {
    name: "OPERATION REAPER",
    subtitle: "The Citadel",
    briefing: "The enemy's industrial heart. Fight through the defense grid and destroy the Citadel core.",
    palette: { bg: "#1a1026", mid: "#4b2a6b", accent: "#ff5fd2", fg: "#ffe6fb" },
  },
};

function fromDef(c: ChapterDef): ChapterInfo {
  return {
    id: c.id,
    index: c.index,
    name: content(`chapter.${c.id}.name`, c.name),
    subtitle: content(`chapter.${c.id}.subtitle`, c.subtitle),
    briefing: content(`chapter.${c.id}.briefing`, c.briefing),
    palette: c.palette,
    objectives: c.objectives ?? [],
    medalScores: c.medalScores,
    reward: c.reward,
  };
}

export function chapterList(): ChapterInfo[] {
  let real: ChapterDef[] = [];
  try {
    real = Array.isArray(levels.chapters) ? levels.chapters : [];
  } catch {
    real = [];
  }
  return CHAPTER_IDS.map((id, i) => {
    const def = real.find((c) => c.id === id);
    if (def) return fromDef(def);
    const f = FALLBACK[id];
    const loc = { name: content(`chapter.${id}.name`, f.name), subtitle: content(`chapter.${id}.subtitle`, f.subtitle), briefing: content(`chapter.${id}.briefing`, f.briefing) };
    return { id, index: i, ...f, ...loc, objectives: [], medalScores: [20000, 40000, 60000, 80000] as [number, number, number, number], reward: 0 };
  });
}

export function chapterInfo(id: ChapterId): ChapterInfo {
  return chapterList().find((c) => c.id === id) ?? chapterList()[0]!;
}
