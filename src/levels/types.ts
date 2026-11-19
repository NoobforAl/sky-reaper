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

/** A chapter = the contract ChapterDef + background cues owned by the level module. */
export interface ChapterScript {
  def: ChapterDef;
  features: FeatureCue[];
}
