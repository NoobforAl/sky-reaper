/** Particle / effect presets shared by the simulation and renderer. */
import type { FxInternalKind } from "./types";

export interface FxDef {
  /** sprite key (strip of `frames`) used when present in the sprite registry */
  sprite: string;
  life: number;
  /** fallback draw diameter at scale 1 (game units) */
  size: number;
  r: number;
  g: number;
  b: number;
  gravity: number;
  /** random initial speed (game units/s) when no velocity was given */
  spread: number;
  /** rides on the scrolling ground */
  scroll: boolean;
  /** constant upward drift (negative = up) */
  vy: number;
}

export const FXDEF: Record<FxInternalKind, FxDef> = {
  explosion_s: { sprite: "fx_explosion_s", life: 0.35, size: 30, r: 255, g: 200, b: 80, gravity: 0, spread: 0, scroll: false, vy: 0 },
  explosion_m: { sprite: "fx_explosion_m", life: 0.5, size: 58, r: 255, g: 170, b: 60, gravity: 0, spread: 0, scroll: false, vy: 0 },
  explosion_l: { sprite: "fx_explosion_l", life: 0.8, size: 104, r: 255, g: 140, b: 50, gravity: 0, spread: 0, scroll: false, vy: 0 },
  smoke: { sprite: "fx_smoke", life: 0.9, size: 16, r: 150, g: 150, b: 150, gravity: 0, spread: 10, scroll: false, vy: -14 },
  fire: { sprite: "fx_fire", life: 0.4, size: 12, r: 255, g: 160, b: 40, gravity: 0, spread: 12, scroll: false, vy: -26 },
  spark: { sprite: "fx_spark", life: 0.3, size: 3, r: 255, g: 230, b: 120, gravity: 0, spread: 170, scroll: false, vy: 0 },
  ring: { sprite: "fx_ring", life: 0.4, size: 40, r: 255, g: 255, b: 255, gravity: 0, spread: 0, scroll: false, vy: 0 },
  flare: { sprite: "fx_flare", life: 0.6, size: 60, r: 255, g: 255, b: 200, gravity: 0, spread: 0, scroll: false, vy: 0 },
  muzzle: { sprite: "fx_muzzle", life: 0.07, size: 12, r: 255, g: 240, b: 160, gravity: 0, spread: 0, scroll: false, vy: 0 },
  hit: { sprite: "fx_hit", life: 0.12, size: 12, r: 255, g: 255, b: 255, gravity: 0, spread: 0, scroll: false, vy: 0 },
  blast_ground: { sprite: "fx_blast_ground", life: 0.55, size: 90, r: 70, g: 45, b: 30, gravity: 0, spread: 0, scroll: true, vy: 0 },
  debris: { sprite: "", life: 0.7, size: 4, r: 90, g: 70, b: 50, gravity: 380, spread: 130, scroll: false, vy: 0 },
  ping: { sprite: "fx_hit", life: 0.2, size: 12, r: 170, g: 180, b: 195, gravity: 0, spread: 0, scroll: false, vy: 0 },
  wreck: { sprite: "", life: 8, size: 24, r: 40, g: 40, b: 40, gravity: 0, spread: 0, scroll: true, vy: 0 },
};
