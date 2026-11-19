/** Keyboard name normalisation (KAPLAY-style key names) + display labels. */

const SPECIAL: Record<string, string> = {
  " ": "space",
  Spacebar: "space",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Escape: "escape",
  Esc: "escape",
  Enter: "enter",
  Shift: "shift",
  Control: "control",
  Alt: "alt",
  Meta: "meta",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  Insert: "insert",
  CapsLock: "capslock",
};

/**
 * Normalised key name for a KeyboardEvent. Letters and digits use the PHYSICAL key (`e.code`) so WASD stays
 * WASD on AZERTY/QWERTZ and shifted digits do not change name; everything else follows KAPLAY naming.
 */
export function keyName(e: KeyboardEvent): string {
  const c = e.code || "";
  if (c.startsWith("Key") && c.length === 4) return c.slice(3).toLowerCase();
  if (c.startsWith("Digit") && c.length === 6) return c.slice(5);
  if (c.startsWith("Numpad") && c.length === 7 && /\d/.test(c[6]!)) return c.slice(6);
  if (c === "NumpadEnter") return "enter";
  const s = SPECIAL[e.key];
  if (s) return s;
  if (/^F\d{1,2}$/.test(e.key)) return e.key.toLowerCase();
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key.toLowerCase();
}

const LABELS: Record<string, string> = {
  space: "SPACE",
  left: "LEFT",
  right: "RIGHT",
  up: "UP",
  down: "DOWN",
  escape: "ESC",
  enter: "ENTER",
  shift: "SHIFT",
  control: "CTRL",
  alt: "ALT",
  meta: "META",
  tab: "TAB",
  backspace: "BKSP",
  delete: "DEL",
  pageup: "PGUP",
  pagedown: "PGDN",
  capslock: "CAPS",
};

export function keyLabel(name: string): string {
  return LABELS[name] ?? name.toUpperCase();
}

/** keys that should never scroll / trigger browser behaviour while the game has focus */
export const PREVENT_DEFAULT = new Set(["space", "left", "right", "up", "down", "tab", "backspace"]);
