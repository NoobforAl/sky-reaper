/**
 * Level / campaign / boss contracts. OWNER: Orchestrator. Authored by the Level agent (src/levels, src/bosses).
 */
import type { Biome, ChapterId } from "./consts";
import type { EnemySpawnOpts } from "./enemies";
import type { RunStats, WorldAPI } from "./world";
import type { MusicId } from "./assets";

/** One scheduled event on the chapter timeline. `t` = seconds since chapter start. */
export type LevelEvent =
  | { t: number; type: "spawn"; enemy: string; x: number; y?: number; opts?: EnemySpawnOpts }
  /** spawn a formation: N units spaced by (dx,dy), optionally staggered in time */
  | {
      t: number;
      type: "formation";
      enemy: string;
      count: number;
      x: number;
      y?: number;
      dx?: number;
      dy?: number;
      staggerMs?: number;
      /** shape helper */
      shape?: "line" | "vee" | "column" | "arc";
      opts?: EnemySpawnOpts;
    }
  | { t: number; type: "banner"; text: string; subtext?: string; ms?: number }
  | { t: number; type: "scroll"; speed: number }
  | { t: number; type: "wind"; ax: number }
  | { t: number; type: "weather"; kind: "none" | "sandstorm" | "blizzard"; intensity: number }
  | { t: number; type: "tutorial"; step: string }
  | { t: number; type: "pickup"; kind: string; x: number; y?: number }
  /** hand over to boss; the chapter ends when the boss is defeated */
  | { t: number; type: "boss"; boss: string };

export interface ObjectiveDef {
  id: string;
  text: string;
  /** compare RunStats[stat] (or tagKills[tag]) against goal */
  stat: keyof RunStats | `tag:${string}`;
  goal: number;
  cmp: "gte" | "lte" | "eq";
  /** credits awarded for completing it */
  reward: number;
}

export interface ChapterDef {
  id: ChapterId;
  index: number;
  name: string;
  subtitle: string;
  briefing: string;
  biome: Biome;
  music: MusicId;
  /** base scroll speed units/s */
  scrollSpeed: number;
  /** palette used by HUD accents and fallback drawing: [bg, accent, fg] hex strings */
  palette: { bg: string; mid: string; accent: string; fg: string };
  events: LevelEvent[];
  boss: string;
  objectives: ObjectiveDef[];
  /** credit bonus on completion */
  reward: number;
  /** medal score thresholds [bronze, silver, gold, ace] */
  medalScores: [number, number, number, number];
}

export interface BackgroundRenderer {
  /** draw world below entities (tiles, decor, parallax). Called every frame. */
  drawBack(k: import("kaplay").KAPLAYCtx, scrollY: number, time: number): void;
  /** draw weather / clouds / fog above entities (sandstorm, blizzard, cloud shadows) */
  drawFront(k: import("kaplay").KAPLAYCtx, scrollY: number, time: number): void;
}

export interface LevelRunner {
  readonly chapter: ChapterDef;
  readonly background: BackgroundRenderer;
  /** 0..1 progress for the HUD */
  readonly progress: number;
  /** fire due events, run weather; called each sim step */
  update(dt: number, world: WorldAPI): void;
  /** active tutorial hint text, if any */
  readonly hint: string | null;
}

export interface BossHudInfo {
  name: string;
  hp: number;
  maxHp: number;
  phase: number;
  phases: number;
}

export interface BossController {
  readonly bossId: string;
  readonly done: boolean;
  /** called each sim step after spawn */
  update(dt: number, world: WorldAPI): void;
  hud(): BossHudInfo;
  /** called by the Engine when one of this boss's part Enemies dies */
  onPartDestroyed?(partName: string, world: WorldAPI): void;
}

export interface BossFactory {
  readonly ids: readonly string[];
  /** spawn parts via world.spawnEnemy and return the controller. Music: world.playMusic is via AudioService. */
  create(bossId: string, world: WorldAPI): BossController;
}

/** Implemented by src/levels/index.ts */
export interface LevelModule {
  chapters: ChapterDef[];
  createRunner(chapterId: ChapterId): LevelRunner;
}
