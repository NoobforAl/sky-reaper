/**
 * InputService (UI/UX agent): keyboard (rebindable, persisted) + Gamepad API + touch.
 *
 *  Keyboard  : DOM listeners (persist across KAPLAY scenes); names via ./keys (physical letters).
 *  Gamepad   : standard mapping. Stick / D-pad move, A or RT fire, B/X bomb, Y/RB flare,
 *              LB next air weapon, LT next ordnance, Back/Select next ordnance, Start pause. Radial deadzone.
 *  Touch     : see ./touch. Hold anywhere = steer (relative drag or floating joystick) AND fire, even with the
 *              finger held still; lift = stop firing (the AUTO-FIRE setting keeps firing with no finger down).
 *              Icon buttons: bomb, flare, air-weapon swap, ordnance swap, pause.
 *              Pointer events only (no ghost mouse events); ignored while `touchControls` is "off".
 *  Edges     : bombPressed, specialPressed, weaponPrev/Next, groundNext, pausePressed are latched until the next poll()
 *              (stale latches older than 400 ms are dropped so a menu key press never leaks into gameplay).
 */
import type { KAPLAYCtx } from "kaplay";
import { DEFAULT_BINDINGS, type Action, type Bindings, type InputService, type InputState, type SaveService } from "../contracts";
import { clientToGame, safeInsets } from "./coords";
import { keyName, PREVENT_DEFAULT } from "./keys";
import { TouchControls, type TouchDrawExtra, type TouchMoveMode } from "./touch";

export { keyLabel, keyName } from "./keys";
export { clientToGame, gameRect, safeInsets } from "./coords";
export type { TouchDrawExtra, TouchMoveMode } from "./touch";

export type InputDevice = "keyboard" | "mouse" | "touch" | "gamepad";

export interface MenuPad {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
  /** Start button */
  start: boolean;
  /** shoulder buttons (tab switching) */
  prevTab: boolean;
  nextTab: boolean;
}

/** Extended service used by src/ui (same object as svc.input). */
export interface SkyInputService extends InputService {
  readonly lastDevice: InputDevice;
  /** a physical keyboard or mouse has been used this session (desktop wording / hints) */
  readonly keyboardUsed: boolean;
  /** true on phones / tablets (coarse primary pointer with touch points) */
  readonly touchPrimary: boolean;
  readonly touchVisible: boolean;
  touchMoveMode: TouchMoveMode;
  /** raw key-down hook (non-repeat and repeat); return true to swallow (prevents gameplay latch) */
  onKey(fn: (name: string, e: KeyboardEvent) => boolean | void): () => void;
  /** gamepad menu navigation edges (with auto-repeat on held directions) — call once per frame */
  menuPad(): MenuPad;
  /** draw on-screen controls (HUD calls this last) */
  drawTouchControls(k: KAPLAYCtx, font: string, extra?: TouchDrawExtra): void;
  isKeyDown(name: string): boolean;
}

export function isSkyInput(i: InputService): i is SkyInputService {
  return typeof (i as Partial<SkyInputService>).menuPad === "function";
}

const UI_PREFS_KEY = "sky-reaper-ui";
const LATCH_MS = 400;
const STICK_DEADZONE = 0.22;
const EDGE_ACTIONS = ["bomb", "special", "weaponPrev", "weaponNext", "groundNext", "pause"] as const;
type EdgeAction = (typeof EDGE_ACTIONS)[number];

function readUiPrefs(): { touchMoveMode?: TouchMoveMode } {
  try {
    return JSON.parse(localStorage.getItem(UI_PREFS_KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}
function writeUiPrefs(p: { touchMoveMode?: TouchMoveMode }): void {
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ ...readUiPrefs(), ...p }));
  } catch {
    /* ignore */
  }
}

function getPad(): Gamepad | null {
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let best: Gamepad | null = null;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (!best || (p.mapping === "standard" && best.mapping !== "standard")) best = p;
    }
    return best;
  } catch {
    return null;
  }
}

const btn = (p: Gamepad, i: number): boolean => {
  const b = p.buttons[i];
  return !!b && (b.pressed || b.value > 0.5);
};

function stick(p: Gamepad): { x: number; y: number } {
  let x = p.axes[0] ?? 0;
  let y = p.axes[1] ?? 0;
  const m = Math.hypot(x, y);
  if (m < STICK_DEADZONE) return { x: 0, y: 0 };
  const s = Math.min(1, (m - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / m;
  x *= s;
  y *= s;
  return { x, y };
}

export function createInputService(k: KAPLAYCtx, save: SaveService): InputService {
  const down = new Set<string>();
  const latched: Record<EdgeAction, number> = { bomb: -1, special: -1, weaponPrev: -1, weaponNext: -1, groundNext: -1, pause: -1 };
  const keyHooks = new Set<(name: string, e: KeyboardEvent) => boolean | void>();
  let lastDevice: InputDevice = "keyboard";
  let keyboardUsed = false;
  let touchSeen = false;
  let autoFireOverride: boolean | null = null;
  let gameWantsTouch = false;

  const bindings = (): Bindings => save.data.settings.bindings ?? DEFAULT_BINDINGS;
  const actionDown = (a: Action): boolean => {
    const keys = bindings()[a] ?? DEFAULT_BINDINGS[a];
    for (const key of keys) if (down.has(key)) return true;
    return false;
  };

  // ---------------------------------------------------------------- keyboard
  const onKeyDown = (e: KeyboardEvent) => {
    const name = keyName(e);
    lastDevice = "keyboard";
    keyboardUsed = true;
    let swallowed = false;
    for (const fn of [...keyHooks]) {
      try {
        if (fn(name, e)) swallowed = true;
      } catch (err) {
        console.error("[input] key hook", err);
      }
    }
    if (PREVENT_DEFAULT.has(name) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
    if (swallowed) return;
    if (e.repeat) return;
    down.add(name);
    const now = performance.now();
    for (const a of EDGE_ACTIONS) if ((bindings()[a] ?? []).includes(name)) latched[a] = now;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    down.delete(keyName(e));
    // releasing Shift can change e.key of other keys; physical letters are unaffected (code based)
  };
  const onBlur = () => {
    down.clear();
    touch.reset();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onBlur();
  });

  // ---------------------------------------------------------------- touch
  const playerPos = (): { x: number; y: number } | null => {
    const w = (window as unknown as { __sky?: { game?: { world?: { player?: { x: number; y: number; alive?: boolean } } } } }).__sky?.game?.world;
    const p = w?.player;
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  };
  const touch = new TouchControls(playerPos);
  const prefMode = readUiPrefs().touchMoveMode;
  if (prefMode === "drag" || prefMode === "stick") touch.mode = prefMode;

  const touchCapable = (() => {
    try {
      return (navigator.maxTouchPoints ?? 0) > 0 && window.matchMedia("(pointer: coarse)").matches;
    } catch {
      return false;
    }
  })();
  touchSeen = touchCapable;

  const touchEnabled = (): boolean => {
    const m = save.data.settings.touchControls;
    if (m === "off") return false;
    if (m === "on") return true;
    // auto: always on phones/tablets; on desktops (touchscreen laptops) only while touch is the device in use
    if (touchCapable) return true;
    return touchSeen && lastDevice === "touch";
  };
  const touchVisible = (): boolean => gameWantsTouch && touchEnabled();

  const canvas = k.canvas as HTMLCanvasElement;
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      touchSeen = true;
      lastDevice = "touch";
    } else {
      lastDevice = "mouse";
      keyboardUsed = true;
    }
    if (e.pointerType !== "touch" || !touchVisible()) return;
    e.preventDefault(); // suppress compatibility mouse events
    const p = clientToGame(canvas, e.clientX, e.clientY);
    touch.down(e.pointerId, p.x, p.y);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || !touchVisible()) return;
    const p = clientToGame(canvas, e.clientX, e.clientY);
    touch.move(e.pointerId, p.x, p.y);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touch.up(e.pointerId);
  };
  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  // iOS: block pinch / double-tap zoom and rubber-band scrolling over the game
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.target === canvas) e.preventDefault();
    },
    { passive: false },
  );
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = performance.now();
      if (now - lastTouchEnd < 320 && e.target === canvas) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );

  // ---------------------------------------------------------------- gamepad
  let padName: string | null = null;
  const padPrev: boolean[] = [];
  window.addEventListener("gamepadconnected", (e) => {
    padName = (e as GamepadEvent).gamepad.id;
    lastDevice = "gamepad";
  });
  window.addEventListener("gamepaddisconnected", () => {
    padName = getPad()?.id ?? null;
  });

  let insetsAt = -1e9;
  const menuPrev: Record<string, boolean> = {};
  const menuRepeat: Record<string, number> = {};
  /**
   * Snapshot the buttons that are held right now into BOTH edge memories (gameplay `padPrev`, menu `menuPrev`),
   * so a button still held across a scene change (START that confirmed a menu, A/B that picked an entry) is not
   * seen as a fresh press by the next scene (CODE_REVIEW #6).
   */
  const syncPadEdges = (): void => {
    const pad = getPad();
    padPrev.length = 0;
    if (!pad) return;
    padPrev.push(...pad.buttons.map((_, i) => btn(pad, i)));
    const s = stick(pad);
    menuPrev.up = btn(pad, 12) || s.y < -0.5;
    menuPrev.down = btn(pad, 13) || s.y > 0.5;
    menuPrev.left = btn(pad, 14) || s.x < -0.5;
    menuPrev.right = btn(pad, 15) || s.x > 0.5;
    menuPrev.confirm = btn(pad, 0);
    menuPrev.back = btn(pad, 1);
    menuPrev.start = btn(pad, 9);
    menuPrev.prevTab = btn(pad, 4);
    menuPrev.nextTab = btn(pad, 5);
    // a held direction keeps auto-repeating only after the normal initial delay
    const now = performance.now();
    for (const key of ["up", "down", "left", "right"]) if (menuPrev[key]) menuRepeat[key] = now + 380;
  };

  // ---------------------------------------------------------------- service
  const svc: SkyInputService = {
    poll(): InputState {
      const now = performance.now();
      const take = (a: EdgeAction): boolean => {
        const t = latched[a];
        latched[a] = -1;
        return t >= 0 && now - t <= LATCH_MS;
      };

      let mx = (actionDown("right") ? 1 : 0) - (actionDown("left") ? 1 : 0);
      let my = (actionDown("down") ? 1 : 0) - (actionDown("up") ? 1 : 0);
      if (mx && my) {
        mx *= Math.SQRT1_2;
        my *= Math.SQRT1_2;
      }
      let fire = actionDown("fire");
      let bomb = actionDown("bomb");
      let special = actionDown("special");
      let bombPressed = take("bomb");
      let specialPressed = take("special");
      let weaponPrev = take("weaponPrev");
      let weaponNext = take("weaponNext");
      let groundNext = take("groundNext");
      let pausePressed = take("pause");

      // gamepad
      const pad = getPad();
      if (pad) {
        padName = pad.id;
        const cur = pad.buttons.map((_, i) => btn(pad, i));
        const edge = (i: number) => !!cur[i] && !padPrev[i];
        const s = stick(pad);
        let gx = s.x;
        let gy = s.y;
        if (cur[14]) gx = -1;
        if (cur[15]) gx = 1;
        if (cur[12]) gy = -1;
        if (cur[13]) gy = 1;
        if (gx || gy || cur.some(Boolean)) lastDevice = "gamepad";
        if (gx || gy) {
          const m = Math.hypot(gx, gy);
          if (m > 1) {
            gx /= m;
            gy /= m;
          }
          if (Math.abs(gx) > Math.abs(mx)) mx = gx;
          if (Math.abs(gy) > Math.abs(my)) my = gy;
        }
        fire ||= !!cur[0] || !!cur[7];
        bomb ||= !!cur[1] || !!cur[2];
        special ||= !!cur[3] || !!cur[5];
        bombPressed ||= edge(1) || edge(2);
        specialPressed ||= edge(3) || edge(5);
        weaponNext ||= edge(4);
        groundNext ||= edge(6) || edge(8);
        pausePressed ||= edge(9);
        padPrev.length = 0;
        padPrev.push(...cur);
      }

      // touch
      let dragTarget: { x: number; y: number } | null = null;
      if (touchVisible()) {
        if (touch.mode === "stick") {
          const s = touch.stick();
          if (s.x || s.y) {
            mx = s.x;
            my = s.y;
          }
        } else if (touch.target) dragTarget = { x: touch.target.x, y: touch.target.y };
        fire ||= touch.firing; // hold-to-fire: any steering finger down (moving or still)
        // BOMB icon is tap-only: one tap = exactly one bomb. It never reports a held `bomb` (the player fires
        // ordnance continuously while `bomb` is held, so a ~200 ms finger press used to drop 2-3 bombs).
        special ||= touch.held("special");
        bombPressed ||= touch.takePress("bomb");
        specialPressed ||= touch.takePress("special");
        weaponNext ||= touch.takePress("weaponNext");
        groundNext ||= touch.takePress("groundNext");
        pausePressed ||= touch.takePress("pause");
      }

      const auto = autoFireOverride ?? save.data.settings.autoFire;
      if (auto) fire = true;

      return { moveX: mx, moveY: my, fire, bomb, special, bombPressed, specialPressed, weaponPrev, weaponNext, groundNext, pausePressed, dragTarget };
    },
    get touchActive() {
      return touchSeen && save.data.settings.touchControls !== "off";
    },
    get touchVisible() {
      return touchVisible();
    },
    setTouchControlsVisible(v: boolean) {
      gameWantsTouch = v;
      touch.reset();
      // drop stale latches when entering / leaving gameplay
      for (const a of EDGE_ACTIONS) latched[a] = -1;
      // gamepad: buttons held across the scene change are not new presses (START that confirmed the menu
      // must not pause the first game frame; B/X from a menu must not drop a bomb)
      syncPadEdges();
      insetsAt = -1e9;
    },
    setAutoFire(v: boolean) {
      autoFireOverride = v;
    },
    get bindings() {
      return bindings();
    },
    rebind(action: Action, keys: string[]) {
      const clean = [...new Set(keys.filter((x) => typeof x === "string" && x))].slice(0, 4);
      if (!clean.length) return;
      // a key may only drive one action: remove it from others (keeps at least one key per action)
      const b = save.data.settings.bindings;
      for (const a of Object.keys(b) as Action[]) {
        if (a === action) continue;
        const rest = b[a].filter((x) => !clean.includes(x));
        b[a] = rest.length ? rest : b[a];
      }
      b[action] = clean;
      save.notifySettingsChanged();
    },
    resetBindings() {
      const fresh = {} as Bindings;
      for (const a of Object.keys(DEFAULT_BINDINGS) as Action[]) fresh[a] = [...DEFAULT_BINDINGS[a]];
      save.data.settings.bindings = fresh;
      save.notifySettingsChanged();
    },
    get gamepad() {
      return getPad()?.id ?? padName;
    },
    get lastDevice() {
      return lastDevice;
    },
    get keyboardUsed() {
      return keyboardUsed;
    },
    get touchPrimary() {
      return touchCapable;
    },
    get touchMoveMode() {
      return touch.mode;
    },
    set touchMoveMode(m: TouchMoveMode) {
      touch.mode = m;
      touch.reset();
      writeUiPrefs({ touchMoveMode: m });
    },
    onKey(fn) {
      keyHooks.add(fn);
      return () => {
        keyHooks.delete(fn);
      };
    },
    menuPad(): MenuPad {
      const res: MenuPad = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, prevTab: false, nextTab: false };
      const pad = getPad();
      if (!pad) return res;
      const s = stick(pad);
      const cur: Record<string, boolean> = {
        up: btn(pad, 12) || s.y < -0.5,
        down: btn(pad, 13) || s.y > 0.5,
        left: btn(pad, 14) || s.x < -0.5,
        right: btn(pad, 15) || s.x > 0.5,
        confirm: btn(pad, 0),
        back: btn(pad, 1),
        start: btn(pad, 9),
        prevTab: btn(pad, 4),
        nextTab: btn(pad, 5),
      };
      const now = performance.now();
      for (const key of Object.keys(cur) as Array<keyof MenuPad>) {
        const on = cur[key]!;
        if (on && !menuPrev[key]) {
          res[key] = true;
          menuRepeat[key] = now + 380;
          lastDevice = "gamepad";
        } else if (on && (key === "up" || key === "down" || key === "left" || key === "right") && now >= (menuRepeat[key] ?? Infinity)) {
          res[key] = true;
          menuRepeat[key] = now + 110;
        }
        menuPrev[key] = on;
      }
      return res;
    },
    drawTouchControls(kk: KAPLAYCtx, font: string, extra?: TouchDrawExtra) {
      if (!touchVisible()) return;
      // safe-area insets need getComputedStyle + layout reads: refresh at most every 0.5 s (CODE_REVIEW #16)
      const now = performance.now();
      if (now - insetsAt > 500) {
        insetsAt = now;
        touch.layout(safeInsets(canvas));
      }
      touch.draw(kk, font, extra);
    },
    isKeyDown(name: string) {
      return down.has(name);
    },
  };

  save.onSettingsChanged(() => {
    autoFireOverride = null;
  });

  return svc;
}
