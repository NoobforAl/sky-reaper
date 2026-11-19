/**
 * Runtime chiptune music. Every MusicId has a HAND-AUTHORED song: A and B sections (8 bars each) with their own
 * melody, chord progression and drum groove, arranged by `form` (e.g. "AABA"). Bass / arp / pad parts are
 * derived from the chords with the track's styles. (The older generative motif path is kept as a fallback for a
 * track without a `song`.)
 *
 * Melody notation: whitespace-separated tokens `deg:len` — `deg` is a scale degree relative to the tonic
 * (0 = tonic, 7 = octave up, negatives below; suffix `#`/`b` = chromatic), `len` in 16th steps (default 2);
 * `-:len` is a rest, `|` marks bar lines (ignored). Each section's melody is padded/truncated to its bars.
 * Original compositions — CC0, SKY REAPER project.
 */
import type { MusicId } from "../contracts";
import { noiseBuffer } from "./sfx";

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  mixo: [0, 2, 4, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harm: [0, 2, 3, 5, 7, 8, 11],
  phryg: [0, 1, 3, 5, 7, 8, 10],
};

type BassStyle = "root8" | "octave" | "gallop" | "pulse" | "sparse" | "walk" | "drone";
type Drum = "k" | "s" | "h" | "t" | "c" | "o";
const CLANK_FREQS = [523, 741] as const;

interface TrackDef {
  bpm: number;
  root: number; // midi of tonic (bass octave)
  scale: keyof typeof SCALES;
  /** chord root scale degree per bar */
  prog: number[];
  seed: number;
  lead: { wave: OscillatorType; vol: number; density: number; octave: number; range: number; legato?: number; vib?: number };
  harmony?: { wave: OscillatorType; vol: number; interval: number };
  arp?: { wave: OscillatorType; vol: number; octave: number; every: number; pattern: number[] };
  pad?: { wave: OscillatorType; vol: number };
  bass: { style: BassStyle; wave: OscillatorType; vol: number; cutoff: number };
  /** 16-char rows per instrument (x = hit, X = accent, . = rest); may be 32 chars for 2-bar grooves */
  drums: Partial<Record<Drum, string>>;
  drumVol: number;
  swing?: number;
  /** bars at the start of each loop where the lead rests (intro feel) */
  leadRestBars?: number;
  /** hand-authored arrangement (preferred over the generative motif path) */
  song?: Song;
}

interface Section {
  /** chord root scale degree per bar */
  prog: number[];
  /** melody (see notation in the header) */
  mel: string;
  /** optional groove override for this section */
  drums?: Partial<Record<Drum, string>>;
}
interface Song {
  /** order of sections, e.g. "AABA" */
  form: string;
  A: Section;
  B: Section;
}

const TRACKS: Record<MusicId, TrackDef> = {
  menu: {
    bpm: 104, root: 43, scale: "mixo", prog: [0, 6, 3, 0, 5, 3, 4, 4], seed: 11,
    lead: { wave: "square", vol: 0.11, density: 0.45, octave: 2, range: 7, legato: 0.9, vib: 0.006 },
    pad: { wave: "triangle", vol: 0.05 },
    bass: { style: "octave", wave: "triangle", vol: 0.28, cutoff: 900 },
    drums: { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
    drumVol: 0.45,
    song: {
      form: "AB",
      A: { prog: [0, 6, 3, 0, 5, 3, 4, 4], mel: "4:4 4:2 5:2 4:4 2:4 | 3:4 1:2 0:2 1:8 | 5:4 7:4 5:2 3:2 5:4 | 4:6 2:2 0:8 | 7:4 5:4 4:2 5:2 7:4 | 8:6 7:2 5:8 | 4:4 6:4 8:4 6:4 | 4:12 -:4" },
      B: { prog: [3, 3, 0, 0, 5, 5, 6, 4], mel: "7:8 8:4 7:4 | 5:16 | 4:8 2:4 4:4 | 7:16 | 9:8 8:4 7:4 | 5:12 -:4 | 6:8 5:4 3:4 | 4:16",
        drums: { k: "x.......x.x.....", s: "....x.......x...", h: "x.xxx.xxx.xxx.xx" } },
    },
  },
  pacific: {
    bpm: 128, root: 41, scale: "major", prog: [0, 3, 4, 0, 5, 3, 1, 4], seed: 21,
    lead: { wave: "square", vol: 0.11, density: 0.55, octave: 2, range: 8, legato: 0.85, vib: 0.005 },
    harmony: { wave: "square", vol: 0.05, interval: -2 },
    bass: { style: "root8", wave: "triangle", vol: 0.3, cutoff: 1000 },
    drums: { k: "x.......x.......", s: "....x..x....x.xx", h: "x.x.x.x.x.x.x.x.", t: "..............x." },
    drumVol: 0.5,
    song: {
      form: "AABA",
      A: { prog: [0, 3, 4, 0, 5, 3, 1, 4], mel: "0:3 0:1 4:4 4:3 5:1 4:4 | 3:3 3:1 5:4 7:6 5:2 | 4:3 4:1 6:4 8:4 6:4 | 7:8 4:4 -:4 | 9:3 9:1 7:4 5:4 7:4 | 10:6 9:2 7:8 | 8:3 7:1 5:4 3:4 1:4 | 4:2 5:2 6:2 7:2 8:8" },
      B: { prog: [5, 3, 0, 4, 5, 3, 4, 4], mel: "5:4 7:4 9:8 | 10:4 9:4 7:8 | 7:3 7:1 9:4 11:8 | 11:4 10:2 9:2 8:8 | 9:4 7:4 5:4 7:4 | 10:6 9:2 7:4 5:4 | 6:4 8:4 11:4 8:4 | 8:4 6:4 4:8",
        drums: { k: "x...x...x...x...", s: "....x.......x.x.", h: "xxxxxxxxxxxxxxxx", t: "..........x.x.x." } },
    },
  },
  jungle: {
    bpm: 112, root: 40, scale: "dorian", prog: [0, 0, 6, 6, 5, 5, 6, 4], seed: 31,
    lead: { wave: "square", vol: 0.09, density: 0.35, octave: 2, range: 6, legato: 0.6 },
    arp: { wave: "triangle", vol: 0.06, octave: 3, every: 2, pattern: [0, 2, 4, 2] },
    bass: { style: "sparse", wave: "sawtooth", vol: 0.2, cutoff: 500 },
    drums: { k: "x..x..x...x..x..", s: "....x.......x..x", h: "..x...x...x.x.x.", t: "x.....x.t...x.x.".replace(/t/g, "x") },
    drumVol: 0.55,
    song: {
      form: "AABA",
      A: { prog: [0, 0, 6, 6, 0, 0, 3, 4], mel: "-:4 4:2 -:2 3:2 2:2 0:4 | -:6 2:2 3:2 -:2 4:4 | -:4 6:2 -:2 8:3 6:1 5:4 | 6:8 -:8 | -:4 4:2 -:2 7:2 6:2 4:4 | 2:6 3:2 4:8 | 5:4 7:4 5:2 3:2 2:4 | 4:12 -:4" },
      B: { prog: [5, 5, 3, 3, 0, 0, 6, 4], mel: "9:4 8:2 7:2 5:8 | 7:4 9:4 11:8 | 10:6 8:2 7:4 5:4 | 7:16 | 4:4 2:4 4:4 7:4 | 8:8 7:4 4:4 | 6:4 8:4 10:4 8:4 | 11:12 -:4",
        drums: { k: "x..x..x.x..x..x.", s: "....x.......x..x", h: "x.xxx.xxx.xxx.xx", t: "x.x...x.x.x...x." } },
    },
  },
  desert: {
    bpm: 140, root: 38, scale: "harm", prog: [0, 0, 3, 4, 0, 5, 3, 4], seed: 41,
    lead: { wave: "square", vol: 0.1, density: 0.6, octave: 2, range: 9, legato: 0.8, vib: 0.008 },
    bass: { style: "gallop", wave: "sawtooth", vol: 0.2, cutoff: 700 },
    drums: { k: "x..x..x.x..x..x.", s: "....x.......x...", h: "xxxxxxxxxxxxxxxx" },
    drumVol: 0.5,
    song: {
      form: "AABA",
      A: { prog: [0, 0, 3, 4, 0, 5, 3, 4], mel: "0:2 0:2 2:2 4:2 7:4 6:2 7:2 | 8:2 7:2 6:2 4:2 5:4 4:4 | 5:4 3:2 5:2 7:4 5:4 | 6:6 4:2 1:4 -1:4 | 0:2 0:2 2:2 4:2 7:4 9:4 | 9:4 7:2 9:2 12:4 9:4 | 10:4 9:2 7:2 5:4 3:4 | 6:2 7:2 6:2 5:2 4:8" },
      B: { prog: [5, 3, 0, 4, 5, 3, 4, 4], mel: "7:8 9:8 | 10:8 8:4 7:4 | 7:4 4:4 2:4 4:4 | 6:12 4:4 | 9:8 12:8 | 10:6 9:2 7:8 | 6:4 8:4 11:4 8:4 | 6:4 4:4 1:8",
        drums: { k: "x.......x.......", s: "........x.......", h: "x.x.x.x.x.x.x.x.", t: "......x.......xx" } },
    },
  },
  arctic: {
    bpm: 92, root: 38, scale: "dorian", prog: [0, 3, 0, 6, 5, 3, 6, 4], seed: 51,
    lead: { wave: "triangle", vol: 0.13, density: 0.25, octave: 3, range: 7, legato: 1.4, vib: 0.01 },
    arp: { wave: "square", vol: 0.045, octave: 3, every: 1, pattern: [0, 2, 4, 7, 4, 2] },
    bass: { style: "drone", wave: "triangle", vol: 0.25, cutoff: 600 },
    drums: { k: "x...............", h: "........x.......", s: "............x..." },
    drumVol: 0.35,
    song: {
      form: "AB",
      A: { prog: [0, 3, 0, 6, 5, 3, 6, 4], mel: "-:16 | 3:8 5:4 7:4 | 4:12 2:4 | 6:8 8:8 | 9:8 7:4 5:4 | 7:16 | 6:4 8:4 10:8 | 8:12 -:4" },
      B: { prog: [5, 6, 0, 0, 3, 6, 4, 4], mel: "9:6 8:2 7:8 | 8:8 10:8 | 11:12 9:4 | 7:16 | 10:8 9:4 7:4 | 8:8 6:8 | 8:4 6:4 4:8 | 4:16",
        drums: { k: "x.......x.......", h: "....x.......x...", s: "............x..." } },
    },
  },
  citadel: {
    bpm: 132, root: 36, scale: "phryg", prog: [0, 0, 1, 0, 5, 5, 6, 1], seed: 61,
    lead: { wave: "sawtooth", vol: 0.07, density: 0.4, octave: 2, range: 6, legato: 0.5 },
    arp: { wave: "square", vol: 0.04, octave: 2, every: 1, pattern: [0, 0, 7, 0, 3, 0, 7, 5] },
    bass: { style: "pulse", wave: "sawtooth", vol: 0.24, cutoff: 450 },
    drums: { k: "x...x...x...x...", s: "....x.......x...", c: "..x...x...x.x.xx", h: "x.xxx.xxx.xxx.xx" },
    drumVol: 0.55,
    song: {
      form: "AABA",
      A: { prog: [0, 0, 1, 0, 5, 5, 6, 1], mel: "0:2 0:2 -:2 0:2 1:4 0:4 | 3:2 2:2 0:2 -:2 -1:4 0:4 | 1:4 3:4 5:4 3:4 | 0:12 -:4 | 5:2 5:2 -:2 5:2 7:4 5:4 | 4:4 2:4 0:4 2:4 | 6:4 4:4 3:4 1:4 | 1:8 0:8" },
      B: { prog: [5, 6, 0, 0, 5, 6, 1, 1], mel: "7:4 9:4 12:4 9:4 | 10:4 8:4 6:8 | 7:2 7:2 7:2 8:2 7:4 4:4 | 7:16 | 12:4 11:4 9:4 7:4 | 8:4 10:4 13:8 | 8:4 10:4 12:4 10:4 | 8:12 -:4",
        drums: { k: "x.x.x.x.x.x.x.x.", s: "....x.......x...", c: "x.x...x.x.x.x.xx", h: "xxxxxxxxxxxxxxxx" } },
    },
  },
  boss: {
    bpm: 152, root: 40, scale: "minor", prog: [0, 0, 5, 6, 0, 0, 3, 4], seed: 71,
    lead: { wave: "square", vol: 0.1, density: 0.7, octave: 2, range: 9, legato: 0.7 },
    harmony: { wave: "square", vol: 0.045, interval: 2 },
    bass: { style: "root8", wave: "sawtooth", vol: 0.22, cutoff: 800 },
    drums: { k: "x.x...x.x.x...x.", s: "....x.......x.xx", h: "xxxxxxxxxxxxxxxx", o: "x..............." },
    drumVol: 0.55,
    song: {
      form: "AABA",
      A: { prog: [0, 0, 5, 6, 0, 0, 3, 4], mel: "0:2 4:2 7:2 4:2 8:2 7:2 4:2 2:2 | 0:2 4:2 7:2 9:2 10:4 9:2 7:2 | 5:2 7:2 9:2 7:2 12:4 11:4 | 10:4 8:4 6:4 4:4 | 0:2 4:2 7:2 4:2 8:2 7:2 4:2 2:2 | 0:2 2:2 4:2 7:2 9:4 11:4 | 10:4 9:4 7:4 5:4 | 4:2 6:2 8:2 10:2 11:8" },
      B: { prog: [3, 3, 0, 0, 5, 6, 4, 4], mel: "10:8 12:8 | 14:6 12:2 10:8 | 11:8 9:4 7:4 | 7:16 | 12:8 11:4 9:4 | 13:8 10:8 | 11:4 13:4 15:4 13:4 | 11:8 8:4 6:4",
        drums: { k: "x...x...x...x...", s: "....x.......x.xx", h: "x.x.x.x.x.x.x.x.", o: "x.......x......." } },
    },
  },
  boss_final: {
    bpm: 164, root: 37, scale: "phryg", prog: [0, 1, 0, 6, 0, 1, 4, 3], seed: 81,
    lead: { wave: "sawtooth", vol: 0.08, density: 0.75, octave: 2, range: 10, legato: 0.6, vib: 0.01 },
    harmony: { wave: "square", vol: 0.05, interval: -3 },
    arp: { wave: "square", vol: 0.035, octave: 3, every: 1, pattern: [0, 4, 7, 4] },
    bass: { style: "gallop", wave: "sawtooth", vol: 0.24, cutoff: 650 },
    drums: { k: "x.xxx.x.x.xxx.x.", s: "....x.......x.xx", c: "x...x...x...x...", h: "xxxxxxxxxxxxxxxx" },
    drumVol: 0.55,
    song: {
      form: "AABA",
      A: { prog: [0, 1, 0, 6, 0, 1, 4, 3], mel: "0:2 0:2 1:2 0:2 7:4 6:2 7:2 | 8:4 7:2 5:2 3:4 1:4 | 0:2 0:2 1:2 0:2 7:4 9:2 7:2 | 6:4 8:4 10:4 13:4 | 14:2 13:2 12:2 10:2 8:4 7:4 | 8:2 10:2 12:2 10:2 8:8 | 4:4 6:4 8:4 11:4 | 10:4 8:4 5:4 3:4" },
      B: { prog: [5, 5, 6, 6, 0, 1, 4, 4], mel: "12:8 10:4 12:4 | 14:8 12:8 | 13:6 15:2 13:4 10:4 | 13:16 | 14:4 11:4 9:4 7:4 | 8:4 12:4 15:8 | 11:4 13:4 15:4 18:4 | 18:8 15:4 11:4",
        drums: { k: "x.x.x.x.x.x.x.x.", s: "....x.......x...", c: "x...x...x...x...", h: "xxxxxxxxxxxxxxxx", o: "x..............." } },
    },
  },
  results: {
    bpm: 96, root: 41, scale: "major", prog: [0, 3, 4, 0, 5, 3, 4, 0], seed: 91,
    lead: { wave: "square", vol: 0.1, density: 0.35, octave: 2, range: 6, legato: 1.1, vib: 0.007 },
    pad: { wave: "triangle", vol: 0.05 },
    bass: { style: "walk", wave: "triangle", vol: 0.27, cutoff: 900 },
    drums: { k: "x.......x.......", s: "....x.......x...", h: "x...x...x...x..." },
    drumVol: 0.35,
    song: {
      form: "AB",
      A: { prog: [0, 3, 4, 0, 5, 3, 4, 0], mel: "4:4 2:2 4:2 7:8 | 5:4 7:4 10:8 | 8:4 6:4 4:4 6:4 | 7:16 | 9:4 7:4 5:4 7:4 | 10:6 9:2 7:8 | 8:4 9:4 11:4 8:4 | 7:12 -:4" },
      B: { prog: [5, 1, 4, 0, 5, 3, 1, 4], mel: "9:8 7:8 | 8:6 7:2 5:8 | 6:4 8:4 11:8 | 9:4 7:4 4:8 | 12:8 11:4 9:4 | 10:8 7:8 | 8:4 7:4 5:4 3:4 | 4:8 6:4 8:4" },
    },
  },
};

interface NoteEv {
  inst: "lead" | "harm" | "bass" | "arp" | "pad" | Drum;
  midi: number;
  dur: number; // steps
  vol: number;
}

function rngOf(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** parse a melody string into [{ s, deg, semi, dur }] (deg null = rest), fitted to `steps` */
function parseMelody(mel: string, steps: number): Array<{ s: number; deg: number; semi: number; dur: number }> {
  const out: Array<{ s: number; deg: number; semi: number; dur: number }> = [];
  let s = 0;
  for (const tok of mel.split(/\s+/)) {
    if (!tok || tok === "|") continue;
    const [a, b] = tok.split(":");
    const dur = Math.max(1, Number(b ?? 2) || 2);
    if (a !== "-" && a) {
      const semi = a.endsWith("#") ? 1 : a.endsWith("b") ? -1 : 0;
      const deg = parseInt(a, 10);
      if (Number.isFinite(deg) && s < steps) out.push({ s, deg, semi, dur: Math.min(dur, steps - s) });
    }
    s += dur;
  }
  return out;
}

/** Hand-authored song: sections laid out by form; returns full progression, per-bar drum grooves and lead notes. */
function expandSong(d: TrackDef, song: Song) {
  const prog: number[] = [];
  const grooves: Array<Partial<Record<Drum, string>>> = [];
  const lead: Array<{ step: number; deg: number; semi: number; dur: number; strong: boolean }> = [];
  const sectionStarts: number[] = [];
  for (const key of song.form) {
    const sec = key === "B" ? song.B : song.A;
    const bar0 = prog.length;
    sectionStarts.push(bar0);
    for (const c of sec.prog) {
      prog.push(c);
      grooves.push(sec.drums ?? d.drums);
    }
    for (const n of parseMelody(sec.mel, sec.prog.length * 16)) lead.push({ step: bar0 * 16 + n.s, deg: n.deg, semi: n.semi, dur: n.dur, strong: n.s % 4 === 0 });
  }
  return { prog, grooves, lead, sectionStarts };
}

/** Compose a loop: returns events indexed by 16th step. */
function compose(d: TrackDef): { steps: number; events: NoteEv[][] } {
  const sc = SCALES[d.scale];
  const plan = d.song ? expandSong(d, d.song) : null;
  const progAll = plan ? plan.prog : d.prog;
  const bars = progAll.length;
  const steps = bars * 16;
  const events: NoteEv[][] = Array.from({ length: steps }, () => []);
  const deg2midi = (deg: number, oct: number) => d.root + 12 * oct + sc[((deg % 7) + 7) % 7]! + 12 * Math.floor(deg / 7);
  const r = rngOf(d.seed);

  // ---- motif generation (2 bars, offsets relative to chord root degree)
  const makeMotif = (density: number) => {
    const m: Array<{ s: number; off: number; dur: number }> = [];
    let off = [0, 2, 4][Math.floor(r() * 3)]!;
    for (let s = 0; s < 32; s++) {
      const strong = s % 8 === 0 ? 1 : s % 4 === 0 ? 0.75 : s % 2 === 0 ? 0.45 : 0.18;
      if (r() < density * strong * 1.4 || s === 0) {
        const step = r() < 0.6 ? (r() < 0.5 ? 1 : -1) : r() < 0.5 ? 2 : -2;
        off = Math.max(-2, Math.min(d.lead.range, off + step));
        if (s % 8 === 0) off = [0, 2, 4, 7][Math.floor(r() * 4)]!; // chord tones on strong beats
        m.push({ s, off, dur: 1 });
      }
    }
    for (let i = 0; i < m.length; i++) m[i]!.dur = (i + 1 < m.length ? m[i + 1]!.s : 32) - m[i]!.s;
    return m;
  };
  if (plan) {
    for (const n of plan.lead) {
      const midi = deg2midi(n.deg, d.lead.octave) + n.semi;
      events[n.step]!.push({ inst: "lead", midi, dur: n.dur, vol: n.strong ? 1 : 0.82 });
      if (d.harmony) events[n.step]!.push({ inst: "harm", midi: deg2midi(n.deg + d.harmony.interval, d.lead.octave) + n.semi, dur: n.dur, vol: 1 });
    }
  }
  const A = makeMotif(d.lead.density);
  const B = makeMotif(d.lead.density * 1.15);
  const phrase = [A, A, B, A];
  for (let p = 0; p < (plan ? 0 : bars / 2); p++) {
    if (p * 2 < (d.leadRestBars ?? 0)) continue;
    const motif = phrase[p % 4]!;
    const last = p === bars / 2 - 1;
    for (const n of motif) {
      const bar = p * 2 + Math.floor(n.s / 16);
      const chord = d.prog[bar]!;
      let off = n.off;
      if (p % 4 === 1 && n.s >= 24) off += 1; // variation in the answer phrase
      if (last && n.s >= 28) off = 0;
      const step = p * 32 + n.s;
      const dur = Math.max(1, Math.min(8, n.dur));
      events[step]!.push({ inst: "lead", midi: deg2midi(chord + off, d.lead.octave), dur, vol: n.s % 4 === 0 ? 1 : 0.8 });
      if (d.harmony) events[step]!.push({ inst: "harm", midi: deg2midi(chord + off + d.harmony.interval, d.lead.octave), dur, vol: 1 });
    }
  }

  // ---- bass
  for (let b = 0; b < bars; b++) {
    const c = progAll[b]!;
    const root = deg2midi(c, 0);
    const fifth = deg2midi(c + 4, 0);
    const put = (s: number, m: number, dur: number, v = 1) => events[b * 16 + s]!.push({ inst: "bass", midi: m, dur, vol: v });
    switch (d.bass.style) {
      case "root8":
        for (let s = 0; s < 16; s += 2) put(s, s === 12 ? fifth : root, 2, s % 4 === 0 ? 1 : 0.8);
        break;
      case "octave":
        for (let s = 0; s < 16; s += 2) put(s, s % 4 === 0 ? root : root + 12, 2);
        break;
      case "gallop":
        for (let s = 0; s < 16; s += 4) { put(s, root, 2); put(s + 2, root, 1, 0.8); put(s + 3, s === 12 ? fifth : root, 1, 0.8); }
        break;
      case "pulse":
        for (let s = 0; s < 16; s++) put(s, s % 8 === 6 ? root + 1 : root, 1, s % 4 === 0 ? 1 : 0.65);
        break;
      case "sparse":
        put(0, root, 3); put(3, root, 2, 0.8); put(6, fifth - 12 < root - 7 ? fifth : fifth - 12, 2, 0.8); put(10, root, 3); put(14, root + 12, 2, 0.7);
        break;
      case "walk":
        [0, 4, 8, 12].forEach((s, i) => put(s, deg2midi(c + [0, 2, 4, 5][i]!, 0), 4));
        break;
      case "drone":
        put(0, root, 14); put(14, fifth, 2, 0.6);
        break;
    }
    if (d.pad) for (const off of [0, 2, 4]) events[b * 16]!.push({ inst: "pad", midi: deg2midi(c + off, 2), dur: 16, vol: 1 });
    if (d.arp) {
      const pat = d.arp.pattern;
      for (let s = 0, i = 0; s < 16; s += d.arp.every, i++) events[b * 16 + s]!.push({ inst: "arp", midi: deg2midi(c + pat[i % pat.length]!, d.arp.octave), dur: d.arp.every, vol: 1 });
    }
  }

  // ---- drums (per-bar groove: sections may override the track's default groove)
  for (let b = 0; b < bars; b++) {
    const groove = plan ? plan.grooves[b]! : d.drums;
    for (const [k, row] of Object.entries(groove) as Array<[Drum, string]>) {
      for (let i = 0; i < 16; i++) {
        const s = b * 16 + i;
        const ch = row[s % row.length];
        if (ch === "x" || ch === "X") events[s]!.push({ inst: k, midi: 0, dur: 1, vol: ch === "X" || i === 0 ? 1 : 0.8 });
      }
    }
  }
  // fills: snare/tom roll into every section change (and the loop point), crash on each section downbeat
  const starts = plan ? plan.sectionStarts : [0];
  for (const bar0 of starts) {
    const end = (bar0 === 0 ? bars : bar0) * 16;
    for (let s = end - 4; s < end; s++) events[s]!.push({ inst: (s & 1) && plan ? "t" : "s", midi: 0, dur: 1, vol: 0.5 + (s - end + 4) * 0.15 });
    if (plan) events[bar0 * 16]!.push({ inst: "o", midi: 0, dur: 1, vol: 0.9 });
  }
  return { steps, events };
}

const composed = new Map<MusicId, { steps: number; events: NoteEv[][] }>();

/** One playing music track. Owns a gain node for crossfades. */
export class MusicPlayer {
  readonly gain: GainNode;
  private def: TrackDef;
  private song: { steps: number; events: NoteEv[][] };
  private step = 0;
  private next = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private stepDur: number;
  private filter: BiquadFilterNode;

  constructor(
    private ctx: AudioContext,
    out: AudioNode,
    readonly id: MusicId,
    private loop: boolean,
  ) {
    this.def = TRACKS[id];
    let s = composed.get(id);
    if (!s) {
      s = compose(this.def);
      composed.set(id, s);
    }
    this.song = s;
    this.stepDur = 60 / this.def.bpm / 4;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;
    this.gain.connect(out);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = this.def.bass.cutoff;
    this.filter.connect(this.gain);
  }

  start(fadeS: number): void {
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(0.0001, t);
    this.gain.gain.exponentialRampToValueAtTime(1, t + Math.max(0.02, fadeS));
    this.next = t + 0.06;
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  }

  stop(fadeS: number): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, fadeS));
    setTimeout(() => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      try {
        this.gain.disconnect();
      } catch {
        /* already gone */
      }
    }, fadeS * 1000 + 200);
  }

  private tick(): void {
    if (this.stopped) return;
    const ctx = this.ctx;
    // if the tab was throttled, don't try to catch up a backlog of notes
    if (this.next < ctx.currentTime - 0.25) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.12) {
      if (this.step >= this.song.steps) {
        if (!this.loop) {
          this.stop(0.5);
          return;
        }
        this.step = 0;
      }
      const sw = this.def.swing && this.step % 2 === 1 ? this.def.swing * this.stepDur : 0;
      for (const ev of this.song.events[this.step]!) this.play(ev, this.next + sw);
      this.step++;
      this.next += this.stepDur;
    }
  }

  private play(ev: NoteEv, t: number): void {
    const d = this.def;
    const dur = ev.dur * this.stepDur;
    switch (ev.inst) {
      case "lead":
        this.tone(d.lead.wave, mtof(ev.midi), t, dur * (d.lead.legato ?? 0.8), d.lead.vol * ev.vol, d.lead.vib ?? 0, this.gain);
        break;
      case "harm":
        if (d.harmony) this.tone(d.harmony.wave, mtof(ev.midi), t, dur * 0.8, d.harmony.vol * ev.vol, 0, this.gain);
        break;
      case "arp":
        if (d.arp) this.tone(d.arp.wave, mtof(ev.midi), t, Math.min(dur, this.stepDur * 1.5) * 0.9, d.arp.vol, 0, this.gain);
        break;
      case "pad":
        if (d.pad) this.tone(d.pad.wave, mtof(ev.midi), t, dur, d.pad.vol, 0.004, this.gain, 0.15);
        break;
      case "bass":
        this.tone(d.bass.wave, mtof(ev.midi), t, dur * 0.9, d.bass.vol * ev.vol, 0, this.filter);
        break;
      default:
        this.drum(ev.inst, t, d.drumVol * ev.vol);
    }
  }

  private tone(wave: OscillatorType, f: number, t: number, dur: number, vol: number, vib: number, out: AudioNode, attack = 0.005): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(f, t);
    if (vib > 0 && dur > 0.2) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = 5.5;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * vib, t + Math.min(0.3, dur));
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    const end = t + Math.max(0.03, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol * 0.8, Math.max(t + attack, end - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(end + 0.02);
  }

  private drum(k: Drum, t: number, vol: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.gain);
    if (k === "k" || k === "t") {
      const o = ctx.createOscillator();
      o.type = "sine";
      const f0 = k === "k" ? 140 : 220;
      const f1 = k === "k" ? 38 : 90;
      const len = k === "k" ? 0.16 : 0.18;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + len);
      g.gain.setValueAtTime(vol * (k === "k" ? 0.9 : 0.5), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g);
      o.start(t);
      o.stop(t + len + 0.02);
      return;
    }
    if (k === "c") {
      // industrial clank: detuned square ping
      for (const f of CLANK_FREQS) {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.setValueAtTime(f, t);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.06);
      }
      g.gain.setValueAtTime(vol * 0.09, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    const len = k === "s" ? 0.14 : k === "o" ? 0.5 : 0.035;
    if (k === "s") {
      f.type = "bandpass";
      f.frequency.value = 1800;
      f.Q.value = 0.8;
      g.gain.setValueAtTime(vol * 0.55, t);
    } else if (k === "o") {
      f.type = "highpass";
      f.frequency.value = 5000;
      g.gain.setValueAtTime(vol * 0.18, t);
    } else {
      f.type = "highpass";
      f.frequency.value = 7000;
      g.gain.setValueAtTime(vol * 0.16, t);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g);
    src.loop = true; // random offset into the 1.5 s buffer must never cut the hit short
    src.start(t, (t * 3.7) % 1);
    src.stop(t + len + 0.02);
  }
}

export const MUSIC_TRACKS = TRACKS;
