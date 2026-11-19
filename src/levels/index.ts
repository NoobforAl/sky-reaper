/**
 * Level / campaign module (Level agent).
 *  - levels.chapters : 5 ChapterDefs in campaign order (pacific, jungle, desert, arctic, citadel)
 *  - levels.createRunner(id) : a fresh LevelRunner (timeline + weather + tutorial hints + biome background)
 * See docs/LEVEL_NOTES.md for outlines, timelines and tuning knobs.
 */
import type { Biome, ChapterDef, ChapterId, LevelModule, LevelRunner } from "../contracts";
import { makeMenuBackdrop, type MenuBackdrop, type MenuBackdropOpts } from "./backgrounds";
import { arctic } from "./chapters/arctic";
import { citadel } from "./chapters/citadel";
import { desert } from "./chapters/desert";
import { jungle } from "./chapters/jungle";
import { pacific } from "./chapters/pacific";
import { ChapterRunner } from "./runner";
import type { ChapterScript } from "./types";

export { BiomeBackground, BG_TUNING, setReducedMotion, isReducedMotion } from "./backgrounds";
export type { MenuBackdrop, MenuBackdropOpts } from "./backgrounds";
export { RUNNER_TUNING, ChapterRunner } from "./runner";
export { TUTORIAL_HINTS } from "./tutorial";

export const CHAPTER_SCRIPTS: ChapterScript[] = [pacific(), jungle(), desert(), arctic(), citadel()];

const chapters: ChapterDef[] = CHAPTER_SCRIPTS.map((s) => s.def);

/**
 * Menu backdrop: the real biome background (tiles, decor, clouds) slowly scrolling under a dark veil.
 * `const bd = createMenuBackdrop("arctic"); k.onDraw(() => bd.draw(k, k.time()))`. Respects setReducedMotion().
 */
export function createMenuBackdrop(biome: Biome, opts?: MenuBackdropOpts): MenuBackdrop {
  const def = chapters.find((c) => c.biome === biome) ?? chapters[0]!;
  return makeMenuBackdrop(def, opts);
}

export const levels: LevelModule = {
  chapters,
  createRunner(chapterId: ChapterId): LevelRunner {
    const script = CHAPTER_SCRIPTS.find((s) => s.def.id === chapterId) ?? CHAPTER_SCRIPTS[0]!;
    return new ChapterRunner(script);
  },
};
