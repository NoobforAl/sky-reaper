/**
 * UiRoot: one per UI scene. Handles mouse/touch (pointer events, no ghost clicks), keyboard and gamepad
 * navigation (spatial focus), sliders dragging, modal key capture, tab switching and back.
 */
import type { KAPLAYCtx } from "kaplay";
import { GAME_H, GAME_W, SCENES, WIDE, type MusicId, type Services, type SfxId } from "../contracts";
import { clientToGame, isSkyInput, safeInsets, type SkyInputService } from "../input";
import { drawScanlines, Gfx, refreshBuf, type HintItem, type Widget } from "./widgets";
import { applyTint, backdropChapter, drawMenuBackdrop, menuChapter, setBackdropChapter } from "./backdrop";
import { C, resolveFont, resolveOutlineFont } from "./theme";
import { hintMode, type HintMode } from "./desktop/store";

type Dir = "up" | "down" | "left" | "right";

let activeRoot: UiRoot | null = null;
let installedOn: HTMLCanvasElement | null = null;

function installPointer(canvas: HTMLCanvasElement): void {
  if (installedOn === canvas) return;
  installedOn = canvas;
  canvas.addEventListener("pointerdown", (e) => activeRoot?.pointer("down", e));
  window.addEventListener("pointermove", (e) => activeRoot?.pointer("move", e));
  window.addEventListener("pointerup", (e) => activeRoot?.pointer("up", e));
  window.addEventListener("pointercancel", (e) => activeRoot?.pointer("cancel", e));
  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") activeRoot?.mouseLeave();
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!activeRoot) return;
      e.preventDefault();
      activeRoot.wheel(e);
    },
    { passive: false },
  );
}

function setCursor(canvas: HTMLCanvasElement, c: string): void {
  if (canvas.style.cursor !== c) canvas.style.cursor = c;
}

export class UiRoot {
  widgets: Widget[] = [];
  focusId: string | null = null;
  hoverId: string | null = null;
  pressedId: string | null = null;
  private pointerId: number | null = null;
  /** focus ring visible (keyboard/gamepad in use) */
  showFocus = false;
  back: (() => void) | null = null;
  prevTab: (() => void) | null = null;
  nextTab: (() => void) | null = null;
  /** modal raw key capture (rebinding, initials); return true when handled */
  capture: ((name: string) => boolean) | null = null;
  /** modal pad capture (initials) */
  padCapture: ((p: ReturnType<SkyInputService["menuPad"]>) => void) | null = null;
  /** mouse wheel over the screen (dir +1 = scroll down); sliders/selectors under the cursor are adjusted first */
  onWheel: ((dir: 1 | -1) => void) | null = null;
  /** single-key shortcuts: key name -> widget id to activate (desktop) */
  shortcuts: Record<string, string> = {};
  /** last mouse position (game units) for tooltips; null when the mouse is outside / touch is used */
  mouse: { x: number; y: number } | null = null;
  private hoverSince = 0;
  private wheelAcc = 0;
  private wheelAt = 0;
  /** ignore input for a moment after scene start (prevents carry-over taps) */
  private readyAt: number;
  readonly g: Gfx;

  constructor(
    public svc: Services,
    font: string,
  ) {
    this.g = new Gfx(svc.k, font, resolveOutlineFont(svc, font));
    this.readyAt = performance.now() + 180;
  }

  get k(): KAPLAYCtx {
    return this.svc.k;
  }

  sfx(id: SfxId, volume?: number): void {
    try {
      this.svc.audio.playSfx(id, volume !== undefined ? { volume } : undefined);
    } catch {
      /* ignore */
    }
  }

  set(widgets: Widget[], focus?: string | null): void {
    this.widgets = widgets;
    const ids = new Set(widgets.filter((w) => this.focusable(w)).map((w) => w.id));
    if (focus !== undefined && focus !== null && ids.has(focus)) this.focusId = focus;
    else if (!this.focusId || !ids.has(this.focusId)) this.focusId = widgets.find((w) => this.focusable(w))?.id ?? null;
    if (this.hoverId && !ids.has(this.hoverId)) this.hoverId = null;
  }

  get(id: string): Widget | undefined {
    return this.widgets.find((w) => w.id === id);
  }

  focus(id: string, sound = false): void {
    if (this.focusId === id) return;
    this.focusId = id;
    if (sound) this.sfx("ui_move", 0.6);
  }

  private focusable(w: Widget): boolean {
    return w.focusable !== false && w.w > 0 && w.h > 0;
  }

  private hit(x: number, y: number): Widget | null {
    for (let i = this.widgets.length - 1; i >= 0; i--) {
      const w = this.widgets[i]!;
      if (!this.focusable(w)) continue;
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return w;
    }
    return null;
  }

  activate(w: Widget | undefined): void {
    if (!w || !w.activate) return;
    if (w.disabled) {
      this.sfx("ui_deny");
      return;
    }
    if (w.sfx !== false) this.sfx("ui_select");
    w.activate();
  }

  goBack(): void {
    if (!this.back) return;
    this.sfx("ui_back");
    this.back();
  }

  pointer(phase: "down" | "move" | "up" | "cancel", e: PointerEvent): void {
    const canvas = this.k.canvas as HTMLCanvasElement;
    const p = clientToGame(canvas, e.clientX, e.clientY);
    if (phase === "down") {
      if (performance.now() < this.readyAt) return;
      if (e.button !== undefined && e.button > 0 && e.pointerType === "mouse") {
        if (e.button === 2) this.goBack();
        return;
      }
      if (this.pointerId !== null) return; // multi-touch: first finger wins
      const w = this.hit(p.x, p.y);
      this.showFocus = false;
      if (!w) return;
      this.pointerId = e.pointerId;
      this.pressedId = w.id;
      this.focusId = w.id;
      if (w.drag && !w.disabled) w.drag(p.x, p.y);
      if (e.pointerType === "touch") e.preventDefault();
      return;
    }
    if (phase === "move") {
      if (e.pointerType === "mouse") {
        const inside = p.x >= 0 && p.x <= GAME_W && p.y >= 0 && p.y <= GAME_H;
        this.mouse = inside ? p : null;
        const h = inside ? this.hit(p.x, p.y) : null;
        const id = h?.id ?? null;
        if (id !== this.hoverId) {
          this.hoverId = id;
          this.hoverSince = performance.now();
          if (id && this.pointerId === null) this.showFocus = false;
        }
        if (inside) setCursor(canvas, h && h.activate !== undefined && !h.disabled ? "pointer" : h?.drag ? "ew-resize" : "default");
      } else this.mouse = null;
      if (e.pointerId === this.pointerId && this.pressedId) {
        const w = this.get(this.pressedId);
        if (w?.drag && !w.disabled) w.drag(p.x, p.y);
      }
      return;
    }
    // up / cancel
    if (e.pointerId !== this.pointerId) return;
    const pressed = this.pressedId ? this.get(this.pressedId) : undefined;
    this.pointerId = null;
    this.pressedId = null;
    if (phase === "cancel" || !pressed) return;
    if (pressed.drag) {
      this.sfx("ui_move", 0.5);
      return;
    }
    const w = this.hit(p.x, p.y);
    if (w && w.id === pressed.id) this.activate(w);
  }

  mouseLeave(): void {
    this.mouse = null;
    if (this.pointerId === null) this.hoverId = null;
  }

  wheel(e: WheelEvent): void {
    if (performance.now() < this.readyAt || this.capture) return;
    const now = performance.now();
    if (now - this.wheelAt > 250) this.wheelAcc = 0;
    this.wheelAt = now;
    // normalise: pixel deltas (trackpads) accumulate, line/page deltas step once per event
    this.wheelAcc += e.deltaMode === 0 ? e.deltaY : Math.sign(e.deltaY) * 60;
    if (Math.abs(this.wheelAcc) < 50) return;
    const dir: 1 | -1 = this.wheelAcc > 0 ? 1 : -1;
    this.wheelAcc = 0;
    const h = this.hoverId ? this.get(this.hoverId) : undefined;
    if (h?.adjust && !h.disabled) {
      h.adjust(dir > 0 ? -1 : 1);
      this.sfx("ui_move", 0.5);
      return;
    }
    if (this.onWheel) {
      this.onWheel(dir);
      return;
    }
    // default: step the focus through the list (long lists on desktop)
    this.showFocus = true;
    this.nav(dir > 0 ? "down" : "up", false);
  }

  key(name: string, repeat = false): boolean {
    if (performance.now() < this.readyAt) return true;
    const dirs: Record<string, Dir> = { up: "up", w: "up", down: "down", s: "down", left: "left", a: "left", right: "right", d: "right" };
    const dir = dirs[name];
    if (repeat && (this.capture || !dir)) return true;
    if (this.capture) return this.capture(name) || true;
    if (dir) {
      this.showFocus = true;
      this.nav(dir);
      return true;
    }
    if (name === "enter" || name === "space") {
      this.showFocus = true;
      this.activate(this.focusId ? this.get(this.focusId) : undefined);
      return true;
    }
    if (name === "escape" || name === "backspace") {
      this.goBack();
      return true;
    }
    const sc = this.shortcuts[name];
    if (sc) {
      const w = this.get(sc);
      if (w && !w.disabled) {
        this.focusId = w.id;
        this.activate(w);
        return true;
      }
    }
    if (name === "q" || name === "pageup") {
      if (this.prevTab) {
        this.prevTab();
        return true;
      }
    }
    if (name === "e" || name === "tab" || name === "pagedown") {
      if (this.nextTab) {
        this.nextTab();
        return true;
      }
    }
    return false;
  }

  nav(dir: Dir, wrap = true): void {
    const cur = this.focusId ? this.get(this.focusId) : undefined;
    if (cur && (dir === "left" || dir === "right") && cur.adjust && !cur.disabled) {
      cur.adjust(dir === "left" ? -1 : 1);
      this.sfx("ui_move", 0.6);
      return;
    }
    const list = this.widgets.filter((w) => this.focusable(w));
    if (!list.length) return;
    if (!cur) {
      this.focus(list[0]!.id, true);
      return;
    }
    const cx = cur.x + cur.w / 2;
    const cy = cur.y + cur.h / 2;
    let best: Widget | null = null;
    let bestScore = Infinity;
    for (const w of list) {
      if (w === cur) continue;
      const wx = w.x + w.w / 2;
      const wy = w.y + w.h / 2;
      const dx = wx - cx;
      const dy = wy - cy;
      let primary: number;
      let ortho: number;
      if (dir === "up") [primary, ortho] = [-dy, dx];
      else if (dir === "down") [primary, ortho] = [dy, dx];
      else if (dir === "left") [primary, ortho] = [-dx, dy];
      else [primary, ortho] = [dx, dy];
      if (primary <= 4) continue;
      const score = primary + Math.abs(ortho) * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = w;
      }
    }
    if (!best && wrap && (dir === "up" || dir === "down")) {
      // wrap vertically
      const sorted = [...list].sort((a, b) => a.y - b.y || Math.abs(a.x + a.w / 2 - cx) - Math.abs(b.x + b.w / 2 - cx));
      best = dir === "down" ? sorted[0]! : sorted[sorted.length - 1]!;
      if (best === cur) best = null;
    }
    if (best) this.focus(best.id, true);
  }

  update(): void {
    const inp = this.svc.input;
    if (!isSkyInput(inp)) return;
    const p = inp.menuPad();
    if (performance.now() < this.readyAt) return;
    if (this.padCapture) {
      if (p.up || p.down || p.left || p.right || p.confirm || p.back || p.start) this.padCapture(p);
      return;
    }
    if (p.up || p.down || p.left || p.right || p.confirm) this.showFocus = true;
    if (p.up) this.nav("up");
    if (p.down) this.nav("down");
    if (p.left) this.nav("left");
    if (p.right) this.nav("right");
    if (p.confirm || p.start) this.activate(this.focusId ? this.get(this.focusId) : undefined);
    if (p.back) this.goBack();
    if (p.prevTab) this.prevTab?.();
    if (p.nextTab) this.nextTab?.();
  }

  draw(): void {
    const t = this.k.time();
    for (const w of this.widgets) {
      w.draw(this.g, {
        hover: w.id === this.hoverId && this.pointerId === null,
        focus: w.id === this.focusId && (this.showFocus || w.id === this.pressedId),
        pressed: w.id === this.pressedId,
        t,
      });
    }
  }

  /** hover tooltip (mouse only, after a short delay) */
  drawTooltip(): void {
    if (!this.mouse || !this.hoverId || this.pointerId !== null || this.capture) return;
    if (performance.now() - this.hoverSince < 350) return;
    const w = this.get(this.hoverId);
    const lines = w?.tooltip?.();
    if (lines && lines.length) this.g.tooltip(lines, this.mouse.x, this.mouse.y);
  }
}

// ------------------------------------------------------------------ scene helpers

let currentMusic: MusicId | null = null;

export interface SceneKit {
  root: UiRoot;
  g: Gfx;
  font: string;
  /** safe-area insets in game units */
  insets: { top: number; bottom: number; left: number; right: number };
  /** seconds since scene start */
  age(): number;
  /** control wording to use right now (follows the last input device) */
  mode(): HintMode;
  /** keycap provider for buttons: keyboard label / gamepad label / hidden on touch */
  cap(kb: string, pad?: string): () => string | null;
}

/**
 * Common UI scene setup: font, UiRoot activation, keyboard hook, gamepad polling, music, QA hook,
 * backdrop + scanlines + fade-in drawing around `drawContent`.
 */
export function beginScene(
  svc: Services,
  name: string,
  opts: {
    music?: MusicId | null;
    backdrop?: boolean;
    drawContent?: (kit: SceneKit) => void;
    drawOver?: (kit: SceneKit) => void;
    /** bottom navigation hint line (keyboard / gamepad wording); return null to hide */
    navHint?: (mode: HintMode) => HintItem[] | null;
    /** chapter whose biome the backdrop shows (default: remembered / next unlocked chapter) */
    backdropChapter?: import("../contracts").ChapterId;
  },
): SceneKit {
  const { k } = svc;
  const font = resolveFont(svc);
  const root = new UiRoot(svc, font);
  const canvas = k.canvas as HTMLCanvasElement;
  installPointer(canvas);
  activeRoot = root;
  const start = k.time();
  const kit: SceneKit = {
    root,
    g: root.g,
    font,
    insets: safeInsets(canvas),
    age: () => k.time() - start,
    mode: () => hintMode(svc),
    cap: (kb, pad) => () => {
      const m = hintMode(svc);
      return m === "kb" ? kb : m === "pad" ? (pad ?? null) : null;
    },
  };
  setCursor(canvas, "default");
  refreshBuf(canvas);
  if (opts.backdrop !== false) {
    const want = opts.backdropChapter ?? menuChapter(svc);
    const had = backdropChapter();
    setBackdropChapter(want);
    // the game scene resets the accent tint; restore it for the chapter on show
    if (had === want || had === null) applyTint(want);
  }

  let offKey: (() => void) | null = null;
  if (isSkyInput(svc.input)) offKey = svc.input.onKey((n, e) => (activeRoot === root ? root.key(n, e.repeat) : false));
  svc.input.setTouchControlsVisible(false);

  const sky = (window as unknown as { __sky?: { scene: string } }).__sky;
  if (sky) sky.scene = name;

  if (opts.music !== undefined && opts.music !== currentMusic) {
    currentMusic = opts.music;
    try {
      svc.audio.playMusic(opts.music, { fadeMs: 600 });
    } catch {
      /* ignore */
    }
  }

  let insetT = 0;
  k.onUpdate(() => {
    if (activeRoot === root) root.update();
    insetT += k.dt();
    if (insetT > 0.5) {
      insetT = 0;
      kit.insets = safeInsets(canvas);
    }
  });
  k.onDraw(() => {
    refreshBuf(canvas);
    if (opts.backdrop !== false) drawMenuBackdrop(k, svc);
    opts.drawContent?.(kit);
    root.draw();
    opts.drawOver?.(kit);
    const m = hintMode(svc);
    if (m !== "touch") {
      const hint = opts.navHint !== undefined ? opts.navHint(m) : defaultHint(m, root);
      if (hint && hint.length) {
        // portrait: tiny line under the bottom buttons; wide: keycap bar along the bottom edge
        const size = WIDE ? 10 : 8;
        root.g.hintBar(hint, GAME_W / 2, GAME_H - (WIDE ? 12 : 10) - kit.insets.bottom, { size, opacity: 0.85 });
      }
    }
    root.drawTooltip();
    drawScanlines(k);
    const a = 1 - kit.age() / 0.25;
    if (a > 0) k.drawRect({ pos: k.vec2(0, 0), width: GAME_W, height: GAME_H, color: k.rgb(0, 0, 0), opacity: a });
  });
  k.onSceneLeave((next?: string) => {
    if (activeRoot === root) activeRoot = null;
    offKey?.();
    setCursor(canvas, "default");
    if (next === SCENES.game) {
      currentMusic = null;
      applyTint(null);
    }
  });
  return kit;
}

function defaultHint(m: HintMode, root: UiRoot): HintItem[] {
  const kb = m === "kb";
  const items: HintItem[] = [
    [kb ? ["ARROWS"] : ["D-PAD"], "MOVE"],
    [kb ? ["ENTER"] : ["A"], "SELECT"],
  ];
  if (root.back) items.push([kb ? ["ESC"] : ["B"], "BACK"]);
  if (root.nextTab) items.push([kb ? ["Q", "E"] : ["LB", "RB"], "TABS"]);
  if (kb && WIDE) items.push([["WHEEL"], "SCROLL"]);
  return items;
}

/** the music the UI last started (game scene resets it) */
export function uiMusic(): MusicId | null {
  return currentMusic;
}
