/**
 * SKY REAPER online leaderboard client. OWNER: DevOps.
 *
 * Talks to the Worker API (worker/index.ts). Every call is best-effort: offline, `npm run dev` without the
 * Worker, timeouts, HTTP errors and rate limits all resolve to `null` / `[]` — never throw, never block gameplay.
 * See docs/ARCHITECTURE-ADDENDUM-NET.md.
 */
import type { ChapterId } from "../contracts/consts";

export type LeaderboardChapter = ChapterId | "all";

export interface ScoreSubmission {
  /** 1-12 chars after server sanitising (A-Z 0-9 space - _ .); server uppercases. */
  name: string;
  score: number;
  /** a chapter id, or "all" for a full-campaign total */
  chapter: LeaderboardChapter;
  timeSec: number;
  kills: number;
  /** 0 none, 1 bronze, 2 silver, 3 gold, 4 ace */
  medal?: number;
}

export interface SubmitResult {
  id: number | null;
  /** 1-based rank within the chapter at insert time */
  rank: number;
  /** name as stored (sanitised) */
  name: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  chapter: LeaderboardChapter;
  timeSec: number;
  kills: number;
  medal: number;
  /** ISO date */
  date: string;
}

const DEFAULT_TIMEOUT_MS = 4000;

/** Disabled at build time with VITE_LEADERBOARD=off, or at runtime with localStorage "sr_online" = "off". */
export function isOnlineEnabled(): boolean {
  try {
    if (import.meta.env?.VITE_LEADERBOARD === "off") return false;
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("sr_online") === "off") return false;
  } catch {
    /* ignore */
  }
  return typeof fetch === "function";
}

/**
 * API origin. Default "" = same origin (the Worker serves the API next to the game). Build with
 * VITE_API_BASE=https://sky-reaper.example.workers.dev to host the game elsewhere; that Worker must then list this
 * site's origin in its ALLOWED_ORIGINS var (it answers the CORS preflight). See docs/DEPLOY.md.
 */
function apiBase(): string {
  try {
    const v = import.meta.env?.VITE_API_BASE;
    if (typeof v === "string" && /^https?:\/\/[^\s/]+$/i.test(v.trim().replace(/\/+$/, ""))) return v.trim().replace(/\/+$/, "");
  } catch {
    /* ignore */
  }
  return "";
}

function apiUrl(path: string): string {
  return `${apiBase()}/api/${path}`;
}

async function requestJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T | null> {
  if (!isOnlineEnabled()) return null;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { ...init, signal: ctrl?.signal, credentials: "same-origin" });
    if (!res.ok) return null;
    const type = res.headers.get("Content-Type") ?? "";
    if (!type.includes("application/json")) return null; // e.g. Vite dev server SPA fallback
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Submit a run. Resolves to the stored rank, or null when offline/rejected/rate-limited. */
export async function submitScore(entry: ScoreSubmission, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<SubmitResult | null> {
  const body = JSON.stringify({
    name: String(entry.name ?? "").slice(0, 32),
    score: Math.max(0, Math.floor(entry.score)),
    chapter: entry.chapter,
    timeSec: Math.max(0, Math.round(entry.timeSec)),
    kills: Math.max(0, Math.floor(entry.kills)),
    medal: Math.max(0, Math.min(4, Math.floor(entry.medal ?? 0))),
  });
  const res = await requestJson<{ ok: boolean; id: number | null; rank: number; name: string }>(
    apiUrl("score"),
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
    timeoutMs,
  );
  return res && res.ok ? { id: res.id, rank: res.rank, name: res.name } : null;
}

/** Top scores for a chapter (omit for every chapter mixed). Resolves to [] when offline. */
export async function fetchLeaderboard(
  chapter?: LeaderboardChapter,
  limit = 10,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<LeaderboardEntry[]> {
  const q = new URLSearchParams();
  if (chapter) q.set("chapter", chapter);
  q.set("limit", String(Math.max(1, Math.min(50, Math.floor(limit)))));
  const res = await requestJson<{ entries?: LeaderboardEntry[] }>(apiUrl(`leaderboard?${q}`), { method: "GET" }, timeoutMs);
  return Array.isArray(res?.entries) ? res.entries : [];
}

/** Quick reachability probe (true only when the Worker and its database answer). */
export async function isLeaderboardOnline(timeoutMs = 2500): Promise<boolean> {
  const res = await requestJson<{ ok: boolean; db: string }>(apiUrl("health"), { method: "GET" }, timeoutMs);
  return !!res && res.ok && res.db === "ok";
}
