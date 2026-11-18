/**
 * Asset contracts + sprite key conventions. OWNER: Orchestrator (Asset agent implements).
 *
 * Rules
 *  - Gameplay code refers to sprites ONLY by key through `SpriteRegistry.has/info`.
 *  - If a key is missing, the renderer falls back to a colored rect (never crash).
 *  - Multi-frame sprites are horizontal strips: frameW x frameH per frame, `frames` frames.
 *  - All art is authored at native pixels; draw at PIXEL_SCALE (see consts.ts).
 *  - Asset agent publishes the real list in `public/assets/manifest.json` (type AssetManifest)
 *    and documents it in docs/ASSET_MANIFEST.md.
 *
 * Sprite key conventions (native px sizes in parentheses are TARGETS, not hard limits)
 *   player_<aircraft>            3 frames: [0]=level [1]=bank left [2]=bank right      (24x24)
 *   player_<aircraft>_dmg        same, damaged look (optional)
 *   enemy_<id>                   N frames (animation, e.g. rotor spin)                 (see EnemyDef.size)
 *   enemy_<id>_dead              optional wreck for ground units (static)
 *   boss_<bossId>_<part>         e.g. boss_carrier_hull, boss_carrier_turret_l         (large)
 *   bullet_<id>                  player_vulcan, player_spread, player_missile, player_laser (beam seg),
 *                                player_bomb, player_rocket, player_pmissile, player_heavy
 *   ebullet_<id>                 small, orb, needle, big, missile, bomb, flak, laser
 *   fx_<id>                      explosion_s|m|l (8 frames), smoke, fire, spark, ring, flare, trail,
 *                                muzzle, shield, warning, lock, blast_ground, hit
 *   pickup_<kind>                see PICKUP_KINDS (12x12, 2-4 frames bob/spin)
 *   bgtile_<biome>_a|b           seamless 64x64 base tiles (water may be 4-frame animated strip)
 *   bgdeco_<biome>_<1..8>        scenery props (islands, trees, dunes, ice floes, pipes ...)
 *   bgcloud_<1..3>               cloud sprites (ocean / generic overlay)
 *   ui_<name>                    ui_panel, ui_button, ui_icon_<weapon id>, ui_heart, ui_shield, ui_bomb,
 *                                ui_medal_bronze|silver|gold|ace, ui_logo
 */

export interface SpriteInfo {
  key: string;
  /** url relative to site root, e.g. "assets/sprites/player_falcon.png" */
  src: string;
  frameW: number;
  frameH: number;
  frames: number;
  /** animation speed if animated (frames per second) */
  fps?: number;
  /** true => loop animation by default */
  loop?: boolean;
  /** true => placeholder art (must be listed in ASSET_CREDITS.md) */
  placeholder?: boolean;
}

export interface SoundInfo {
  key: string;
  /** url or "synth:<id>" if produced by the runtime synth */
  src: string;
  kind: "sfx" | "music";
  license: string;
  author: string;
}

export interface AssetManifest {
  version: 1;
  sprites: SpriteInfo[];
  sounds: SoundInfo[];
  fontKey?: string;
}

export interface SpriteRegistry {
  has(key: string): boolean;
  info(key: string): SpriteInfo | undefined;
}

/** SFX ids that gameplay/UI code may play. Asset agent MUST implement every one. */
export const SFX_IDS = [
  "shot_vulcan",
  "shot_spread",
  "shot_laser",
  "shot_missile",
  "bomb_drop",
  "bomb_explode",
  "rocket",
  "explode_s",
  "explode_m",
  "explode_l",
  "hit",
  "hit_metal",
  "player_hit",
  "player_die",
  "shield_up",
  "shield_hit",
  "pickup_coin",
  "pickup_power",
  "pickup_misc",
  "flare",
  "warning",
  "missile_launch",
  "lock_on",
  "boss_roar",
  "boss_phase",
  "ui_move",
  "ui_select",
  "ui_back",
  "ui_buy",
  "ui_deny",
  "medal",
  "stage_clear",
] as const;
export type SfxId = (typeof SFX_IDS)[number];

/** Music tracks. Asset agent MUST implement every one (runtime chiptune synth is acceptable). */
export const MUSIC_IDS = ["menu", "pacific", "jungle", "desert", "arctic", "citadel", "boss", "boss_final", "results"] as const;
export type MusicId = (typeof MUSIC_IDS)[number];

export interface AudioService {
  /** Call on first user gesture (pointerdown/keydown). Safe to call repeatedly. */
  unlock(): void;
  playSfx(id: SfxId, opts?: { volume?: number; pitch?: number; pan?: number }): void;
  /** Crossfades. Passing null stops music. */
  playMusic(id: MusicId | null, opts?: { fadeMs?: number; loop?: boolean }): void;
  setMasterVolume(v: number): void;
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;
  setMuted(m: boolean): void;
  readonly muted: boolean;
}
