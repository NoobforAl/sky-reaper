/**
 * Aircraft skins (paint schemes) for the hangar + previews. Uses `SKINS` from ../weapons when the gameplay module
 * exports it, otherwise a local catalog matching SKIN_IDS. Sprite `player_<aircraft>_<skin>` is used when present,
 * else `player_<aircraft>` drawn with a tint (vector jet as the last fallback).
 */
import { SKIN_IDS, type AircraftId, type ChapterId, type SaveData, type SkinDef, type SkinId } from "../contracts";
import { SKINS } from "../weapons";
import { C, type RGB } from "./theme";
import { jet, type Gfx } from "./widgets";

const FALLBACK_SKINS: SkinDef[] = [
  { id: "standard", name: "STANDARD", desc: "Factory grey-green. Always owned.", cost: 0 },
  { id: "arctic", name: "ARCTIC", desc: "White and ice-blue winter camouflage.", cost: 300 },
  { id: "desert", name: "DESERT", desc: "Sand and tan two-tone desert scheme.", cost: 450 },
  { id: "nightfall", name: "NIGHTFALL", desc: "Matte black night-ops finish with dim markings.", cost: 700 },
  { id: "crimson", name: "CRIMSON", desc: "Ace red with white trim. Hard to miss.", cost: 1000 },
  { id: "tiger", name: "TIGER", desc: "Orange tiger stripes. Clear the Desert to unlock.", cost: 1500, unlockChapter: "desert" },
  { id: "gold", name: "GOLD", desc: "Polished gold leaf. Clear the Citadel to unlock.", cost: 2500, unlockChapter: "citadel" },
];

/** tint used when no dedicated skin sprite exists (multiplies the standard sprite) */
export const SKIN_TINT: Record<SkinId, RGB> = {
  standard: [255, 255, 255],
  arctic: [215, 240, 255],
  desert: [255, 215, 150],
  nightfall: [120, 125, 160],
  crimson: [255, 120, 110],
  tiger: [255, 170, 80],
  gold: [255, 220, 90],
};

/** swatch colour for lists */
export const SKIN_SWATCH: Record<SkinId, RGB> = {
  standard: C.steelHi,
  arctic: [220, 240, 255],
  desert: [214, 170, 100],
  nightfall: [44, 48, 70],
  crimson: [210, 50, 46],
  tiger: [240, 140, 40],
  gold: [255, 206, 64],
};

export function skinCatalog(): SkinDef[] {
  const ext: unknown = SKINS;
  if (Array.isArray(ext) && ext.length) {
    const valid = (ext as SkinDef[]).filter((s) => s && SKIN_IDS.includes(s.id));
    if (valid.length) {
      // keep SKIN_IDS order, fill gaps from the fallback catalog
      return SKIN_IDS.map((id) => valid.find((s) => s.id === id) ?? FALLBACK_SKINS.find((s) => s.id === id)!);
    }
  }
  return FALLBACK_SKINS;
}

export function ownsSkin(save: SaveData, id: SkinId): boolean {
  return id === "standard" || (save.unlockedSkins ?? []).includes(id);
}

export function equippedSkin(save: SaveData, aircraft: AircraftId): SkinId {
  const s = save.selectedSkin?.[aircraft];
  return s && ownsSkin(save, s) ? s : "standard";
}

/** chapter that must be completed first (or null when available) */
export function skinLockedBy(save: SaveData, def: SkinDef): ChapterId | null {
  if (!def.unlockChapter) return null;
  return save.chapters[def.unlockChapter]?.completed ? null : def.unlockChapter;
}

/** draw an aircraft wearing a skin, centred at (x, y) */
export function drawSkinnedAircraft(g: Gfx, sprites: { has(k: string): boolean }, aircraft: string, skin: SkinId, x: number, y: number, scale: number, opacity = 1): void {
  const k = g.k;
  const own = `player_${aircraft}_${skin}`;
  if (skin !== "standard" && sprites.has(own)) {
    k.drawSprite({ sprite: own, frame: 0, pos: k.vec2(x, y), anchor: "center", scale, opacity });
    return;
  }
  const base = `player_${aircraft}`;
  const tint = SKIN_TINT[skin] ?? SKIN_TINT.standard;
  if (sprites.has(base)) {
    k.drawSprite({ sprite: base, frame: 0, pos: k.vec2(x, y), anchor: "center", scale, opacity, color: k.rgb(tint[0], tint[1], tint[2]) });
    return;
  }
  jet(g, x, y, 12 * scale, skin === "standard" ? C.steelHi : SKIN_SWATCH[skin], aircraft, opacity);
}
