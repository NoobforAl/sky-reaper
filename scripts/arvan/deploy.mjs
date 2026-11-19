// Deploy dist-arvan/bundle.js to ArvanCloud Edge Computing through the HTTP API (the arvan CLI hides API errors).
// Key: ARVAN_KEY from the environment or from .env (gitignored). Never commit the key.
// Usage: node scripts/arvan/deploy.mjs [bundle=dist-arvan/bundle.js] [name=sky-reaper]
import { readFileSync, existsSync } from "node:fs";

const API = "https://napi.arvancloud.ir/edge-computing/v1";
const bundlePath = process.argv[2] || "dist-arvan/bundle.js";
const name = process.argv[3] || "sky-reaper";

let key = process.env.ARVAN_KEY;
if (!key && existsSync(".env")) key = readFileSync(".env", "utf8").match(/^ARVAN_KEY=\s*["']?([^"'\r\n]+)/m)?.[1];
if (!key) { console.error("[deploy] ARVAN_KEY is not set (env or .env)"); process.exit(1); }
key = key.trim().replace(/^apikey\s+/i, "");
const headers = { Authorization: `Apikey ${key}`, Accept: "application/json", "Content-Type": "application/json" };
const safe = (s) => String(s).split(key).join("<key>").slice(0, 600);

async function call(path, init = {}) {
  const r = await fetch(API + path, { headers, ...init });
  const text = await r.text();
  if (!r.ok) { console.error(`[deploy] ${init.method || "GET"} ${path} -> ${r.status}: ${safe(text)}`); process.exit(1); }
  return JSON.parse(text);
}

const apps = (await call("/edge-computes")).data || [];
const app = apps.find((a) => a.name === name);
if (!app) { console.error(`[deploy] app "${name}" not visible to this key (apps: ${apps.map((a) => a.name).join(", ") || "none"})`); process.exit(1); }

const code = readFileSync(bundlePath, "utf8");
const body = { name, bundled_code: code };
if (app.namespace) body.namespace = app.namespace;
await call("/edge-computes/deploy", { method: "POST", body: JSON.stringify(body) });
const dep = (await call(`/edge-computes/${app.id}/deployments`)).data?.[0];
const url = `https://${app.default_access_path}/`;
console.log(`[deploy] ${name}: ${(code.length / 1024).toFixed(0)} KB deployed (tag ${dep?.tag}) -> ${url}`);

// wait until the edge serves the new index.html
const want = readFileSync("dist/index.html", "utf8").match(/index-[\w-]+\.js/)?.[0];
for (let i = 0; i < 18 && want; i++) {
  const html = await (await fetch(`${url}?nc=${Date.now()}`, { cache: "no-store" })).text();
  if (html.includes(want)) { console.log(`[deploy] live: ${want}`); process.exit(0); }
  await new Promise((r) => setTimeout(r, 10000));
}
console.log("[deploy] deployed; the edge has not shown the new build yet (can take a few minutes)");
