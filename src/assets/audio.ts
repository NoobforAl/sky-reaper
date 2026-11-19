/**
 * AudioService: WebAudio graph (master -> music / sfx buses) on KAPLAY's AudioContext when available.
 * Handles autoplay unlock, volumes from SaveService settings (+ hot reload), mute, crossfades and voice limiting.
 */
import type { AudioService, MusicId, SaveService, SfxId } from "../contracts";
import { SFX, playRecipe } from "./sfx";
import { MusicPlayer } from "./music";

const MAX_VOICES = 24;
const MUSIC_BASE = 0.55;
const SFX_BASE = 0.7;
/** pointerdown alone is not an audio-unlocking gesture on older iOS Safari (needs touchend / click). */
const GESTURE_EVENTS = ["pointerdown", "pointerup", "touchend", "mousedown", "keydown", "click"] as const;

let sharedCtx: AudioContext | null = null;
const services: SynthAudio[] = [];

/** Called by loadAssets(k) so the synth shares KAPLAY's AudioContext. */
export function bindAudioContext(ctx: AudioContext | null | undefined): void {
  if (!ctx || sharedCtx) return;
  sharedCtx = ctx;
  for (const s of services) s.attach(ctx);
}

class SynthAudio implements AudioService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private vol = { master: 0.8, music: 0.6, sfx: 0.8 };
  private _muted = false;
  private current: MusicPlayer | null = null;
  private wanted: { id: MusicId; fadeMs: number; loop: boolean } | null = null;
  private voices: Array<{ id: SfxId; end: number }> = [];
  private lastPlay = new Map<SfxId, number>();
  private unlocked = false;

  constructor(private save: SaveService | null) {
    this.readSettings();
    try {
      save?.onSettingsChanged(() => this.readSettings());
    } catch {
      /* stub save service */
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  private readSettings(): void {
    const s = this.save?.data?.settings;
    if (!s) return;
    this.vol.master = clamp01(s.masterVolume ?? 0.8);
    this.vol.music = clamp01(s.musicVolume ?? 0.6);
    this.vol.sfx = clamp01(s.sfxVolume ?? 0.8);
    this._muted = !!s.muted;
    this.applyGains();
  }

  attach(ctx: AudioContext): void {
    if (this.ctx === ctx) return;
    if (this.ctx) return; // already running on our own context; keep it
    this.build(ctx);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx =
      sharedCtx ??
      (() => {
        try {
          const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          return C ? new C() : null;
        } catch {
          return null;
        }
      })();
    if (!ctx) return null;
    this.build(ctx);
    return ctx;
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.comp);
    this.comp.connect(this.master);
    // safety limiter on the master so stacked explosions + music never clip
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.12;
    this.master.connect(lim);
    lim.connect(ctx.destination);
    this.applyGains();
    // if something else (KAPLAY, a later gesture) resumes the context, start any pending music
    try {
      ctx.addEventListener("statechange", () => {
        if (ctx.state === "running") {
          this.disarmGestures();
          this.afterUnlock();
        } else if (ctx.state !== "closed") {
          // suspended / iOS "interrupted": the next gesture must resume it again
          this.armGestures();
        }
      });
    } catch {
      /* old browsers */
    }
  }

  private applyGains(): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(v, t, 0.03);
    };
    set(this.master, this._muted ? 0 : this.vol.master);
    set(this.musicBus, this.vol.music * MUSIC_BASE);
    set(this.sfxBus, this.vol.sfx * SFX_BASE);
  }

  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state !== "running") {
      // keep the gesture listeners until the context really runs (iOS only accepts touchend/click, a resume can reject)
      this.armGestures();
      ctx.resume().then(
        () => {
          if (ctx.state === "running") this.afterUnlock();
        },
        () => {},
      );
    } else this.afterUnlock();
  }

  /**
   * Gesture listeners that retry unlock() on every user gesture until the context is "running", then remove
   * themselves. Re-armed whenever the context drops out of "running" (tab hidden, iOS "interrupted", phone call).
   */
  private gesturesArmed = false;
  private readonly onGesture = (): void => {
    if (this.ctx && this.ctx.state === "running") {
      this.disarmGestures();
      this.afterUnlock();
      return;
    }
    this.unlock();
  };
  private armGestures(): void {
    if (this.gesturesArmed || typeof window === "undefined") return;
    this.gesturesArmed = true;
    for (const ev of GESTURE_EVENTS) window.addEventListener(ev, this.onGesture, { capture: true, passive: true });
  }
  private disarmGestures(): void {
    if (!this.gesturesArmed || typeof window === "undefined") return;
    this.gesturesArmed = false;
    for (const ev of GESTURE_EVENTS) window.removeEventListener(ev, this.onGesture, { capture: true });
  }
  /** Called once per service: arm gestures now and re-try on tab visibility changes. */
  installUnlockHooks(): void {
    if (typeof window === "undefined") return;
    this.armGestures();
    try {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        const ctx = this.ctx;
        if (!ctx || ctx.state === "running") return;
        // try right away (works when the page already had activation), and wait for the next gesture otherwise
        this.unlock();
      });
    } catch {
      /* no document */
    }
  }

  private afterUnlock(): void {
    if (this.unlocked && this.current) return;
    this.unlocked = true;
    if (this.wanted && (!this.current || this.current.id !== this.wanted.id)) {
      const w = this.wanted;
      this.startMusic(w.id, w.fadeMs, w.loop);
    }
  }

  private running(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  playSfx(id: SfxId, opts?: { volume?: number; pitch?: number; pan?: number }): void {
    const r = SFX[id];
    if (!r) return;
    if (!this.ctx) this.ensure();
    if (!this.running() || !this.sfxBus || this._muted) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const last = this.lastPlay.get(id) ?? -1;
    if (now - last < r.gap) return;
    // drop finished voices in place (no per-call array allocation)
    let n = 0;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i]!;
      if (v.end > now) this.voices[n++] = v;
    }
    this.voices.length = n;
    if (this.voices.length >= MAX_VOICES) return;
    let same = 0;
    for (const v of this.voices) if (v.id === id) same++;
    if (same >= r.max) return;
    this.lastPlay.set(id, now);
    let out: AudioNode = this.sfxBus;
    const pan = opts?.pan ?? 0;
    if (pan !== 0 && typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.sfxBus);
      out = p;
    }
    // tiny deterministic pitch jitter keeps rapid-fire sounds from sounding mechanical
    const jitter = r.gap < 0.06 ? 1 + (((this.voices.length * 7 + same * 3) % 5) - 2) * 0.012 : 1;
    try {
      const end = playRecipe(ctx, out, r, now + 0.005, clamp01(opts?.volume ?? 1), (opts?.pitch ?? 1) * jitter);
      this.voices.push({ id, end });
    } catch {
      /* never let audio break gameplay */
    }
  }

  playMusic(id: MusicId | null, opts?: { fadeMs?: number; loop?: boolean }): void {
    const fadeMs = opts?.fadeMs ?? 800;
    if (id === null) {
      this.wanted = null;
      this.current?.stop(fadeMs / 1000);
      this.current = null;
      return;
    }
    const loop = opts?.loop ?? id !== "results";
    this.wanted = { id, fadeMs, loop };
    if (this.current && this.current.id === id) return;
    if (!this.running()) return; // starts on unlock()
    this.startMusic(id, fadeMs, loop);
  }

  private startMusic(id: MusicId, fadeMs: number, loop: boolean): void {
    if (!this.ctx || !this.musicBus) return;
    this.current?.stop(fadeMs / 1000);
    try {
      const p = new MusicPlayer(this.ctx, this.musicBus, id, loop);
      p.start(fadeMs / 1000);
      this.current = p;
    } catch (err) {
      console.warn("[audio] music failed", err);
      this.current = null;
    }
  }

  setMasterVolume(v: number): void {
    this.vol.master = clamp01(v);
    this.applyGains();
  }
  setMusicVolume(v: number): void {
    this.vol.music = clamp01(v);
    this.applyGains();
  }
  setSfxVolume(v: number): void {
    this.vol.sfx = clamp01(v);
    this.applyGains();
  }
  setMuted(m: boolean): void {
    this._muted = m;
    this.applyGains();
  }

  /** debug helper */
  get state(): string {
    return this.ctx ? this.ctx.state : "none";
  }
  get playing(): MusicId | null {
    return this.current?.id ?? null;
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

export function createSynthAudio(save: SaveService | null): AudioService {
  const s = new SynthAudio(save);
  services.push(s);
  s.installUnlockHooks();
  if (sharedCtx) s.attach(sharedCtx);
  return s;
}
