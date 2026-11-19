// Minimal deterministic PNG encoder/decoder (RGBA8 or lossless indexed, no external deps). Part of the SKY REAPER art pipeline.
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Filter one scanline set with PNG filter types; `mode` "none" = type 0 everywhere, "adaptive" = per-row minimum
 *  sum of absolute signed residuals (the libpng heuristic). `bpp` = bytes per complete pixel (>= 1). */
function filterRows(rows, stride, bpp, mode) {
  const h = rows.length;
  const out = Buffer.alloc((stride + 1) * h);
  const zero = new Uint8Array(stride);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < h; y++) {
    const cur = rows[y], prev = y ? rows[y - 1] : zero;
    let best = 0;
    if (mode === "adaptive") {
      let bestSum = Infinity;
      for (let f = 0; f < 5; f++) {
        const c = cand[f];
        let sum = 0;
        for (let i = 0; i < stride; i++) {
          const x = cur[i], a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], cc = i >= bpp ? prev[i - bpp] : 0;
          let p;
          if (f === 0) p = 0;
          else if (f === 1) p = a;
          else if (f === 2) p = b;
          else if (f === 3) p = (a + b) >> 1;
          else {
            const pp = a + b - cc, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - cc);
            p = pa <= pb && pa <= pc ? a : pb <= pc ? b : cc;
          }
          const v = (x - p) & 0xff;
          c[i] = v;
          sum += v < 128 ? v : 256 - v;
        }
        if (sum < bestSum) { bestSum = sum; best = f; }
      }
      out[y * (stride + 1)] = best;
      out.set(cand[best], y * (stride + 1) + 1);
    } else {
      out[y * (stride + 1)] = 0;
      out.set(cur, y * (stride + 1) + 1);
    }
  }
  return out;
}

const deflate = (raw) => zlib.deflateSync(raw, { level: 9, memLevel: 9 });

/** Encode RGBA pixels (Uint8Array/Uint8ClampedArray, length w*h*4) to a PNG buffer.
 *  Lossless: when the image has <= 256 distinct RGBA values it is also tried as an indexed PNG (PLTE + tRNS, bit depth
 *  1/2/4/8 by palette size), each layout with filter-none and adaptive filters, and the smallest file wins. Decoded
 *  pixels are bit-identical to the input either way. */
export function encodePNG(w, h, rgba) {
  const candidates = [];
  // truecolour RGBA
  {
    const stride = w * 4;
    const rows = [];
    for (let y = 0; y < h; y++) rows.push(Uint8Array.from(rgba.subarray(y * stride, (y + 1) * stride)));
    for (const mode of ["none", "adaptive"]) candidates.push({ ct: 6, bd: 8, idat: deflate(filterRows(rows, stride, 4, mode)) });
  }
  // indexed
  const index = new Map();
  const idx = new Uint8Array(w * h);
  let ok = true;
  for (let i = 0; i < w * h; i++) {
    const k = ((rgba[i * 4] << 24) | (rgba[i * 4 + 1] << 16) | (rgba[i * 4 + 2] << 8) | rgba[i * 4 + 3]) >>> 0;
    let v = index.get(k);
    if (v === undefined) {
      if (index.size >= 256) { ok = false; break; }
      v = index.size;
      index.set(k, v);
    }
    idx[i] = v;
  }
  let plte = null, trns = null;
  if (ok) {
    // translucent entries first so tRNS can be truncated after the last one
    const keys = [...index.keys()];
    const order = keys.map((k, i) => i).sort((p, q) => ((keys[p] & 255) === 255) - ((keys[q] & 255) === 255) || p - q);
    const remap = new Uint8Array(keys.length);
    order.forEach((old, ni) => (remap[old] = ni));
    for (let i = 0; i < idx.length; i++) idx[i] = remap[idx[i]];
    plte = Buffer.alloc(keys.length * 3);
    let lastT = -1;
    const alpha = [];
    order.forEach((old, ni) => {
      const k = keys[old];
      plte[ni * 3] = k >>> 24;
      plte[ni * 3 + 1] = (k >>> 16) & 255;
      plte[ni * 3 + 2] = (k >>> 8) & 255;
      alpha.push(k & 255);
      if ((k & 255) !== 255) lastT = ni;
    });
    trns = lastT >= 0 ? Buffer.from(alpha.slice(0, lastT + 1)) : null;
    const n = keys.length;
    const bd = n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8;
    const ppb = 8 / bd;
    const stride = Math.ceil(w / ppb);
    const rows = [];
    for (let y = 0; y < h; y++) {
      const r = new Uint8Array(stride);
      for (let x = 0; x < w; x++) r[Math.floor(x / ppb)] |= idx[y * w + x] << (8 - bd * (1 + (x % ppb)));
      rows.push(r);
    }
    for (const mode of ["none", "adaptive"]) candidates.push({ ct: 3, bd, idat: deflate(filterRows(rows, stride, 1, mode)) });
  }
  const size = (c) => c.idat.length + (c.ct === 3 ? plte.length + 12 + (trns ? trns.length + 12 : 0) : 0);
  let best = candidates[0];
  for (const c of candidates) if (size(c) < size(best)) best = c;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = best.bd;
  ihdr[9] = best.ct;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr)];
  if (best.ct === 3) {
    parts.push(chunk("PLTE", plte));
    if (trns) parts.push(chunk("tRNS", trns));
  }
  parts.push(chunk("IDAT", best.idat), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** Decode an 8-bit RGBA or RGB non-interlaced PNG (enough for merging simple packs). */
export function decodePNG(buf) {
  let p = 8;
  let w = 0, h = 0, ct = 0, bd = 0;
  const idats = [];
  let palette = null, trns = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bd = data[8];
      ct = data[9];
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idats.push(data);
    p += 12 + len;
  }
  if (bd !== 8 && !(ct === 3 && (bd === 1 || bd === 2 || bd === 4))) throw new Error("decodePNG: only 8-bit (or low-depth indexed) PNGs supported");
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 3 ? 1 : ct === 4 ? 2 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const stride = bd < 8 ? Math.ceil((w * bd) / 8) : w * bpp;
  const out = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = x;
      if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ct === 6) out.set(cur.subarray(x * 4, x * 4 + 4), o);
      else if (ct === 2) { out[o] = cur[x * 3]; out[o + 1] = cur[x * 3 + 1]; out[o + 2] = cur[x * 3 + 2]; out[o + 3] = 255; }
      else if (ct === 3) {
        const idx = bd < 8 ? (cur[Math.floor((x * bd) / 8)] >> (8 - bd - ((x * bd) % 8))) & ((1 << bd) - 1) : cur[x];
        out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2];
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (ct === 4) { out[o] = out[o + 1] = out[o + 2] = cur[x * 2]; out[o + 3] = cur[x * 2 + 1]; }
      else { out[o] = out[o + 1] = out[o + 2] = cur[x]; out[o + 3] = 255; }
    }
    prev.set(cur);
  }
  return { w, h, data: out };
}
