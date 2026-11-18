// STUB (Orchestrator) - Enemy agent replaces with the data-driven pattern framework.
import type { PatternDef, PatternRunner } from "../contracts";

export const PATTERNS: Record<string, PatternDef> = {};

export const patternRunner: PatternRunner = {
  start() {
    return { done: true, update() {}, cancel() {} };
  },
};
