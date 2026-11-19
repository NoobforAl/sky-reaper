/**
 * Level-module internal types (not part of the shared contract).
 */
import type { ChapterDef } from "../contracts";

/** Background set-pieces placed in world space (roads, rails, rivers banks...). */
export type FeatureKind = "rail" | "road" | "runway" | "bridge";

export interface FeatureCue {
  /** timeline second at which the BOTTOM end of the feature enters the top of the screen */
  t: number;
  kind: FeatureKind;
  /** screen x of the feature centre line */
  x: number;
  /** length in world units (extends upwards from the entry point) */
  len: number;
}

/**
 * Round 6 (#14): an authored wind gust. The runner announces it `RUNNER_TUNING.gustTelegraph` s ahead
 * (world.telegraphWind when the Engine provides it), then pushes for `dur` s with a short ease in / out.
 */
export interface GustCue {
  /** timeline second at which the push starts (the telegraph starts ~1 s earlier) */
  t: number;
  /** -1 pushes the player left, +1 right */
  dir: -1 | 1;
  /** seconds of push (2-4) */
  dur: number;
  /** peak drift as a fraction of the player's max horizontal speed (desert 0.55-0.7, arctic about half) */
  push: number;
}

/** A chapter = the contract ChapterDef + background cues owned by the level module. */
export interface ChapterScript {
  def: ChapterDef;
  features: FeatureCue[];
  /** round 6: authored gusts (desert sandstorm, arctic blizzard); sorted by t */
  gusts?: GustCue[];
}
