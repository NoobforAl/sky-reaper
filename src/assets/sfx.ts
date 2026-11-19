/**
 * Runtime SFX synth: every SfxId is a tiny recipe of oscillator sweeps + filtered noise bursts.
 * Original sounds (CC0, SKY REAPER project). No samples are loaded.
 */
import type { SfxId } from "../contracts";

type Wave = OscillatorType;

interface ToneStep {
  kind: "tone";
  wave: Wave;
  f0: number;
  f1?: number;
  /** seconds */
  dur: number;
  vol?: number;
  delay?: number;
  attack?: number;
  /** exponential (default) or linear pitch glide */
  lin?: boolean;
  /** vibrato depth (ratio) and rate (Hz) */
  vib?: [number, number];
}
interface NoiseStep {
  kind: "noise";
  dur: number;
  vol?: number;
  delay?: number;
  /** filter cutoff start/end */
  f0: number;
  f1?: number;
  type?: BiquadFilterType;
  q?: number;
  attack?: number;
}
type Step = ToneStep | NoiseStep;

export interface SfxRecipe {
  steps: Step[];
  /** max simultaneous voices of this id */
  max: number;
  /** min seconds between triggers of this id */
  gap: number;
  vol: number;
}

const T = (wave: Wave, f0: number, f1: number | undefined, dur: number, o: Partial<ToneStep> = {}): ToneStep => ({ kind: "tone", wave, f0, f1, dur, ...o });
const N = (f0: number, f1: number | undefined, dur: number, o: Partial<NoiseStep> = {}): NoiseStep => ({ kind: "noise", f0, f1, dur, ...o });
const R = (steps: Step[], vol = 1, max = 4, gap = 0.02): SfxRecipe => ({ steps, vol, max, gap });

export const SFX: Record<SfxId, SfxRecipe> = {
  shot_vulcan: R([T("square", 1320, 560, 0.035, { vol: 0.28, attack: 0.001 }), T("triangle", 260, 110, 0.045, { vol: 0.3, attack: 0.001 }), N(8000, 3500, 0.018, { vol: 0.3, type: "highpass", attack: 0.001 })], 0.42, 4, 0.045),
  shot_spread: R([T("square", 880, 360, 0.06, { vol: 0.26, attack: 0.001 }), T("square", 1320, 540, 0.05, { vol: 0.12, attack: 0.001 }), T("triangle", 220, 90, 0.06, { vol: 0.3 }), N(6000, 2000, 0.03, { vol: 0.25, type: "highpass" })], 0.42, 3, 0.06),
  shot_laser: R([T("sawtooth", 1400, 200, 0.22, { vol: 0.35, vib: [0.03, 40] }), T("square", 700, 100, 0.2, { vol: 0.2 })], 0.5, 2, 0.08),
  shot_missile: R([N(1800, 500, 0.3, { vol: 0.5, type: "bandpass", q: 1.5 }), T("triangle", 220, 440, 0.25, { vol: 0.3 })], 0.5, 3, 0.06),
  bomb_drop: R([T("square", 1200, 300, 0.35, { vol: 0.25, lin: true }), N(800, 400, 0.1, { vol: 0.15 })], 0.5, 2, 0.08),
  bomb_explode: R([N(1300, 60, 0.75, { vol: 0.95, type: "lowpass" }), T("sine", 95, 26, 0.6, { vol: 1, attack: 0.001 }), N(5000, 1800, 0.04, { vol: 0.35, type: "highpass", attack: 0.001 }), N(600, 80, 0.6, { vol: 0.35, delay: 0.15 })], 0.85, 4, 0.05),
  rocket: R([N(2600, 600, 0.35, { vol: 0.55, type: "bandpass", q: 1 }), T("sawtooth", 140, 320, 0.2, { vol: 0.14 }), T("sine", 120, 60, 0.08, { vol: 0.4, attack: 0.001 })], 0.5, 3, 0.05),
  explode_s: R([N(2600, 220, 0.3, { vol: 0.75, type: "lowpass" }), T("sine", 150, 42, 0.2, { vol: 0.75, attack: 0.001 }), N(7000, 3000, 0.03, { vol: 0.3, type: "highpass", attack: 0.001 })], 0.55, 6, 0.03),
  explode_m: R([N(1800, 110, 0.55, { vol: 0.85, type: "lowpass" }), T("sine", 110, 32, 0.38, { vol: 0.95, attack: 0.001 }), T("triangle", 160, 50, 0.2, { vol: 0.35 }), N(6000, 2500, 0.04, { vol: 0.35, type: "highpass", attack: 0.001 })], 0.7, 5, 0.04),
  explode_l: R([N(1400, 50, 1.2, { vol: 0.95, type: "lowpass" }), T("sine", 80, 24, 0.85, { vol: 1, attack: 0.001 }), T("sine", 52, 30, 1.1, { vol: 0.6, delay: 0.05 }), N(5000, 1500, 0.05, { vol: 0.45, type: "highpass", attack: 0.001 }), N(3000, 300, 0.35, { vol: 0.35, delay: 0.1 }), N(500, 60, 1.0, { vol: 0.45, delay: 0.25, type: "lowpass" })], 0.9, 3, 0.06),
  hit: R([T("square", 620, 260, 0.035, { vol: 0.3, attack: 0.001 }), T("triangle", 180, 90, 0.04, { vol: 0.25 }), N(6000, 2500, 0.025, { vol: 0.22, type: "highpass" })], 0.4, 4, 0.03),
  hit_metal: R([T("square", 1800, 1600, 0.06, { vol: 0.25 }), T("triangle", 2700, 2500, 0.08, { vol: 0.2 })], 0.35, 3, 0.05),
  player_hit: R([T("sawtooth", 320, 80, 0.25, { vol: 0.5 }), T("sine", 120, 40, 0.2, { vol: 0.8, attack: 0.001 }), N(2400, 300, 0.2, { vol: 0.55 })], 0.8, 2, 0.1),
  player_die: R([T("sawtooth", 600, 40, 1.0, { vol: 0.5, lin: true }), N(1500, 60, 1.2, { vol: 1, type: "lowpass" }), T("sine", 80, 20, 1, { vol: 0.8 })], 1, 1, 0.3),
  shield_up: R([T("triangle", 300, 1200, 0.3, { vol: 0.5 }), T("sine", 600, 2400, 0.3, { vol: 0.25, delay: 0.05 })], 0.6, 1, 0.2),
  shield_hit: R([T("sine", 900, 300, 0.12, { vol: 0.5, vib: [0.08, 60] }), N(6000, 3000, 0.08, { vol: 0.2, type: "highpass" })], 0.55, 3, 0.05),
  pickup_coin: R([T("square", 988, undefined, 0.05, { vol: 0.3 }), T("square", 1319, undefined, 0.12, { vol: 0.3, delay: 0.05 })], 0.4, 4, 0.03),
  pickup_power: R([T("square", 523, undefined, 0.06, { vol: 0.3 }), T("square", 659, undefined, 0.06, { vol: 0.3, delay: 0.06 }), T("square", 784, undefined, 0.06, { vol: 0.3, delay: 0.12 }), T("square", 1047, undefined, 0.18, { vol: 0.3, delay: 0.18 })], 0.5, 2, 0.1),
  pickup_misc: R([T("triangle", 700, 1400, 0.12, { vol: 0.45 }), T("square", 1400, undefined, 0.1, { vol: 0.15, delay: 0.1 })], 0.5, 3, 0.05),
  flare: R([N(5000, 800, 0.6, { vol: 0.7, type: "bandpass", q: 0.8 }), T("sine", 1600, 400, 0.4, { vol: 0.25 })], 0.6, 1, 0.2),
  warning: R([T("square", 880, undefined, 0.12, { vol: 0.35 }), T("square", 660, undefined, 0.12, { vol: 0.35, delay: 0.15 }), T("square", 880, undefined, 0.12, { vol: 0.35, delay: 0.3 }), T("square", 660, undefined, 0.12, { vol: 0.35, delay: 0.45 })], 0.5, 1, 0.5),
  missile_launch: R([N(1000, 3000, 0.4, { vol: 0.6, type: "bandpass", q: 2 }), T("sawtooth", 200, 600, 0.35, { vol: 0.2 })], 0.55, 2, 0.1),
  lock_on: R([T("square", 1760, undefined, 0.05, { vol: 0.3 }), T("square", 1760, undefined, 0.05, { vol: 0.3, delay: 0.09 }), T("square", 2349, undefined, 0.12, { vol: 0.3, delay: 0.18 })], 0.4, 1, 0.3),
  boss_roar: R([T("sawtooth", 70, 50, 1.4, { vol: 0.7, vib: [0.06, 7] }), T("square", 105, 60, 1.3, { vol: 0.3, vib: [0.05, 5] }), N(400, 100, 1.4, { vol: 0.6, type: "lowpass" })], 0.9, 1, 1),
  boss_phase: R([T("sawtooth", 200, 800, 0.4, { vol: 0.4 }), T("square", 100, 400, 0.4, { vol: 0.3 }), N(1500, 100, 0.8, { vol: 0.8, delay: 0.3, type: "lowpass" })], 0.85, 1, 0.5),
  ui_move: R([T("square", 660, undefined, 0.035, { vol: 0.25 })], 0.35, 2, 0.03),
  ui_select: R([T("square", 784, undefined, 0.05, { vol: 0.3 }), T("square", 1175, undefined, 0.09, { vol: 0.3, delay: 0.05 })], 0.4, 2, 0.05),
  ui_back: R([T("square", 587, undefined, 0.05, { vol: 0.3 }), T("square", 392, undefined, 0.09, { vol: 0.3, delay: 0.05 })], 0.4, 2, 0.05),
  ui_buy: R([T("square", 1047, undefined, 0.05, { vol: 0.3 }), T("square", 1319, undefined, 0.05, { vol: 0.3, delay: 0.05 }), T("square", 1568, undefined, 0.05, { vol: 0.3, delay: 0.1 }), T("triangle", 2093, undefined, 0.2, { vol: 0.4, delay: 0.15 })], 0.45, 1, 0.1),
  ui_deny: R([T("square", 150, undefined, 0.09, { vol: 0.35 }), T("square", 110, undefined, 0.15, { vol: 0.35, delay: 0.1 })], 0.4, 1, 0.12),
  medal: R([0, 0.1, 0.2, 0.3].map((d, i) => T("square", [784, 988, 1175, 1568][i], undefined, i === 3 ? 0.5 : 0.1, { vol: 0.3, delay: d, vib: i === 3 ? [0.01, 6] : undefined })), 0.5, 1, 0.3),
  stage_clear: R(
    [
      T("square", 523, undefined, 0.14, { vol: 0.3 }),
      T("square", 523, undefined, 0.14, { vol: 0.3, delay: 0.16 }),
      T("square", 523, undefined, 0.14, { vol: 0.3, delay: 0.32 }),
      T("square", 698, undefined, 0.5, { vol: 0.3, delay: 0.5 }),
      T("square", 784, undefined, 0.3, { vol: 0.3, delay: 1.0 }),
      T("square", 1047, undefined, 0.8, { vol: 0.3, delay: 1.3, vib: [0.01, 6] }),
      T("triangle", 131, undefined, 0.5, { vol: 0.5, delay: 0.5 }),
      T("triangle", 175, undefined, 0.5, { vol: 0.5, delay: 1.0 }),
      T("triangle", 262, undefined, 0.8, { vol: 0.5, delay: 1.3 }),
    ],
    0.6,
    1,
    1,
  ),
};

let noiseBuf: AudioBuffer | null = null;
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 1.5);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  // deterministic LCG noise
  let s = 12345;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (s / 0x7fffffff) * 2 - 1;
  }
  noiseBuf = b;
  return b;
}

/** Schedule a recipe into `out`. Returns the end time (ctx seconds). */
export function playRecipe(ctx: AudioContext, out: AudioNode, r: SfxRecipe, t0: number, vol: number, pitch: number): number {
  let end = t0;
  for (const s of r.steps) {
    const st = t0 + (s.delay ?? 0);
    const et = st + s.dur;
    end = Math.max(end, et);
    const g = ctx.createGain();
    const v = Math.max(0.0001, (s.vol ?? 0.5) * vol * r.vol);
    const atk = s.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, st);
    g.gain.linearRampToValueAtTime(v, st + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, et);
    g.connect(out);
    if (s.kind === "tone") {
      const o = ctx.createOscillator();
      o.type = s.wave;
      const f0 = Math.max(20, s.f0 * pitch);
      o.frequency.setValueAtTime(f0, st);
      if (s.f1) {
        const f1 = Math.max(20, s.f1 * pitch);
        if (s.lin) o.frequency.linearRampToValueAtTime(f1, et);
        else o.frequency.exponentialRampToValueAtTime(f1, et);
      }
      if (s.vib) {
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = s.vib[1];
        lg.gain.value = f0 * s.vib[0];
        lfo.connect(lg).connect(o.frequency);
        lfo.start(st);
        lfo.stop(et + 0.02);
      }
      o.connect(g);
      o.start(st);
      o.stop(et + 0.02);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const f = ctx.createBiquadFilter();
      f.type = s.type ?? "lowpass";
      f.Q.value = s.q ?? 0.7;
      f.frequency.setValueAtTime(Math.max(30, s.f0 * pitch), st);
      if (s.f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, s.f1 * pitch), et);
      src.connect(f).connect(g);
      // loop the 1.5 s buffer: a random start offset must never cut a long tail (explode_l 1.2 s, player_die 1.2 s)
      src.loop = true;
      src.start(st, (st * 7.3) % 1);
      src.stop(et + 0.02);
    }
  }
  return end;
}
