/**
 * Desktop stage manager.
 *  - WIDE (landscape desktop): GAME_W is already stretched to the window aspect (see contracts/consts.ts), so the
 *    stage simply fills the window; KAPLAY letterboxes only if the aspect exceeds MAX_GAME_W / GAME_H.
 *  - Portrait field (GAME_W === DESIGN_W) on a wide window (`?layout=portrait`): the canvas is sized exactly to
 *    its aspect and framed like an arcade cabinet (class `sr-desk` on <html>).
 *  - Phones / narrow windows: full-window letterboxed canvas.
 *
 * Runs at import time (before kaplay() reads the canvas parent size) and on every resize.
 */
import { GAME_H, GAME_W, WIDE } from "../../contracts";

/** minimum window width for the framed portrait stage */
export const DESK_MIN_W = 900;

export interface DeskLayout {
  /** framed portrait stage active (portrait field on a wide window) */
  desk: boolean;
  stageW: number;
  stageH: number;
  /** CSS px per game unit */
  scale: number;
}

let current: DeskLayout = { desk: false, stageW: 0, stageH: 0, scale: 1 };
const listeners = new Set<(l: DeskLayout) => void>();

export function deskLayout(): DeskLayout {
  return current;
}

/** true while the framed portrait stage is active (only with a portrait field on a wide window) */
export function isDesk(): boolean {
  return current.desk;
}

export function onDeskLayout(fn: (l: DeskLayout) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function compute(): DeskLayout {
  const vw = window.innerWidth || GAME_W;
  const vh = window.innerHeight || GAME_H;
  const fit = Math.min(vw / GAME_W, vh / GAME_H) || 1;
  if (WIDE || vw < DESK_MIN_W || vw <= vh) return { desk: false, stageW: vw, stageH: vh, scale: fit };
  const pad = vh <= 820 ? 8 : Math.min(28, Math.round(vh * 0.02));
  const stageH = Math.max(200, Math.floor(vh - pad * 2));
  const stageW = Math.round((stageH * GAME_W) / GAME_H);
  const root = document.documentElement.style;
  root.setProperty("--stage-w", `${stageW}px`);
  root.setProperty("--stage-h", `${stageH}px`);
  root.setProperty("--pad", `${pad}px`);
  return { desk: true, stageW, stageH, scale: stageH / GAME_H };
}

function apply(): void {
  const prev = current;
  current = compute();
  const html = document.documentElement;
  html.classList.toggle("sr-desk", current.desk);
  html.classList.toggle("sr-wide", WIDE);
  if (prev.desk !== current.desk || prev.stageH !== current.stageH || prev.scale !== current.scale) {
    for (const fn of [...listeners]) {
      try {
        fn(current);
      } catch (e) {
        console.error("[ui/desktop] layout listener", e);
      }
    }
  }
}

let installed = false;
export function installDeskLayout(): void {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return;
  installed = true;
  apply();
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      apply();
    });
  };
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
}

// run as early as possible: the module is imported (via src/ui) before main.ts calls kaplay()
installDeskLayout();
