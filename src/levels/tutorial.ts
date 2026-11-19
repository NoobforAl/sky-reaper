/**
 * Tutorial step ids (LevelEvent `tutorial`) -> HUD hint text. Chapter 1 uses them; any chapter may.
 * Unknown step ids are shown verbatim, "clear" hides the hint.
 */

export const HINT_SECONDS = 7;

interface Hint {
  key: string; // keyboard / gamepad wording
  touch: string; // touch wording
}

export const TUTORIAL_HINTS: Record<string, Hint> = {
  move: { key: "MOVE: WASD / ARROWS", touch: "HOLD + DRAG ANYWHERE: FLY AND FIRE" },
  fire_air: { key: "HOLD SPACE / J: GUNS HIT AIRCRAFT", touch: "HOLD ANYWHERE: FLY + FIRE. GUNS HIT AIRCRAFT" },
  bomb_ground: { key: "PRESS K: BOMBS HIT GROUND TARGETS", touch: "TAP BOMB: BOMBS HIT GROUND TARGETS" },
  legend: { key: "ORANGE BRACKETS = BOMBS ONLY   GREEN = GUNS OR BOMBS", touch: "ORANGE BRACKETS = BOMBS ONLY   GREEN = GUNS OR BOMBS" },
  immune: { key: "GREY SPARK = WRONG WEAPON. SWITCH TO BOMBS (K)", touch: "GREY SPARK = WRONG WEAPON. USE BOMBS" },
  flares: { key: "MISSILE LOCK! PRESS SHIFT FOR FLARES", touch: "MISSILE LOCK! TAP FLARE" },
  pickups: { key: "P = POWER   B = BOMBS   S = SHIELD", touch: "P = POWER   B = BOMBS   S = SHIELD" },
  weapons: { key: "Q / E: SWITCH GUNS   R: SWITCH ORDNANCE", touch: "SWAP ICONS CHANGE WEAPONS" },
  shield: { key: "BLUE SHIELD RECHARGES WHEN YOU AVOID HITS", touch: "BLUE SHIELD RECHARGES WHEN YOU AVOID HITS" },
  boss: { key: "DESTROY THE WEAPONS FIRST - THE CORE IS SHIELDED", touch: "DESTROY THE WEAPONS FIRST - THE CORE IS SHIELDED" },
  wind: { key: "CROSSWIND! COUNTER-STEER", touch: "CROSSWIND! COUNTER-STEER" },
};

let touchCache: boolean | null = null;
function isTouch(): boolean {
  if (touchCache !== null) return touchCache;
  try {
    touchCache = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    touchCache = false;
  }
  return touchCache;
}

/** text for a step, or null to clear */
export function hintText(step: string): string | null {
  if (step === "clear" || step === "") return null;
  const h = TUTORIAL_HINTS[step];
  if (!h) return step;
  return isTouch() ? h.touch : h.key;
}
