/** End-of-run bookkeeping: score finalisation, objectives, medal, credits, save writes. */
import { CHAPTER_IDS, type ChapterDef, type ChapterId, type ObjectiveDef, type ResultsParams, type RunStats, type SaveService } from "../contracts";

export const RESULTS_TUNING = {
  scorePerLife: 500,
  scorePerObjective: 500,
  bossBonus: 2000,
  /** victory credits: score / this (was 100: score was the largest credit source and fed farming) */
  creditScoreDivisorWin: 200,
  /** share of `chapter.reward` paid when the chapter was already completed before (first clear pays it in full) */
  replayRewardFrac: 0.25,
  /** defeat credits: score / this (coins are always kept) */
  creditScoreDivisorLoss: 250,
  playerName: "PILOT",
} as const;

export function statValue(stats: RunStats, stat: string): number {
  if (stat.startsWith("tag:")) return stats.tagKills[stat.slice(4)] ?? 0;
  const v = (stats as unknown as Record<string, unknown>)[stat];
  if (typeof v === "boolean") return v ? 1 : 0;
  return typeof v === "number" ? v : 0;
}

export function objectiveDone(o: ObjectiveDef, stats: RunStats): boolean {
  const v = statValue(stats, o.stat);
  if (o.cmp === "gte") return v >= o.goal;
  if (o.cmp === "lte") return v <= o.goal;
  return v === o.goal;
}

export function medalFor(score: number, thresholds: readonly number[]): number {
  let m = 0;
  for (let i = 0; i < thresholds.length; i++) if (score >= thresholds[i]!) m = i + 1;
  return m;
}

/**
 * Finalise a run: mutates `stats` (bonuses, time), writes to the save and returns ResultsParams.
 * `stats.killRate` is NOT recomputed here: the World keeps it live from counted kills / counted spawns
 * (boss parts and indestructible props excluded), and `stats.kills` includes boss parts.
 * `quit` = aborted from the pause menu: only coins are kept.
 */
export function finishRun(
  save: SaveService,
  chapter: ChapterDef,
  stats: RunStats,
  victory: boolean,
  livesLeft: number,
  timeSec: number,
): ResultsParams {
  const R = RESULTS_TUNING;
  stats.timeSec = timeSec;
  const id = chapter.id as ChapterId;
  const prev = save.data.chapters?.[id];

  const objectives = chapter.objectives.map((def) => ({ def, done: victory && objectiveDone(def, stats) }));
  if (victory) {
    stats.score += Math.max(0, livesLeft) * R.scorePerLife;
    stats.score += objectives.filter((o) => o.done).length * R.scorePerObjective;
  }
  const medal = victory ? medalFor(stats.score, chapter.medalScores) : 0;

  let credits = stats.coins;
  if (victory) {
    credits += objectives.reduce((a, o) => a + (o.done ? o.def.reward : 0), 0);
    credits += prev?.completed ? Math.floor(chapter.reward * R.replayRewardFrac) : chapter.reward;
    credits += Math.floor(stats.score / R.creditScoreDivisorWin);
  } else {
    credits += Math.floor(stats.score / R.creditScoreDivisorLoss);
  }

  // only victories are recorded as the chapter best (recordChapter), so only they can be a new best
  const newBest = victory && stats.score > (prev?.bestScore ?? 0);
  try {
    if (credits > 0) save.earn(credits);
    if (victory) {
      save.recordChapter(
        id,
        stats,
        medal,
        objectives.filter((o) => o.done).map((o) => o.def.id),
      );
      const next = Math.min(CHAPTER_IDS.length - 1, CHAPTER_IDS.indexOf(id) + 1);
      if (save.data.chaptersUnlocked < next) save.data.chaptersUnlocked = next;
    }
    if (stats.score > 0) save.addHighScore({ name: R.playerName, score: stats.score, chapter: id });
    save.save();
  } catch (err) {
    console.error("[core] save failed", err);
  }
  return { chapterId: id, victory, stats, medal, creditsEarned: credits, objectives, newBest };
}

/** abort: keep coins only */
export function abortRun(save: SaveService, stats: RunStats): void {
  try {
    if (stats.coins > 0) save.earn(stats.coins);
    save.save();
  } catch {
    /* ignore */
  }
}
