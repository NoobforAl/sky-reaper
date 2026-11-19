/** Settings: audio, gameplay, devices (touch / gamepad), key rebinding, reset save. All changes apply live. */
import { GAME_H, GAME_W, SCENES, type Action, type Services } from "../contracts";
import { isSkyInput, keyLabel } from "../input";
import { applyReducedMotion } from "./backdrop";
import { beginScene } from "./core";
import { reducedMotion, writePrefs } from "./prefs";
import { BOTTOM_H, BOTTOM_Y, cols, M, WIDE } from "./layout";
import { C, esc } from "./theme";
import { button, selector, slider, toggle, type Widget } from "./widgets";

type Tab = "audio" | "game" | "devices" | "keys";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "audio", label: "AUDIO" },
  { id: "game", label: "GAME" },
  { id: "devices", label: "DEVICES" },
  { id: "keys", label: "KEYS" },
];

const ACTION_LABELS: Array<[Action, string]> = [
  ["up", "MOVE UP"],
  ["down", "MOVE DOWN"],
  ["left", "MOVE LEFT"],
  ["right", "MOVE RIGHT"],
  ["fire", "FIRE (AIR)"],
  ["bomb", "BOMB (GROUND)"],
  ["special", "FLARE"],
  ["weaponPrev", "PREV WEAPON"],
  ["weaponNext", "NEXT WEAPON"],
  ["groundNext", "NEXT ORDNANCE"],
  ["pause", "PAUSE"],
];

let lastTab: Tab = "audio";

/** push current settings into the audio service (in case it does not subscribe itself) */
export function applyAudio(svc: Services): void {
  const s = svc.save.data.settings;
  try {
    svc.audio.setMasterVolume(s.masterVolume);
    svc.audio.setMusicVolume(s.musicVolume);
    svc.audio.setSfxVolume(s.sfxVolume);
    svc.audio.setMuted(s.muted);
  } catch {
    /* ignore */
  }
}

export function registerSettings(svc: Services): void {
  const { k } = svc;
  k.scene(SCENES.settings, () => {
    const save = svc.save;
    const st = () => save.data.settings;
    // wide: options (tabs) left, the full key-binding table always visible right
    const tabs = WIDE ? TABS.filter((t) => t.id !== "keys") : TABS;
    let tab: Tab = tabs.some((t) => t.id === lastTab) ? lastTab : tabs[0]!.id;
    let rebinding: Action | null = null;
    let confirmReset = false;
    let sfxCooldown = 0;
    let gamepadY = 420;
    const [cl, cr] = WIDE ? cols([1, 1], 56) : [{ x: 20, w: GAME_W - 40 }, { x: 20, w: GAME_W - 40 }];
    const LX = cl!.x;
    const LW = cl!.w;
    const RX = cr!.x + 12;
    const RW = cr!.w - 24;
    const KEY_Y0 = WIDE ? 150 : 160;

    const changed = (audio = false) => {
      save.notifySettingsChanged();
      if (audio) applyAudio(svc);
    };

    const kit = beginScene(svc, SCENES.settings, {
      music: "menu",
      drawContent: (kk) => {
        const { g } = kk;
        sfxCooldown = Math.max(0, sfxCooldown - k.dt());
        if (WIDE) {
          g.text("SETTINGS", M, 18 + kk.insets.top + 30, { size: 32, color: C.amber, anchor: "left", outline: 2 });
          g.text("Changes apply instantly and are saved.", M + 250, 18 + kk.insets.top + 32, { size: 11, color: C.text, anchor: "left", outline: 1 });
        } else g.text("SETTINGS", 24, 18 + kk.insets.top + 22, { size: 28, color: C.amber, anchor: "left", outline: 2 });
        if (tab === "devices") {
          const inp = svc.input;
          const pad = inp.gamepad;
          const py = WIDE ? gamepadY : 420;
          g.panel(LX, py, LW, 150, { title: "GAMEPAD", accent: C.cyan });
          g.text(pad ? esc(pad.slice(0, 44)) : "No gamepad detected - press any button", LX + 16, py + 26, { size: 11, color: pad ? C.green : C.grey, width: LW - 32 });
          const lines = ["STICK / D-PAD  move", "A / RT  fire      B / X  bomb", "Y / RB  flare     LB  next weapon", "LT / SELECT  next ordnance   START  pause"];
          lines.forEach((l, i) => g.text(l, LX + 16, py + 54 + i * 20, { size: 11, color: C.text }));
          g.text(`TOUCH DETECTED: ${inp.touchActive ? "YES" : "NO"}`, LX + 16, py + 170, { size: 11, color: C.text, outline: 1 });
        }
        if (WIDE) {
          g.panel(RX - 12, 104, RW + 24, BOTTOM_Y - 22 - 104, { title: "KEY BINDINGS", accent: C.amber });
          g.text("Click an action, then press a new key (Esc cancels). Amber = primary.", RX + RW / 2, KEY_Y0 - 16, {
            size: 10,
            color: C.text,
            anchor: "center",
            align: "center",
            width: RW,
            maxLines: 1,
          });
        } else if (tab === "keys") {
          g.text("Select an action, then press a key. Esc cancels.", GAME_W / 2, 146, { size: 10, color: C.text, anchor: "center", align: "center", width: GAME_W - 40, maxLines: 2 });
        }
      },
      drawOver: (kk) => {
        const { g } = kk;
        const mw = Math.min(GAME_W - 100, 420);
        const mx = (GAME_W - mw) / 2;
        if (rebinding) {
          g.rect(0, 0, GAME_W, GAME_H, C.dark, 0.7);
          g.panel(mx, 330, mw, 150, { title: "REBIND", accent: C.amber });
          const lbl = ACTION_LABELS.find((a) => a[0] === rebinding)?.[1] ?? rebinding;
          g.text(lbl, GAME_W / 2, 380, { size: 20, color: C.white, anchor: "center" });
          const blink = Math.sin(k.time() * 8) > 0;
          g.text("PRESS A KEY", GAME_W / 2, 418, { size: 16, color: blink ? C.amber : C.amberDim, anchor: "center" });
          g.text("ESC TO CANCEL", GAME_W / 2, 452, { size: 11, color: C.grey, anchor: "center" });
        }
        if (confirmReset) {
          g.rect(0, 0, GAME_W, GAME_H, C.dark, 0.7);
          g.panel(mx - 10, 300, mw + 20, 220, { title: "WARNING", accent: C.red });
          g.text("ERASE ALL PROGRESS?", GAME_W / 2, 350, { size: 20, color: C.red, anchor: "center" });
          g.text("Credits, upgrades, unlocks, records\nand settings will be lost.", GAME_W / 2, 392, {
            size: 12,
            color: C.text,
            anchor: "center",
            align: "center",
            width: mw - 40,
          });
        }
      },
    });
    const { root } = kit;
    root.back = () => {
      if (rebinding) return;
      if (confirmReset) {
        confirmReset = false;
        build("reset");
        return;
      }
      k.go(SCENES.menu);
    };

    const setTab = (t: Tab) => {
      if (t === tab || rebinding || confirmReset) return;
      tab = lastTab = t;
      root.sfx("ui_move", 0.7);
      build("tab_" + t);
    };
    const cycle = (d: number) => {
      const i = tabs.findIndex((q) => q.id === tab);
      setTab(tabs[(i + d + tabs.length) % tabs.length]!.id);
    };
    root.prevTab = () => cycle(-1);
    root.nextTab = () => cycle(1);

    const startRebind = (a: Action) => {
      rebinding = a;
      const cancel = () => {
        rebinding = null;
        root.capture = null;
        root.sfx("ui_back");
        build("key_" + a);
      };
      root.set([button({ id: "cancel", x: GAME_W / 2 - 100, y: 496, w: 200, h: 50, label: "CANCEL", accent: C.cyan, sfx: false, onClick: cancel })], "cancel");
      root.capture = (name) => {
        if (name === "escape") {
          root.sfx("ui_back");
        } else {
          const cur = st().bindings[a] ?? [];
          const keys = [name, ...cur.filter((x) => x !== name)].slice(0, 2);
          svc.input.rebind(a, keys);
          if (!isSkyInput(svc.input)) {
            st().bindings[a] = keys;
            changed();
          }
          root.sfx("ui_select");
        }
        rebinding = null;
        root.capture = null;
        build("key_" + a);
        return true;
      };
    };

    const sliderSfx = () => {
      if (sfxCooldown <= 0) {
        root.sfx("ui_move", 0.8);
        sfxCooldown = 0.08;
      }
    };

    const build = (focus?: string) => {
      const ws: Widget[] = [];
      if (confirmReset) {
        ws.push(
          button({
            id: "no",
            x: GAME_W / 2 - 180,
            y: 440,
            w: 170,
            h: 54,
            label: "CANCEL",
            accent: C.cyan,
            sfx: false,
            onClick: () => root.goBack(),
          }),
          button({
            id: "yes",
            x: GAME_W / 2 + 10,
            y: 440,
            w: 170,
            h: 54,
            label: "ERASE",
            accent: C.red,
            onClick: () => {
              save.reset();
              if (isSkyInput(svc.input)) svc.input.resetBindings();
              applyAudio(svc);
              confirmReset = false;
              build("reset");
            },
          }),
        );
        root.set(ws, "no");
        return;
      }
      const n = tabs.length;
      const tw = (LW - 8 * (n - 1)) / n;
      const ti = tabs.findIndex((q) => q.id === tab);
      tabs.forEach((t, i) =>
        ws.push(
          button({
            id: "tab_" + t.id,
            x: LX + i * (tw + 8),
            y: WIDE ? 104 : 86,
            w: tw,
            h: 46,
            label: t.label,
            size: WIDE ? 15 : 13,
            sfx: false,
            accent: C.cyan,
            onClick: () => setTab(t.id),
            deco: (g, _s, w) => {
              if (tab === t.id) g.rect(w.x + 6, w.y + w.h - 5, w.w - 12, 3, C.amber);
            },
            cap: i === (ti + n - 1) % n ? kit.cap("Q", "LB") : i === (ti + 1) % n ? kit.cap("E", "RB") : undefined,
          }),
        ),
      );
      const X = LX;
      const W = LW;
      let y = WIDE ? 170 : 150;
      const next = (h: number) => {
        const r = y;
        y += h + 10;
        return r;
      };
      if (tab === "audio") {
        const vol = (id: string, label: string, key: "masterVolume" | "musicVolume" | "sfxVolume") =>
          ws.push(
            slider({
              id,
              x: X,
              y: next(56),
              w: W,
              label,
              get: () => st()[key],
              set: (v) => {
                st()[key] = v;
                changed(true);
                sliderSfx();
              },
            }),
          );
        vol("master", "MASTER VOLUME", "masterVolume");
        vol("music", "MUSIC", "musicVolume");
        vol("sfx", "SOUND EFFECTS", "sfxVolume");
        ws.push(
          toggle({
            id: "mute",
            x: X,
            y: next(50),
            w: W,
            label: "MUTE ALL",
            get: () => st().muted,
            set: (v) => {
              st().muted = v;
              changed(true);
            },
          }),
        );
      } else if (tab === "game") {
        ws.push(
          selector({
            id: "difficulty",
            x: X,
            y: next(50),
            w: W,
            label: "DIFFICULTY",
            options: [
              { value: 0.7, label: "EASY" },
              { value: 1, label: "NORMAL" },
              { value: 1.5, label: "HARD" },
            ],
            get: () => (st().difficulty < 0.85 ? 0.7 : st().difficulty > 1.25 ? 1.5 : 1),
            set: (v) => {
              st().difficulty = v;
              changed();
            },
          }),
        );
        const tog = (id: string, label: string, key: "autoFire" | "screenShake" | "showFps") =>
          ws.push(
            toggle({
              id,
              x: X,
              y: next(50),
              w: W,
              label,
              get: () => st()[key],
              set: (v) => {
                st()[key] = v;
                if (key === "autoFire") svc.input.setAutoFire(v);
                changed();
              },
            }),
          );
        tog("autofire", "AUTO-FIRE", "autoFire");
        tog("shake", "SCREEN SHAKE", "screenShake");
        tog("fps", "SHOW FPS", "showFps");
        ws.push(
          toggle({
            id: "reducedmotion",
            x: X,
            y: next(50),
            w: W,
            label: "REDUCED MOTION",
            get: () => reducedMotion(),
            set: (v) => {
              writePrefs({ reducedMotion: v });
              applyReducedMotion();
            },
          }),
        );
        y += 20;
        ws.push(
          button({
            id: "reset",
            x: X,
            y: next(54),
            w: W,
            h: 54,
            label: "RESET SAVE DATA",
            accent: C.red,
            onClick: () => {
              confirmReset = true;
              build();
            },
          }),
        );
      } else if (tab === "devices") {
        ws.push(
          selector({
            id: "touch",
            x: X,
            y: next(50),
            w: W,
            label: "TOUCH CONTROLS",
            options: [
              { value: "auto", label: "AUTO" },
              { value: "on", label: "ON" },
              { value: "off", label: "OFF" },
            ],
            get: () => st().touchControls,
            set: (v) => {
              st().touchControls = v as "auto" | "on" | "off";
              changed();
            },
          }),
        );
        if (isSkyInput(svc.input)) {
          const inp = svc.input;
          ws.push(
            selector({
              id: "touchmove",
              x: X,
              y: next(50),
              w: W,
              label: "TOUCH STEERING",
              options: [
                { value: "drag", label: "DRAG" },
                { value: "stick", label: "JOYSTICK" },
              ],
              get: () => inp.touchMoveMode,
              set: (v) => {
                inp.touchMoveMode = v as "drag" | "stick";
              },
            }),
          );
        }
        ws.push(
          toggle({
            id: "autofire2",
            x: X,
            y: next(50),
            w: W,
            label: "AUTO-FIRE",
            get: () => st().autoFire,
            set: (v) => {
              st().autoFire = v;
              svc.input.setAutoFire(v);
              changed();
            },
          }),
        );
        gamepadY = y + 20;
      }
      if (WIDE || tab === "keys") {
        const rowH = WIDE ? 42 : 44;
        const KX = WIDE ? RX : X;
        const KW = WIDE ? RW : W;
        ACTION_LABELS.forEach(([a, lbl], i) => {
          const w: Widget = {
            id: "key_" + a,
            x: KX,
            y: KEY_Y0 + i * (rowH + 6),
            w: KW,
            h: rowH,
            draw: (g, s) => {
              const hot = s.focus || s.hover;
              g.rect(w.x, w.y, w.w, w.h, s.pressed ? C.navy3 : hot ? C.navy2 : C.navy, 0.94, 3);
              g.frame(w.x, w.y, w.w, w.h, hot ? C.amber : C.steel, hot ? 2 : 1, 1, 3);
              if (s.focus) g.frame(w.x - 3, w.y - 3, w.w + 6, w.h + 6, C.amber, 1, 0.4 + 0.4 * Math.sin(s.t * 6), 4);
              g.text(lbl, w.x + 14, w.y + w.h / 2, { size: 13, color: hot ? C.white : C.text, anchor: "left" });
              const keys = st().bindings[a] ?? [];
              let kx = w.x + w.w - 12;
              for (let j = keys.length - 1; j >= 0; j--) {
                const t = keyLabel(keys[j]!);
                const kw = Math.max(34, t.length * 9 + 14);
                g.rect(kx - kw, w.y + 9, kw, w.h - 18, j === 0 ? C.amberDim : C.navy3, 1, 3);
                g.frame(kx - kw, w.y + 9, kw, w.h - 18, j === 0 ? C.amber : C.steel, 1, 1, 3);
                g.text(esc(t), kx - kw / 2, w.y + w.h / 2, { size: 11, color: C.white, anchor: "center" });
                kx -= kw + 6;
              }
            },
            activate: () => startRebind(a),
            tooltip: () => [lbl, `KEYS: ${(st().bindings[a] ?? []).map(keyLabel).join(" / ") || "-"}`, kit.mode() === "kb" ? "CLICK OR ENTER, THEN PRESS THE NEW KEY" : "SELECT, THEN PRESS THE NEW KEY"],
          };
          ws.push(w);
        });
        ws.push(
          button({
            id: "resetkeys",
            x: KX,
            y: KEY_Y0 + ACTION_LABELS.length * (rowH + 6) + 4,
            w: KW,
            h: 44,
            label: "RESET KEYS TO DEFAULT",
            size: 14,
            accent: C.red,
            onClick: () => {
              svc.input.resetBindings();
              build("resetkeys");
            },
          }),
        );
      }
      ws.push(
        button({
          id: "back",
          x: WIDE ? LX : 20,
          y: BOTTOM_Y,
          w: WIDE ? Math.min(LW, 280) : GAME_W - 40,
          h: BOTTOM_H,
          label: "BACK",
          accent: C.cyan,
          sfx: false,
          onClick: () => root.goBack(),
          cap: kit.cap("ESC", "B"),
        }),
      );
      root.set(ws, focus);
    };
    build();
  });
}
