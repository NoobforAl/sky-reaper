#!/usr/bin/env node
/**
 * Pack the Vite build (dist/) into one ArvanCloud Edge Computing script (service-worker "fetch" style).
 *
 *   node scripts/arvan/build-bundle.mjs [distDir=dist] [out=dist-arvan/bundle.js]
 *   arvan ec deploy -f dist-arvan/bundle.js sky-reaper
 *
 * The bundle serves every file from memory with its content type, long immutable caching for hashed /assets/*,
 * no-cache for HTML, an SPA fallback to index.html, and a JSON 503 for /api/* (the online leaderboard is optional;
 * the game handles it being unavailable).
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, extname, dirname, resolve } from "node:path";

const distDir = resolve(process.argv[2] ?? "dist");
const outFile = resolve(process.argv[3] ?? "dist-arvan/bundle.js");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webmanifest": "application/manifest+json",
};
const TEXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".txt", ".svg", ".webmanifest"]);
const SKIP = new Set(["_headers", "_redirects"]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = {};
let raw = 0;
for (const abs of walk(distDir)) {
  const rel = "/" + relative(distDir, abs).split("\\").join("/");
  if (SKIP.has(rel.slice(1))) continue;
  const ext = extname(abs).toLowerCase();
  const buf = readFileSync(abs);
  raw += buf.length;
  const type = TYPES[ext] ?? "application/octet-stream";
  const isText = TEXT.has(ext);
  const immutable = rel.startsWith("/assets/") && /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(rel);
  const cache = ext === ".html" ? "no-cache" : immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600";
  files[rel] = isText ? { t: type, c: cache, s: buf.toString("utf8") } : { t: type, c: cache, b: buf.toString("base64") };
}
if (!files["/index.html"]) {
  console.error(`no index.html in ${distDir}; run vite build first`);
  process.exit(1);
}

const runtime = `
const FILES = ${JSON.stringify(files)};
const BIN = new Map();
function body(f) {
  if (f.s !== undefined) return f.s;
  let u = BIN.get(f);
  if (!u) {
    const bin = atob(f.b);
    u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    BIN.set(f, u);
  }
  return u;
}
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
};
function serve(f, method) {
  const h = new Headers(SECURITY);
  h.set("Content-Type", f.t);
  h.set("Cache-Control", f.c);
  return new Response(method === "HEAD" ? null : body(f), { status: 200, headers: h });
}
async function handle(request) {
  const url = new URL(request.url);
  let path = decodeURIComponent(url.pathname);
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (path.startsWith("/api/")) return json({ error: "leaderboard offline" }, 503);
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  if (path.startsWith("/api/")) return json({ error: "leaderboard offline" }, 503);
  if (path.endsWith("/")) path += "index.html";
  const f = FILES[path];
  if (f) return serve(f, request.method);
  // missing hashed asset -> real 404 (never serve HTML as JS); anything else -> SPA fallback
  if (path.startsWith("/assets/") || /\\.[a-z0-9]{2,5}$/i.test(path)) return new Response("Not Found", { status: 404 });
  return serve(FILES["/index.html"], request.method);
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
addEventListener("fetch", (event) => {
  event.respondWith(handle(event.request));
});
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, runtime);
const size = statSync(outFile).size;
console.log(
  `[arvan] ${Object.keys(files).length} files, ${(raw / 1024).toFixed(0)} KB raw -> ${outFile} (${(size / 1024).toFixed(0)} KB)`,
);
