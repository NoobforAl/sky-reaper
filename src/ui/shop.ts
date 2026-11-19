/**
 * Hangar: upgrades (pips + cost), weapon unlocks, aircraft selection with stat bars + preview, paint schemes (skins).
 * Portrait: tabs on top, one list. Wide: categories left, item list centre, details panel right.
 */
import {
  AIRCRAFT_IDS,
  CHAPTER_IDS,
  GAME_W,
  SCENES,
  type AircraftDef,
  type AircraftId,
  type AirWeaponId,
  type GroundWeaponId,
  type PlayerWeaponDef,
  type Services,
  type SkinDef,
  type SkinId,
  type UpgradeDef,
} from "../contracts";
import { AIRCRAFT, PLAYER_WEAPONS, shopCost, UPGRADES } from "../weapons";
import { beginScene } from "./core";
import { chapterInfo } from "./data";
import { weaponIcon } from "./icons";
import { BOTTOM_H, BOTTOM_Y, clamp, cols, M, WIDE } from "./layout";
import { drawSkinnedAircraft, equippedSkin, ownsSkin, skinCatalog, skinLockedBy, SKIN_SWATCH } from "./skins";
import { C, esc, fmtNum, type RGB } from "./theme";
import { button, readableSize, type Gfx, type WState, type Widget } from "./widgets";
import type { ShopFocus } from "./desktop/store";

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** cumulative effect of an upgrade at level `lv` (for tooltips / details panel) */
export function upgradeEffect(u: UpgradeDef, lv: number): string {
  const t = u.perLevel * lv;
  switch (u.id) {
    case "damage":
    case "fireRate":
    case "speed":
      return `+${pct(t)}`;
    case "hull":
      return `+${Math.round(t)} HP`;
    case "shield":
      return `+${Math.round(t)} SHIELD`;
    case "bombs":
      return `+${Math.round(t)} CAP`;
    case "flares":
      return `-${t.toFixed(1)} S`;
    default:
      return `LV ${lv}`;
  }
}

/** details panel entry: ShopFocus + optional big preview */
interface Detail extends ShopFocus {
  accent?: RGB;
  preview?: (g: Gfx, cx: number, cy: number, t: number) => void;
}

type Tab = "upgrades" | "arsenal" | "aircraft" | "skins";
const TABS: Array<{ id: Tab; label: string; desc: string }> = [
  { id: "upgrades", label: "UPGRADES", desc: "Permanent airframe and weapon improvements. Every level applies to every aircraft." },
  { id: "arsenal", label: "ARSENAL", desc: "Unlock primary guns (air to air) and ordnance (air to ground). Swap them in flight." },
  { id: "aircraft", label: "AIRCRAFT", desc: "Buy and select the airframe for your next sortie." },
  { id: "skins", label: "SKINS", desc: "Paint schemes. Buy once, then equip a different scheme on each aircraft." },
];

let lastTab: Tab = "upgrades";

/** wide geometry: [categories, list, details] */
const wideCols = () => {
  const avail = GAME_W - 2 * M - 220 - 48;
  const list = clamp(Math.round(avail * 0.54), 400, 640);
  return cols([220, list, 1], 24);
};
const LIST_Y = WIDE ? 104 : 146;

export function registerShop(svc: Services): void {
  const { k } = svc;
  k.scene(SCENES.shop, () => {
    const save = svc.save;
    // older saves / services: make sure the skin fields exist
    save.data.unlockedSkins ??= ["standard"];
    save.data.selectedSkin ??= {};
    let tab: Tab = lastTab;
    let toast: { text: string; color: RGB; t: number } | null = null;
    let shownCredits = save.data.credits;
    let creditFlash = 0;
    let skinAc: AircraftId = save.data.selectedAircraft;
    const [cCat, cList, cInfo] = WIDE ? wideCols() : [null, { x: 20, w: GAME_W - 40 }, null];
    const LX = cList!.x;
    const LW = cList!.w;

    /** per-widget item info (tooltips + details panel) */
    const info = new Map<string, () => Detail>();
    const act = () => (kit.mode() === "kb" ? "CLICK / ENTER" : kit.mode() === "pad" ? "PRESS A" : "TAP");
    const infoLines = (f: Detail | undefined): string[] | null => (f ? [`${f.title}  -  ${f.kind}`, ...f.lines] : null);
    /** in WIDE the details panel already shows everything: keep tooltips short there */
    const tip = (id: string) => () => {
      const f = info.get(id)?.();
      if (!f) return null;
      if (!WIDE) return infoLines(f);
      return [f.title, f.lines[f.lines.length - 1] ?? ""];
    };
    const focused = (): Detail | null => {
      const id = (kit.root.hoverId && info.has(kit.root.hoverId) ? kit.root.hoverId : null) ?? kit.root.focusId;
      return id ? (info.get(id)?.() ?? null) : null;
    };

    const kit = beginScene(svc, SCENES.shop, {
      music: "menu",
      drawContent: (kk) => {
        const { g } = kk;
        const top = 18 + kk.insets.top;
        g.text("HANGAR", WIDE ? M : 24, top + (WIDE ? 30 : 22), { size: WIDE ? 32 : 28, color: C.amber, anchor: "left", outline: 2 });
        // animated credits counter
        const target = save.data.credits;
        shownCredits += (target - shownCredits) * Math.min(1, k.dt() * 10);
        if (Math.abs(target - shownCredits) < 1) shownCredits = target;
        creditFlash = Math.max(0, creditFlash - k.dt());
        const cw = WIDE ? 240 : 176;
        const cx = GAME_W - (WIDE ? M : 20) - cw;
        g.panel(cx, top + 2, cw, WIDE ? 50 : 42, { accent: C.cyan });
        g.text("CREDITS", cx + 12, top + (WIDE ? 27 : 23), { size: 10, color: C.cyan, anchor: "left" });
        g.text(fmtNum(shownCredits), cx + cw - 12, top + (WIDE ? 27 : 23), { size: WIDE ? 24 : 20, color: creditFlash > 0 ? C.red : C.amber, anchor: "right" });
        if (WIDE) {
          const t = TABS.find((q) => q.id === tab)!;
          g.text(t.label, LX, top + 32, { size: 14, color: C.cyan, anchor: "left" });
          const lw = g.measure(t.label, 14) + 24;
          g.text(esc(t.desc), LX + lw, top + 32, { size: 11, color: C.text, anchor: "left", width: cx - LX - lw - 20, maxLines: 1 });
        }
        if (tab === "arsenal") {
          g.text("PRIMARY - AIR TO AIR", LX + 4, WIDE ? LIST_Y + 4 : 148, { size: 12, color: C.cyan });
          g.text("ORDNANCE - AIR TO GROUND", LX + 4, WIDE ? LIST_Y + 310 : 450, { size: 12, color: C.cyan });
        }
        if (tab === "skins" && !WIDE) drawSkinStage(g, kk.age(), 20, 198, GAME_W - 40, 120);
        if (WIDE) drawDetails(g, cInfo!.x, LIST_Y, cInfo!.w, BOTTOM_Y - 22 - LIST_Y);
      },
      drawOver: (kk) => {
        if (!toast) return;
        toast.t -= k.dt();
        if (toast.t <= 0) {
          toast = null;
          return;
        }
        const a = Math.min(1, toast.t / 0.3);
        const y = WIDE ? BOTTOM_Y - 40 : 734;
        const tx = WIDE ? LX : 60;
        const tw = WIDE ? LW : GAME_W - 120;
        kk.g.rect(tx, y - 18, tw, 36, C.dark, 0.88 * a, 4);
        kk.g.frame(tx, y - 18, tw, 36, toast.color, 2, a, 4);
        kk.g.text(toast.text, tx + tw / 2, y, { size: 15, color: toast.color, anchor: "center", opacity: a });
      },
    });
    const { root } = kit;
    root.back = () => k.go(SCENES.menu);

    const say = (text: string, color: RGB) => {
      toast = { text, color, t: 1.6 };
    };
    const deny = (text: string) => {
      root.sfx("ui_deny");
      say(text, C.red);
    };
    const buy = (cost: number, what: string, apply: () => void): boolean => {
      if (!Number.isFinite(cost)) return false;
      if (!save.spend(cost)) {
        root.sfx("ui_deny");
        creditFlash = 0.5;
        say(`NEED ${fmtNum(cost - save.data.credits)} MORE CREDITS`, C.red);
        return false;
      }
      apply();
      save.save();
      root.sfx("ui_buy");
      say(`${what} ACQUIRED`, C.green);
      return true;
    };

    const setTab = (t: Tab) => {
      if (t === tab) return;
      tab = lastTab = t;
      root.sfx("ui_move", 0.7);
      build("tab_" + t);
    };
    const cycle = (d: number) => {
      const i = TABS.findIndex((q) => q.id === tab);
      setTab(TABS[(i + d + TABS.length) % TABS.length]!.id);
    };
    root.prevTab = () => cycle(-1);
    root.nextTab = () => cycle(1);

    const build = (focus?: string) => {
      const ws: Widget[] = [];
      info.clear();
      const ti = TABS.findIndex((q) => q.id === tab);
      const tw = (GAME_W - 40 - 8 * (TABS.length - 1)) / TABS.length;
      TABS.forEach((t, i) => {
        const id = "tab_" + t.id;
        ws.push(
          button({
            id,
            x: WIDE ? cCat!.x : 20 + i * (tw + 8),
            y: WIDE ? LIST_Y + i * 74 : 86,
            w: WIDE ? cCat!.w : tw,
            h: WIDE ? 64 : 46,
            label: t.label,
            size: WIDE ? 17 : 13,
            sfx: false,
            align: WIDE ? "left" : "center",
            accent: C.cyan,
            onClick: () => setTab(t.id),
            deco: (g, _s, w) => {
              if (tab !== t.id) return;
              if (WIDE) g.rect(w.x, w.y + 6, 5, w.h - 12, C.amber);
              else g.rect(w.x + 6, w.y + w.h - 5, w.w - 12, 3, C.amber);
            },
            cap: i === (ti + TABS.length - 1) % TABS.length ? kit.cap("Q", "LB") : i === (ti + 1) % TABS.length ? kit.cap("E", "RB") : undefined,
          }),
        );
        info.set(id, () => {
          const ac = save.data.selectedAircraft;
          return {
            title: t.label,
            kind: "CATEGORY",
            lines: [t.desc, `ACTIVE: ${ac.toUpperCase()} - ${equippedSkin(save.data, ac).toUpperCase()} SCHEME`, `${act()} OR ${kit.mode() === "pad" ? "LB/RB" : "Q/E"} TO SWITCH`],
            accent: C.cyan,
            preview: (g, cx, cy, tt) => drawSkinnedAircraft(g, svc.sprites, ac, equippedSkin(save.data, ac), cx, cy + Math.sin(tt * 2) * 4, 4),
          };
        });
      });
      if (tab === "upgrades") buildUpgrades(ws);
      else if (tab === "arsenal") buildArsenal(ws);
      else if (tab === "aircraft") buildAircraft(ws);
      else buildSkins(ws);
      ws.push(
        button({
          id: "back",
          x: WIDE ? cCat!.x : 20,
          y: BOTTOM_Y,
          w: WIDE ? cCat!.w : 140,
          h: BOTTOM_H,
          label: "BACK",
          onClick: () => root.goBack(),
          sfx: false,
          accent: C.cyan,
          cap: kit.cap("ESC", "B"),
        }),
      );
      ws.push(
        button({
          id: "sortie",
          x: WIDE ? LX : 172,
          y: BOTTOM_Y,
          w: WIDE ? GAME_W - M - LX : GAME_W - 192,
          h: BOTTOM_H,
          label: "TO CHAPTERS",
          size: 18,
          onClick: () => k.go(SCENES.chapters),
        }),
      );
      root.set(ws, focus);
    };

    // -------------------------------------------------------------- upgrades
    const buildUpgrades = (ws: Widget[]) => {
      const step = WIDE ? 90 : 82;
      UPGRADES.forEach((u, i) => {
        const w: Widget = {
          id: "up_" + u.id,
          x: LX,
          y: LIST_Y + i * step,
          w: LW,
          h: step - 8,
          sfx: false,
          draw: (g, s) => drawUpgrade(g, s, w, u, save.data.upgrades[u.id] ?? 0, save.data.credits),
          tooltip: tip("up_" + u.id),
          activate: () => {
            const lv = save.data.upgrades[u.id] ?? 0;
            if (lv >= u.maxLevel) {
              root.sfx("ui_deny");
              say("ALREADY MAXED", C.grey);
              return;
            }
            buy(shopCost(u, lv), `${u.name} LV${lv + 1}`, () => {
              save.data.upgrades[u.id] = lv + 1;
            });
          },
        };
        ws.push(w);
        info.set(w.id, () => {
          const lv = save.data.upgrades[u.id] ?? 0;
          const maxed = lv >= u.maxLevel;
          const cost = shopCost(u, lv);
          const credits = save.data.credits;
          return {
            title: u.name,
            kind: "UPGRADE",
            accent: C.amber,
            lines: [
              u.desc,
              `LEVEL ${lv}/${u.maxLevel}  NOW ${upgradeEffect(u, lv)}`,
              maxed ? "FULLY UPGRADED" : `NEXT ${upgradeEffect(u, lv + 1)}`,
              maxed ? "" : credits >= cost ? `${act()} TO BUY` : `NEED ${fmtNum(cost - credits)} MORE CR`,
            ].filter(Boolean),
            cost: maxed ? undefined : cost,
            state: maxed ? "MAX" : undefined,
            preview: (g, cx, cy) => {
              const n = u.maxLevel;
              const s = 22;
              const x0 = cx - (n * (s + 6) - 6) / 2;
              g.pips(x0, cy - s / 2, n, lv, s, C.amber, 6);
              if (!maxed) g.frame(x0 + lv * (s + 6) - 2, cy - s / 2 - 2, s + 4, s + 4, C.white, 1, 0.5 + 0.5 * Math.sin(svc.k.time() * 6));
            },
          };
        });
      });
    };

    // -------------------------------------------------------------- arsenal
    const buildArsenal = (ws: Widget[]) => {
      const owned = (wd: PlayerWeaponDef) =>
        wd.unlockCost <= 0 ||
        (wd.kind === "air" ? save.data.unlockedAir.includes(wd.id as AirWeaponId) : save.data.unlockedGround.includes(wd.id as GroundWeaponId));
      const air = PLAYER_WEAPONS.filter((w) => w.kind === "air");
      const ground = PLAYER_WEAPONS.filter((w) => w.kind === "ground");
      const row = (wd: PlayerWeaponDef, y: number) => {
        const w: Widget = {
          id: "wp_" + wd.id,
          x: LX,
          y,
          w: LW,
          h: 62,
          sfx: false,
          draw: (g, s) => drawWeapon(g, s, w, wd, owned(wd), save.data.credits, svc),
          tooltip: tip("wp_" + wd.id),
          activate: () => {
            if (owned(wd)) {
              root.sfx("ui_move");
              say(`${wd.name} READY - SWAP IN FLIGHT`, C.cyan);
              return;
            }
            buy(wd.unlockCost, wd.name, () => {
              if (wd.kind === "air") save.data.unlockedAir.push(wd.id as AirWeaponId);
              else save.data.unlockedGround.push(wd.id as GroundWeaponId);
            });
          },
        };
        ws.push(w);
        info.set(w.id, () => {
          const own = owned(wd);
          const credits = save.data.credits;
          const lines = [wd.desc, `${wd.kind === "air" ? "AIR TO AIR" : "AIR TO GROUND"}  RATE ${wd.fireRate}/S  DMG ${wd.damage}`];
          if (wd.ammoCost) lines.push(`USES ${wd.ammoCost} ORDNANCE PER SHOT`);
          const swap = kit.mode() === "pad" ? (wd.kind === "air" ? "LB" : "LT") : kit.mode() === "kb" ? (wd.kind === "air" ? "Q/E" : "R") : "WPN/ORD";
          lines.push(own ? `OWNED - SWAP IN FLIGHT (${swap})` : credits >= wd.unlockCost ? `${act()} TO UNLOCK` : `NEED ${fmtNum(wd.unlockCost - credits)} MORE CR`);
          const col = wd.kind === "air" ? C.cyan : C.amber;
          return {
            title: wd.name,
            kind: wd.kind === "air" ? "PRIMARY" : "ORDNANCE",
            accent: col,
            lines,
            cost: own ? undefined : wd.unlockCost,
            state: own ? "OWNED" : undefined,
            preview: (g, cx, cy) => {
              g.ring(cx, cy, 52, col, 1, 0.4);
              weaponIcon(g, wd.id, cx, cy, 72, svc.sprites, own ? col : C.grey);
            },
          };
        });
      };
      if (WIDE) {
        air.forEach((wd, i) => row(wd, LIST_Y + 26 + i * 68));
        ground.forEach((wd, i) => row(wd, LIST_Y + 332 + i * 68));
      } else {
        air.forEach((wd, i) => row(wd, 166 + i * 68));
        ground.forEach((wd, i) => row(wd, 468 + i * 68));
      }
    };

    // -------------------------------------------------------------- aircraft
    const buildAircraft = (ws: Widget[]) => {
      AIRCRAFT.forEach((a, i) => {
        const w: Widget = {
          id: "ac_" + a.id,
          x: LX,
          y: LIST_Y + i * 194,
          w: LW,
          h: 184,
          sfx: false,
          draw: (g, s) =>
            drawAircraft(
              g,
              s,
              w,
              a,
              save.data.unlockedAircraft.includes(a.id),
              save.data.selectedAircraft === a.id,
              save.data.credits,
              svc,
              kit.mode() === "touch" ? "TAP TO SELECT" : kit.mode() === "pad" ? "A TO SELECT" : "CLICK TO SELECT",
              equippedSkin(save.data, a.id),
            ),
          tooltip: tip("ac_" + a.id),
          activate: () => {
            if (save.data.unlockedAircraft.includes(a.id)) {
              if (save.data.selectedAircraft !== a.id) {
                save.data.selectedAircraft = a.id;
                skinAc = a.id;
                save.save();
                root.sfx("ui_select");
                say(`${a.name} SELECTED`, C.cyan);
              }
              return;
            }
            buy(a.unlockCost, a.name, () => {
              save.data.unlockedAircraft.push(a.id);
              save.data.selectedAircraft = a.id;
              skinAc = a.id;
            });
          },
        };
        ws.push(w);
        info.set(w.id, () => {
          const owned = save.data.unlockedAircraft.includes(a.id);
          const selected = save.data.selectedAircraft === a.id;
          const credits = save.data.credits;
          return {
            title: a.name,
            kind: "AIRCRAFT",
            accent: selected ? C.amber : C.cyan,
            lines: [
              a.desc,
              `SPEED x${a.speed}  HULL x${a.hp}  SHIELD x${a.shield}`,
              `FIRE RATE x${a.fireRate}  ORDNANCE ${a.bombs}  HITBOX ${a.hitRadius}`,
              selected ? "SELECTED FOR NEXT SORTIE" : owned ? `${act()} TO SELECT` : credits >= a.unlockCost ? `${act()} TO BUY` : `NEED ${fmtNum(a.unlockCost - credits)} MORE CR`,
            ],
            cost: owned ? undefined : a.unlockCost,
            state: selected ? "SELECTED" : owned ? "OWNED" : undefined,
            preview: (g, cx, cy, t) => {
              g.ring(cx, cy, 70, C.cyanDim, 1, 0.5);
              g.ring(cx, cy, 46, C.cyanDim, 1, 0.3);
              drawSkinnedAircraft(g, svc.sprites, a.id, equippedSkin(save.data, a.id), cx, cy + Math.sin(t * 2) * 4, 4, owned ? 1 : 0.6);
            },
          };
        });
      });
    };

    // -------------------------------------------------------------- skins
    const skinDefs = skinCatalog();
    const acOwned = (id: AircraftId) => save.data.unlockedAircraft.includes(id);
    const skinDetail = (def: SkinDef): Detail => {
      const own = ownsSkin(save.data, def.id);
      const eq = equippedSkin(save.data, skinAc) === def.id;
      const lockCh = skinLockedBy(save.data, def);
      const credits = save.data.credits;
      const acName = skinAc.toUpperCase();
      const lines = [def.desc];
      if (def.unlockChapter) lines.push(`REQUIRES ${chapterLabel(def.unlockChapter)} CLEARED`);
      lines.push(
        eq
          ? `EQUIPPED ON ${acName}`
          : !acOwned(skinAc)
            ? `${acName} NOT OWNED YET`
            : own
              ? `${act()} TO EQUIP ON ${acName}`
              : lockCh
                ? `LOCKED - CLEAR ${chapterLabel(lockCh)}`
                : credits >= def.cost
                  ? `${act()} TO BUY + EQUIP`
                  : `NEED ${fmtNum(def.cost - credits)} MORE CR`,
      );
      return {
        title: def.name,
        kind: "PAINT SCHEME",
        accent: SKIN_SWATCH[def.id],
        lines,
        cost: own ? undefined : def.cost,
        state: eq ? "EQUIPPED" : own ? "OWNED" : lockCh ? "LOCKED" : undefined,
        preview: (g, cx, cy, t) => {
          g.ring(cx, cy, 70, SKIN_SWATCH[def.id], 1, 0.35);
          drawSkinnedAircraft(g, svc.sprites, skinAc, def.id, cx, cy + Math.sin(t * 2) * 4, 4, lockCh && !own ? 0.55 : 1);
        },
      };
    };
    /** hovered/focused skin (for the portrait preview stage) */
    let stageSkin: SkinId | null = null;
    const drawSkinStage = (g: Gfx, t: number, x: number, y: number, w: number, h: number) => {
      const id = (root.hoverId?.startsWith("sk_") ? root.hoverId : null) ?? (root.focusId?.startsWith("sk_") ? root.focusId : null);
      stageSkin = id ? (id.slice(3) as SkinId) : equippedSkin(save.data, skinAc);
      g.panel(x, y, w, h, { accent: SKIN_SWATCH[stageSkin] });
      g.ring(x + 80, y + h / 2, 48, SKIN_SWATCH[stageSkin], 1, 0.4);
      drawSkinnedAircraft(g, svc.sprites, skinAc, stageSkin, x + 80, y + h / 2 + Math.sin(t * 2) * 3, 3);
      const def = skinDefs.find((s) => s.id === stageSkin)!;
      g.text(def.name, x + 150, y + 22, { size: 18, color: C.white, outline: -1 });
      g.text(`ON ${skinAc.toUpperCase()}`, x + 150, y + 46, { size: 11, color: C.cyan });
      g.text(esc(def.desc), x + 150, y + 66, { size: 10, color: C.text, width: w - 166, maxLines: 2, lineSpacing: 1 });
    };
    const buildSkins = (ws: Widget[]) => {
      // aircraft picker
      const pw = (LW - 16) / 3;
      AIRCRAFT_IDS.forEach((id, i) => {
        const wid = "sa_" + id;
        ws.push(
          button({
            id: wid,
            x: LX + i * (pw + 8),
            y: LIST_Y,
            w: pw,
            h: 44,
            label: id.toUpperCase(),
            size: 13,
            sfx: false,
            accent: C.cyan,
            onClick: () => {
              if (skinAc === id) return;
              skinAc = id;
              root.sfx("ui_move", 0.7);
              build(wid);
            },
            deco: (g, _s, w) => {
              if (skinAc === id) g.rect(w.x + 6, w.y + w.h - 5, w.w - 12, 3, C.amber);
              if (!acOwned(id)) g.lock(w.x + 16, w.y + w.h / 2, 14, C.grey);
            },
          }),
        );
        info.set(wid, () => ({
          title: id.toUpperCase(),
          kind: "PREVIEW AIRCRAFT",
          accent: C.cyan,
          lines: [acOwned(id) ? `EQUIPPED: ${equippedSkin(save.data, id).toUpperCase()}` : "NOT OWNED - PREVIEW ONLY", `${act()} TO SHOW SKINS ON THIS AIRCRAFT`],
          preview: (g, cx, cy, t) => drawSkinnedAircraft(g, svc.sprites, id, equippedSkin(save.data, id), cx, cy + Math.sin(t * 2) * 4, 4),
        }));
      });
      const y0 = WIDE ? LIST_Y + 56 : 330;
      const step = WIDE ? 72 : 62;
      skinDefs.forEach((def, i) => {
        const w: Widget = {
          id: "sk_" + def.id,
          x: LX,
          y: y0 + i * step,
          w: LW,
          h: step - 6,
          sfx: false,
          draw: (g, s) => drawSkinRow(g, s, w, def),
          tooltip: tip("sk_" + def.id),
          activate: () => {
            const own = ownsSkin(save.data, def.id);
            const lockCh = skinLockedBy(save.data, def);
            if (own) {
              if (!acOwned(skinAc)) return deny(`${skinAc.toUpperCase()} NOT OWNED`);
              if (equippedSkin(save.data, skinAc) === def.id) {
                root.sfx("ui_move");
                return;
              }
              save.data.selectedSkin[skinAc] = def.id;
              save.save();
              root.sfx("ui_select");
              say(`${def.name} ON ${skinAc.toUpperCase()}`, C.cyan);
              return;
            }
            if (lockCh) return deny(`CLEAR ${chapterLabel(lockCh)} FIRST`);
            buy(def.cost, `${def.name} SCHEME`, () => {
              if (!save.data.unlockedSkins.includes(def.id)) save.data.unlockedSkins.push(def.id);
              if (acOwned(skinAc)) save.data.selectedSkin[skinAc] = def.id;
            });
          },
        };
        ws.push(w);
        info.set(w.id, () => skinDetail(def));
      });
    };
    const drawSkinRow = (g: Gfx, s: WState, w: Widget, def: SkinDef) => {
      const own = ownsSkin(save.data, def.id);
      const eq = equippedSkin(save.data, skinAc) === def.id;
      const lockCh = own ? null : skinLockedBy(save.data, def);
      const sw = SKIN_SWATCH[def.id];
      rowFrame(g, s, w, eq ? C.amber : C.cyan);
      if (eq) g.rect(w.x, w.y, 5, w.h, C.amber);
      const pcx = w.x + 40;
      const pcy = w.y + w.h / 2;
      g.circle(pcx, pcy, w.h / 2 - 6, C.dark, 0.7);
      drawSkinnedAircraft(g, svc.sprites, skinAc, def.id, pcx, pcy, w.h >= 60 ? 1.6 : 1.4, lockCh ? 0.5 : 1);
      g.rect(w.x + 72, w.y + 12, 10, w.h - 24, sw, 1, 2);
      g.text(def.name, w.x + 94, w.y + (WIDE ? 14 : 10), { size: WIDE ? 16 : 14, color: lockCh ? C.grey : s.focus || s.hover ? C.white : C.text, outline: -1 });
      g.text(esc(def.desc), w.x + 94, w.y + (WIDE ? 38 : 30), { size: 10, color: C.text, width: w.w - 220, maxLines: WIDE ? 2 : 1, lineSpacing: 1 });
      const rx = w.x + w.w - 12;
      if (eq) g.text("EQUIPPED", rx - 50, pcy, { size: 12, color: C.amber, anchor: "center" });
      else if (own) g.text("OWNED", rx - 46, pcy, { size: 12, color: C.green, anchor: "center" });
      else if (lockCh) {
        g.lock(rx - 76, pcy, 16, C.grey);
        g.text(`CH ${CHAPTER_IDS.indexOf(lockCh) + 1}`, rx - 36, pcy, { size: 12, color: C.grey, anchor: "center" });
      } else costTag(g, rx, pcy, def.cost, save.data.credits);
    };

    // -------------------------------------------------------------- details panel (wide)
    const drawDetails = (g: Gfx, x: number, y: number, w: number, h: number) => {
      const f = focused();
      const acc = f?.accent ?? C.cyan;
      g.panel(x, y, w, h, { title: f?.kind ?? "DETAILS", accent: acc });
      if (!f) {
        g.text("Hover or select an item.", x + 20, y + 30, { size: 13, color: C.grey });
        return;
      }
      const t = svc.k.time();
      g.text(esc(f.title), x + 22, y + 26, { size: 24, color: C.white, outline: -1, width: w - 44 });
      if (f.state) g.text(f.state, x + w - 22, y + 30, { size: 13, color: f.state === "LOCKED" ? C.grey : C.green, anchor: "topright" });
      // preview stage
      const sy = y + 70;
      const sh = Math.min(200, h * 0.36);
      g.rect(x + 16, sy, w - 32, sh, C.dark, 0.55, 3);
      for (let i = 0; i < 6; i++) g.rect(x + 16, sy + ((i * 34 + t * 24) % sh), w - 32, 1, C.cyanDim, 0.25);
      g.frame(x + 16, sy, w - 32, sh, C.steel, 1, 1, 3);
      if (f.preview) f.preview(g, x + w / 2, sy + sh / 2, t);
      // text lines
      let ly = sy + sh + 20;
      f.lines.forEach((l, i) => {
        const last = i === f.lines.length - 1;
        const col = last ? (l.startsWith("NEED") || l.startsWith("LOCKED") ? C.red : C.amber) : i === 0 ? C.text : C.cyan;
        ly += g.text(esc(l), x + 22, ly, { size: i === 0 ? 14 : 12, color: i === 0 ? C.white : col, width: w - 44, lineSpacing: 3 }) + (i === 0 ? 12 : 6);
      });
      if (f.cost !== undefined) {
        const ok = save.data.credits >= f.cost;
        const by = y + h - 60;
        g.rect(x + 16, by, w - 32, 44, ok ? C.amberDim : C.dark, 0.85, 3);
        g.frame(x + 16, by, w - 32, 44, ok ? C.amber : C.steel, 1, 1, 3);
        g.text("PRICE", x + 30, by + 22, { size: 11, color: ok ? C.white : C.grey, anchor: "left" });
        g.text(`${fmtNum(f.cost)} CR`, x + w - 30, by + 22, { size: 20, color: ok ? C.white : C.grey, anchor: "right" });
      }
    };

    build();
  });
}

function chapterLabel(id: string): string {
  const i = CHAPTER_IDS.indexOf(id as (typeof CHAPTER_IDS)[number]);
  if (i < 0) return id.toUpperCase();
  return `CH ${i + 1} ${chapterInfo(CHAPTER_IDS[i]!).subtitle.toUpperCase()}`;
}

function rowFrame(g: Gfx, s: WState, w: Widget, accent: RGB, dim = false): void {
  const hot = s.focus || s.hover;
  g.rect(w.x, w.y, w.w, w.h, s.pressed ? C.navy3 : hot ? C.navy2 : C.navy, dim ? 0.8 : 0.94, 3);
  g.frame(w.x, w.y, w.w, w.h, hot ? accent : C.steel, hot ? 2 : 1, 1, 3);
  if (s.focus) g.frame(w.x - 3, w.y - 3, w.w + 6, w.h + 6, accent, 1, 0.4 + 0.4 * Math.sin(s.t * 6), 4);
}

function costTag(g: Gfx, x: number, y: number, cost: number, credits: number): void {
  const ok = credits >= cost;
  g.rect(x - 92, y - 15, 92, 30, ok ? C.amberDim : C.dark, 0.9, 3);
  g.frame(x - 92, y - 15, 92, 30, ok ? C.amber : C.steel, 1, 1, 3);
  g.text(fmtNum(cost), x - 46, y, { size: 15, color: ok ? C.white : C.grey, anchor: "center" });
}

function drawUpgrade(g: Gfx, s: WState, w: Widget, u: UpgradeDef, lv: number, credits: number): void {
  rowFrame(g, s, w, C.amber);
  g.text(u.name, w.x + 16, w.y + (WIDE ? 12 : 8), { size: 16, color: s.focus || s.hover ? C.white : C.text, outline: -1 });
  const nameW = g.measure(u.name, 16, true);
  if (WIDE) {
    g.text(esc(u.desc), w.x + 16, w.y + 34, { size: 10, color: C.grey, width: w.w - 140, maxLines: 1 });
    g.pips(w.x + 16, w.y + w.h - 22, u.maxLevel, lv, 12, C.amber, 4);
    g.text(`LV ${lv}/${u.maxLevel}`, w.x + 16 + u.maxLevel * 16 + 8, w.y + w.h - 22, { size: 11, color: C.cyan });
  } else {
    // portrait: level pips beside the name, the description gets two full lines below
    const px = w.x + 16 + Math.max(84, nameW + 12);
    const ty = w.y + 8 + readableSize(16) / 2;
    g.pips(px, ty - 5, u.maxLevel, lv, 10, C.amber, 3);
    g.text(`${lv}/${u.maxLevel}`, px + u.maxLevel * 13 + 6, ty, { size: 11, color: C.cyan, anchor: "left" });
    g.text(esc(u.desc), w.x + 16, w.y + 12 + readableSize(16), { size: 10, color: C.text, width: w.w - 136, maxLines: 2, lineSpacing: 1 });
  }
  if (WIDE && lv < u.maxLevel) g.text(`NEXT ${upgradeEffect(u, lv + 1)}`, w.x + w.w - 120, w.y + w.h - 22, { size: 10, color: C.green, anchor: "topright" });
  if (lv >= u.maxLevel) g.text("MAX", w.x + w.w - 56, w.y + w.h / 2, { size: 18, color: C.green, anchor: "center" });
  else costTag(g, w.x + w.w - 12, w.y + w.h / 2, shopCost(u, lv), credits);
}

function drawWeapon(g: Gfx, s: WState, w: Widget, wd: PlayerWeaponDef, owned: boolean, credits: number, svc: Services): void {
  rowFrame(g, s, w, wd.kind === "air" ? C.cyan : C.amber);
  g.rect(w.x + 10, w.y + 9, 44, 44, C.dark, 0.8, 3);
  weaponIcon(g, wd.id, w.x + 32, w.y + 31, 30, svc.sprites, owned ? (wd.kind === "air" ? C.cyan : C.amber) : C.grey);
  g.text(esc(wd.name), w.x + 66, w.y + 10, { size: 15, color: owned ? C.white : C.text, outline: -1 });
  g.text(esc(wd.desc), w.x + 66, w.y + 12 + readableSize(15), { size: 10, color: C.text, width: w.w - 180, maxLines: 2, lineSpacing: 1 });
  if (owned) g.text("OWNED", w.x + w.w - 56, w.y + w.h / 2, { size: 14, color: C.green, anchor: "center" });
  else costTag(g, w.x + w.w - 12, w.y + w.h / 2, wd.unlockCost, credits);
}

function drawAircraft(g: Gfx, s: WState, w: Widget, a: AircraftDef, owned: boolean, selected: boolean, credits: number, svc: Services, selectHint: string, skin: SkinId): void {
  rowFrame(g, s, w, selected ? C.amber : C.cyan);
  if (selected) g.rect(w.x, w.y, 6, w.h, C.amber);
  // preview pad
  const px = w.x + 70;
  const py = w.y + 82;
  g.ring(px, py, 50, C.cyanDim, 1, 0.6);
  g.ring(px, py, 34, C.cyanDim, 1, 0.35);
  const bob = Math.sin(s.t * 2 + a.id.length) * 3;
  drawSkinnedAircraft(g, svc.sprites, a.id, skin, px, py + bob, 3, owned ? 1 : 0.6);
  g.text(a.name, px, w.y + 150, { size: 16, color: owned ? C.white : C.grey, anchor: "center", outline: -1 });

  const sx = w.x + 140;
  g.text(esc(a.desc), sx, w.y + 12, { size: 10, color: C.text, width: w.w - 156, maxLines: 2, lineSpacing: 1 });
  const stats: Array<[string, number]> = [
    ["SPEED", a.speed / 1.4],
    ["ARMOR", a.hp / 1.6],
    ["SHIELD", a.shield / 1.6],
    ["FIRE", a.fireRate / 1.25],
    ["ORDNANCE", a.bombs / 8],
  ];
  stats.forEach(([n, v], i) => {
    const ry = w.y + 46 + i * 20;
    g.text(n, sx, ry, { size: 10, color: C.grey });
    g.bar(sx + 80, ry, w.w - 236, 11, v, i === 0 ? C.cyan : i < 3 ? C.green : C.amber, { segments: 10 });
  });
  const by = w.y + w.h - 26;
  if (selected) g.text("SELECTED", w.x + w.w - 60, by, { size: 14, color: C.amber, anchor: "center" });
  else if (owned) g.text(selectHint, w.x + w.w - 80, by, { size: 11, color: C.cyan, anchor: "center" });
  else costTag(g, w.x + w.w - 12, by, a.unlockCost, credits);
}
