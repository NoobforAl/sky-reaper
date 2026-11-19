/**
 * Save, settings, input, HUD, progression and services contracts. OWNER: Orchestrator.
 */
import type { KAPLAYCtx } from "kaplay";
import type { AircraftId, AirWeaponId, ChapterId, GroundWeaponId, SkinId } from "./consts";
import type { AudioService, SpriteRegistry } from "./assets";
import type { PlayerState, RunStats } from "./world";
import type { BossHudInfo, ObjectiveDef } from "./levels";

// ---------------------------------------------------------------- input

export type Action =
  | "up"
  | "down"
  | "left"
  | "right"
  | "fire"
  | "bomb" // secondary / ground ordnance
  | "special" // flare / countermeasure
  | "weaponPrev"
  | "weaponNext"
  | "groundNext"
  | "pause";

/** Frame snapshot produced by InputService.poll(). Movement is analog (-1..1) so touch/gamepad are smooth. */
export interface InputState {
  moveX: number;
  moveY: number;
  /** held */
  fire: boolean;
  bomb: boolean;
  special: boolean;
  /** edge-triggered (true for exactly one poll after press) */
  bombPressed: boolean;
  specialPressed: boolean;
  weaponPrev: boolean;
  weaponNext: boolean;
  groundNext: boolean;
  pausePressed: boolean;
  /** touch drag-to-move: absolute target position in game units, or null */
  dragTarget: { x: number; y: number } | null;
}

export type Bindings = Record<Action, string[]>; // KAPLAY key names, e.g. "space", "w", "left"

export const DEFAULT_BINDINGS: Bindings = {
  up: ["w", "up"],
  down: ["s", "down"],
  left: ["a", "left"],
  right: ["d", "right"],
  fire: ["space", "j"],
  bomb: ["k"],
  special: ["shift"],
  weaponPrev: ["q"],
  weaponNext: ["e"],
  groundNext: ["r"],
  pause: ["escape", "p"],
};

export interface InputService {
  /** call once per sim step (or per frame; edge flags are latched until read) */
  poll(): InputState;
  /** true if a touch device was detected / touch used */
  readonly touchActive: boolean;
  /** show/hide on-screen touch controls (called by game scene on enter/exit) */
  setTouchControlsVisible(v: boolean): void;
  setAutoFire(v: boolean): void;
  readonly bindings: Bindings;
  rebind(action: Action, keys: string[]): void;
  resetBindings(): void;
  /** connected gamepad name or null */
  readonly gamepad: string | null;
}

// ---------------------------------------------------------------- settings & save

export interface Settings {
  masterVolume: number; // 0..1
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  autoFire: boolean;
  /** 0 easy .. 1 normal .. 1.5 hard */
  difficulty: number;
  screenShake: boolean;
  showFps: boolean;
  touchControls: "auto" | "on" | "off";
  bindings: Bindings;
  /** round 5: floating "+150" score popups on kills (optional for old saves; treat undefined as true) */
  scorePopups?: boolean;
  /** round 5: UI language (optional for old saves; treat undefined as "en") */
  language?: "en" | "fa";
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  muted: false,
  autoFire: false,
  difficulty: 1,
  screenShake: true,
  showFps: false,
  touchControls: "auto",
  bindings: DEFAULT_BINDINGS,
  scorePopups: true,
  language: "en",
};

export type UpgradeId = "damage" | "fireRate" | "hull" | "shield" | "bombs" | "speed" | "flares";

export interface ChapterRecord {
  completed: boolean;
  bestScore: number;
  /** 0 none, 1 bronze, 2 silver, 3 gold, 4 ace */
  medal: number;
  bestTimeSec?: number;
  objectivesDone: string[];
}

export interface SaveData {
  version: 1;
  settings: Settings;
  credits: number;
  upgrades: Record<UpgradeId, number>; // level 0..max
  unlockedAir: AirWeaponId[];
  unlockedGround: GroundWeaponId[];
  unlockedAircraft: AircraftId[];
  selectedAircraft: AircraftId;
  /** owned skins ("standard" always owned) and the chosen skin per aircraft */
  unlockedSkins: SkinId[];
  selectedSkin: Partial<Record<AircraftId, SkinId>>;
  chapters: Partial<Record<ChapterId, ChapterRecord>>;
  /** highest chapter index unlocked (0-based) */
  chaptersUnlocked: number;
  highScores: Array<{ name: string; score: number; chapter: string; date: string }>;
  tutorialSeen: boolean;
  /** total lifetime stats */
  totals: { kills: number; plays: number; secondsPlayed: number };
}

export interface SaveService {
  readonly data: SaveData;
  save(): void;
  reset(): void;
  /** convenience */
  spend(credits: number): boolean;
  earn(credits: number): void;
  recordChapter(id: ChapterId, stats: RunStats, medal: number, objectivesDone: string[]): void;
  addHighScore(entry: { name: string; score: number; chapter: string }): void;
  /** hot-reload settings into services (audio/input) after UI changes */
  onSettingsChanged(fn: () => void): () => void;
  notifySettingsChanged(): void;
}

// ---------------------------------------------------------------- progression (defined once, used by shop + engine)

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  maxLevel: number;
  /** cost of going from level n to n+1 = baseCost * (n+1) ^ 1.4 rounded; see core/progression.ts */
  baseCost: number;
  /** per-level multiplier/additive; interpreted by engine (documented in ARCHITECTURE.md) */
  perLevel: number;
}

export interface AircraftDef {
  id: AircraftId;
  name: string;
  desc: string;
  unlockCost: number;
  /** multipliers vs baseline */
  speed: number;
  hp: number;
  shield: number;
  fireRate: number;
  hitRadius: number;
  /** baseline ordnance capacity */
  bombs: number;
}

export interface SkinDef {
  id: SkinId;
  name: string;
  desc: string;
  /** credits to buy (0 = free); `unlockChapter` = also requires that chapter completed (optional) */
  cost: number;
  unlockChapter?: ChapterId;
}

// ---------------------------------------------------------------- HUD / results

export interface HudData {
  player: Readonly<PlayerState>;
  stats: Readonly<RunStats>;
  boss: BossHudInfo | null;
  /** 0..1 */
  progress: number;
  chapterName: string;
  /** active tutorial / hint line */
  hint: string | null;
  /** enemy missile warnings: screen positions of incoming missiles */
  incomingMissiles: Array<{ id: number; x: number; y: number; locked: boolean }>;
  banner: { text: string; subtext?: string; alpha: number } | null;
  fps: number;
  /** round 5: THREAT rank 0..3 (BALANCE_SPEC §7) and progress 0..1 toward the next level; HUD hides at 0 */
  threat?: number;
  threatProgress?: number;
}

export interface HudRenderer {
  /** draw HUD (call from the game scene's onDraw, after world render). Pure presentation. */
  draw(data: HudData): void;
}

export interface ResultsParams {
  chapterId: ChapterId;
  victory: boolean;
  stats: RunStats;
  medal: number;
  creditsEarned: number;
  objectives: Array<{ def: ObjectiveDef; done: boolean }>;
  newBest: boolean;
}

export interface GameSceneParams {
  chapterId: ChapterId;
  /** QA hook: skip to this timeline second */
  startAt?: number;
  /** QA hook: invulnerable player */
  godMode?: boolean;
  seed?: number;
}

// ---------------------------------------------------------------- services container

/** Passed to every module's register function. Created in src/main.ts. */
export interface Services {
  k: KAPLAYCtx;
  save: SaveService;
  audio: AudioService;
  input: InputService;
  sprites: SpriteRegistry;
}

/** Test hook object exposed on window.__sky for Playwright (Orchestrator wires in main.ts, Engine fills `game`). */
export interface SkyDebug {
  scene: string;
  fps: number;
  errors: string[];
  game?: {
    world: import("./world").WorldAPI;
    /** QA: force-kill all enemies / win the chapter */
    cheatWin(): void;
    cheatKillAll(): void;
    setGod(v: boolean): void;
  };
  services: Services;
  goto(scene: string, params?: unknown): void;
}
