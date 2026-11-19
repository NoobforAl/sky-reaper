/**
 * SKY REAPER edge Worker (Cloudflare Workers + Hono + D1).
 *
 * Routing (see wrangler.jsonc): only `/api/*` reaches this Worker (`run_worker_first`). Everything else is
 * served by the static-asset layer straight from `dist/` with headers from `public/_headers` and SPA
 * fallback (`not_found_handling: single-page-application`). The catch-all below is a safety net only.
 *
 * API
 *   GET  /api/health                         -> { ok, db: "ok" | "missing" | "error", time }   (DB ping memoised 10 s)
 *   GET  /api/leaderboard?chapter=&limit=    -> { chapter, entries: LeaderboardEntry[] }   (cached 30 s)
 *   POST /api/score  (JSON, body <= 2 KB)    -> { ok: true, id, rank }
 *
 * Origins: the page's own origin may always POST. Extra origins listed in ALLOWED_ORIGINS get real CORS
 * (OPTIONS preflight + Access-Control-Allow-Origin on every /api response); every other origin gets 403 on POST
 * and no CORS headers.
 *
 * Errors are always JSON `{ error: "<code>", message?: "<safe text>" }` and never contain internals.
 * The game works without this API (src/net/leaderboard.ts fails silently).
 */
import { Hono, type Context } from "hono";
import { z } from "zod";

export interface Env {
  ASSETS: Fetcher;
  /** D1 binding. Optional so the Worker still serves the game if the database is not configured. */
  DB?: D1Database;
  /** Optional secret used to salt IP hashes for rate limiting (`wrangler secret put RATE_LIMIT_SALT`). */
  RATE_LIMIT_SALT?: string;
  /** Optional comma-separated extra origins allowed to POST scores (e.g. "https://sky.example.com"). */
  ALLOWED_ORIGINS?: string;
  /** Set to "off" to disable score submission (reads keep working). */
  SUBMISSIONS?: string;
}

type C = Context<{ Bindings: Env }>;

// ------------------------------------------------------------------------------------------- constants

const CHAPTERS = ["pacific", "jungle", "desert", "arctic", "citadel", "all"] as const;
type Chapter = (typeof CHAPTERS)[number];

/** Hard ceiling per chapter ("all" = full-campaign total). Generous on purpose: ~50-100x a good run. */
const MAX_SCORE: Record<Chapter, number> = {
  pacific: 1_000_000,
  jungle: 1_000_000,
  desert: 1_000_000,
  arctic: 1_000_000,
  citadel: 1_000_000,
  all: 5_000_000,
};
/** Minimum plausible play time (s): a chapter is ~3-4 min of timeline + boss. */
const MIN_TIME: Record<Chapter, number> = {
  pacific: 30,
  jungle: 30,
  desert: 30,
  arctic: 30,
  citadel: 30,
  all: 150,
};
const MAX_TIME_SEC = 6 * 3600;
/** Score may not exceed FLAT + RATE * timeSec (boss bonus + lives + objectives fit inside FLAT). */
const SCORE_FLAT_ALLOWANCE = 50_000;
const SCORE_PER_SEC_MAX = 2_500;
const KILLS_PER_SEC_MAX = 15;

/** Fixed-window rate limit for POST /api/score, per client IP. */
const RL_WINDOW_SEC = 600;
const RL_MAX_PER_WINDOW = 10;

const LEADERBOARD_TTL_SEC = 30;
const LEADERBOARD_DEFAULT_LIMIT = 10;
const LEADERBOARD_MAX_LIMIT = 50;
const MAX_BODY_BYTES = 2048;
/** /api/health memoises its D1 ping per isolate for this long (it is polled by the client and by monitors). */
const HEALTH_TTL_MS = 10_000;
/** How long browsers may cache a CORS preflight answer. */
const CORS_MAX_AGE_SEC = 86_400;

// ------------------------------------------------------------------------------------------- helpers

function jsonError(c: C, status: 400 | 403 | 404 | 405 | 413 | 415 | 422 | 429 | 500 | 503, error: string, message?: string) {
  c.header("Cache-Control", "no-store");
  return c.json(message ? { error, message } : { error }, status);
}

/** Drop markup, uppercase, strip anything that isn't A-Z 0-9 space - _ . and collapse whitespace. */
function sanitizeName(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/<[^>]*>/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 _.\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12)
    .trim();
}

const scoreSchema = z
  .object({
    name: z.string().min(1).max(32),
    score: z.number().int().min(0).max(MAX_SCORE.all),
    chapter: z.enum(CHAPTERS),
    timeSec: z.number().min(0).max(MAX_TIME_SEC),
    kills: z.number().int().min(0).max(1_000_000),
    medal: z.number().int().min(0).max(4).default(0),
  })
  .strict();

type ScoreInput = z.infer<typeof scoreSchema>;

/** Returns a reason string when the submission is implausible, else null. */
function plausibility(s: ScoreInput): string | null {
  const t = Math.floor(s.timeSec);
  if (s.score > MAX_SCORE[s.chapter]) return "score above chapter maximum";
  if (t < MIN_TIME[s.chapter]) return "run too short";
  if (s.score > SCORE_FLAT_ALLOWANCE + SCORE_PER_SEC_MAX * t) return "score too high for play time";
  if (s.kills > 20 + KILLS_PER_SEC_MAX * t) return "kills too high for play time";
  if (s.medal > 0 && s.chapter !== "all" && s.score === 0) return "medal without score";
  return null;
}

/** The page's own origin plus the extra comma-separated ALLOWED_ORIGINS (trailing slashes ignored). */
function allowedOrigins(c: C): { self: string; extra: Set<string> } {
  const self = new URL(c.req.url).origin;
  const extra = new Set(
    (c.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter((s) => s && s !== self),
  );
  return { self, extra };
}

/** The request's Origin when it is one of the extra ALLOWED_ORIGINS (a legitimate cross-origin caller), else null. */
function corsOrigin(c: C): string | null {
  const origin = c.req.header("Origin");
  if (!origin) return null;
  return allowedOrigins(c).extra.has(origin) ? origin : null;
}

/**
 * POST gate. Same origin: `Origin` must equal the site origin and Fetch Metadata (when sent) must say same-origin.
 * Listed cross-origin callers: `Origin` must be in ALLOWED_ORIGINS (browsers then send same-site or cross-site).
 * This only stops *browsers* on other sites; scripts can forge both headers (see docs/DEPLOY.md).
 */
function isAllowedOrigin(c: C): boolean {
  const origin = c.req.header("Origin");
  if (!origin) return false;
  const { self, extra } = allowedOrigins(c);
  const site = c.req.header("Sec-Fetch-Site");
  if (origin === self) return !site || site === "same-origin";
  if (extra.has(origin)) return !site || site === "same-site" || site === "cross-site";
  return false;
}

/**
 * Rate-limit bucket for a client IP. IPv4 is kept whole. IPv6 is cut to its /64 prefix, because any IPv6 client
 * controls at least a /64 (2^64 addresses) and would otherwise get an unlimited number of buckets.
 * IPv4-mapped IPv6 (::ffff:a.b.c.d) is treated as the IPv4 address.
 */
function ipBucket(raw: string | undefined): string {
  const ip = (raw ?? "").trim().toLowerCase().replace(/%.*$/, ""); // drop a zone id, if any
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  const mapped = /^(?:0{0,4}:){0,4}:?(?:0{0,4}:)?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) return mapped[1];
  const halves = ip.split("::");
  if (halves.length > 2) return ip; // malformed: bucket as-is
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  // An embedded dotted IPv4 tail occupies two hextets.
  const width = (parts: string[]) => parts.reduce((n, p) => n + (p.includes(".") ? 2 : 1), 0);
  const fill = halves.length === 2 ? Math.max(0, 8 - width(head) - width(tail)) : 0;
  const full = [...head, ...Array<string>(fill).fill("0"), ...tail];
  const hextets = full.slice(0, 4).map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? h.replace(/^0+(?=.)/, "") : "x"));
  while (hextets.length < 4) hextets.push("0");
  return `${hextets.join(":")}::/64`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Increments the caller's counter for the current window. Returns true when the request is allowed. */
async function rateLimit(c: C, db: D1Database): Promise<{ ok: boolean; retryAfter: number }> {
  const bucket = ipBucket(c.req.header("CF-Connecting-IP"));
  const key = (await sha256Hex(`${c.env.RATE_LIMIT_SALT ?? "sky-reaper"}|${bucket}`)).slice(0, 32);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RL_WINDOW_SEC);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  // Opportunistic cleanup (~2 % of submissions), off the response path.
  if (Math.random() < 0.02) {
    c.executionCtx.waitUntil(
      db.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(now - 86_400).run().catch(() => undefined),
    );
  }
  return { ok: (row?.count ?? 1) <= RL_MAX_PER_WINDOW, retryAfter: windowStart + RL_WINDOW_SEC - now };
}

/**
 * Reads the request body as UTF-8 while counting bytes, and stops as soon as it exceeds `max`, so the rest of a
 * huge or endless chunked upload is never buffered. Returns null when the body is too large; throws on non-UTF-8.
 */
async function readBodyLimited(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    buf.set(ch, off);
    off += ch.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buf);
}

function leaderboardCacheKey(url: URL, chapter: string, limit: number): Request {
  return new Request(`${url.origin}/api/leaderboard?chapter=${chapter}&limit=${limit}`, { method: "GET" });
}

function cacheOrNull(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------- app

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  // CORS only for the extra ALLOWED_ORIGINS (same-origin needs none). `Vary: Origin` so browser / shared caches
  // never serve one origin's answer to another.
  c.header("Vary", "Origin", { append: true });
  const origin = corsOrigin(c);
  if (origin) c.header("Access-Control-Allow-Origin", origin);
});

/** CORS preflight. POST /api/score needs one (JSON content type); GETs are simple requests. */
app.options("/api/*", (c) => {
  if (!corsOrigin(c)) return jsonError(c, 403, "forbidden_origin");
  const path = new URL(c.req.url).pathname;
  c.header("Access-Control-Allow-Methods", path === "/api/score" ? "POST" : "GET");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  c.header("Access-Control-Max-Age", String(CORS_MAX_AGE_SEC));
  c.header("Cache-Control", "no-store");
  return c.body(null, 204);
});

/** Per-isolate memo of the last D1 ping, so clients / monitors polling /api/health do not hit D1 every time. */
let healthMemo: { at: number; db: "ok" | "error" } | null = null;

app.get("/api/health", async (c) => {
  let db: "ok" | "missing" | "error" = "missing";
  if (c.env.DB) {
    const now = Date.now();
    if (healthMemo && now - healthMemo.at < HEALTH_TTL_MS) {
      db = healthMemo.db;
    } else {
      try {
        await c.env.DB.prepare("SELECT 1 AS one").first();
        db = "ok";
      } catch {
        db = "error";
      }
      healthMemo = { at: now, db };
    }
  }
  c.header("Cache-Control", "no-store");
  return c.json({ ok: true, db, time: new Date().toISOString() });
});

const leaderboardQuery = z.object({
  chapter: z.enum(CHAPTERS).optional(),
  limit: z.coerce.number().int().min(1).max(LEADERBOARD_MAX_LIMIT).optional(),
});

app.get("/api/leaderboard", async (c) => {
  const parsed = leaderboardQuery.safeParse({
    chapter: c.req.query("chapter") || undefined,
    limit: c.req.query("limit") || undefined,
  });
  if (!parsed.success) return jsonError(c, 400, "bad_query", "chapter must be one of " + CHAPTERS.join("|") + "; limit 1-50");
  const db = c.env.DB;
  if (!db) return jsonError(c, 503, "leaderboard_unavailable");

  const chapter = parsed.data.chapter ?? "any";
  const limit = parsed.data.limit ?? LEADERBOARD_DEFAULT_LIMIT;
  const url = new URL(c.req.url);
  const cache = cacheOrNull();
  const key = leaderboardCacheKey(url, chapter, limit);
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return hit;
  }

  const stmt =
    chapter === "any"
      ? db.prepare(
          "SELECT name, score, chapter, time_sec, kills, medal, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT ?1",
        ).bind(limit)
      : db.prepare(
          "SELECT name, score, chapter, time_sec, kills, medal, created_at FROM scores WHERE chapter = ?1 ORDER BY score DESC, created_at ASC LIMIT ?2",
        ).bind(chapter, limit);
  const { results } = await stmt.all<{
    name: string;
    score: number;
    chapter: Chapter;
    time_sec: number;
    kills: number;
    medal: number;
    created_at: number;
  }>();

  const entries = (results ?? []).map((r, i) => ({
    rank: i + 1,
    name: r.name,
    score: r.score,
    chapter: r.chapter,
    timeSec: r.time_sec,
    kills: r.kills,
    medal: r.medal,
    date: new Date(r.created_at * 1000).toISOString(),
  }));

  const res = new Response(JSON.stringify({ chapter, entries }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${LEADERBOARD_TTL_SEC}`,
    },
  });
  if (cache) c.executionCtx.waitUntil(cache.put(key, res.clone()).catch(() => undefined));
  return res;
});

app.post("/api/score", async (c) => {
  if (!isAllowedOrigin(c)) return jsonError(c, 403, "forbidden_origin");
  if (c.env.SUBMISSIONS === "off") return jsonError(c, 503, "submissions_disabled");
  const db = c.env.DB;
  if (!db) return jsonError(c, 503, "leaderboard_unavailable");

  const ctype = c.req.header("Content-Type") ?? "";
  if (!ctype.toLowerCase().startsWith("application/json")) return jsonError(c, 415, "json_required");
  // Reject a declared oversize body before reading anything, then stream-read with a byte cap. The cap also
  // covers chunked uploads without Content-Length and Content-Length values that lie.
  const lenHeader = c.req.header("Content-Length");
  if (lenHeader !== undefined) {
    if (!/^\s*\d+\s*$/.test(lenHeader)) return jsonError(c, 400, "invalid_content_length");
    if (Number(lenHeader) > MAX_BODY_BYTES) return jsonError(c, 413, "body_too_large");
  }
  let text: string | null;
  try {
    text = await readBodyLimited(c.req.raw, MAX_BODY_BYTES);
  } catch {
    return jsonError(c, 400, "invalid_body"); // not UTF-8, or the stream broke
  }
  if (text === null) return jsonError(c, 413, "body_too_large");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonError(c, 400, "invalid_json");
  }
  const parsed = scoreSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((i) => (i.code === "unrecognized_keys" ? "unknown_keys" : String(i.path[0] ?? "body")))),
    ].join(", ");
    return jsonError(c, 400, "invalid_fields", fields);
  }
  const entry = parsed.data;
  const name = sanitizeName(entry.name);
  if (name.length < 1) return jsonError(c, 400, "invalid_fields", "name");
  const why = plausibility(entry);
  if (why) return jsonError(c, 422, "implausible_score", why);

  const rl = await rateLimit(c, db);
  if (!rl.ok) {
    c.header("Retry-After", String(rl.retryAfter));
    return jsonError(c, 429, "rate_limited", `try again in ${rl.retryAfter}s`);
  }

  const now = Math.floor(Date.now() / 1000);
  const inserted = await db
    .prepare(
      "INSERT INTO scores (name, score, chapter, time_sec, kills, medal, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id",
    )
    .bind(name, entry.score, entry.chapter, Math.floor(entry.timeSec), entry.kills, entry.medal, now)
    .first<{ id: number }>();
  const better = await db
    .prepare("SELECT COUNT(*) AS n FROM scores WHERE chapter = ?1 AND score > ?2")
    .bind(entry.chapter, entry.score)
    .first<{ n: number }>();

  // Drop this colo's cached default board for the chapter so the player sees their entry soon.
  const cache = cacheOrNull();
  if (cache) {
    const url = new URL(c.req.url);
    c.executionCtx.waitUntil(
      Promise.all([
        cache.delete(leaderboardCacheKey(url, entry.chapter, LEADERBOARD_DEFAULT_LIMIT)),
        cache.delete(leaderboardCacheKey(url, "any", LEADERBOARD_DEFAULT_LIMIT)),
      ]).catch(() => undefined),
    );
  }

  return c.json({ ok: true, id: inserted?.id ?? null, rank: (better?.n ?? 0) + 1, name }, 201);
});

app.all("/api/*", (c) => {
  const known = ["/api/health", "/api/leaderboard", "/api/score"];
  if (known.includes(new URL(c.req.url).pathname)) return jsonError(c, 405, "method_not_allowed");
  return jsonError(c, 404, "not_found");
});

// Safety net: non-API requests normally never reach the Worker (run_worker_first: ["/api/*"]).
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  console.error("unhandled", err instanceof Error ? err.message : String(err));
  return jsonError(c, 500, "internal_error");
});

export default app;
