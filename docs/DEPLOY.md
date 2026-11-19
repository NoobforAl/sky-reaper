# Deploying SKY REAPER to Cloudflare

The game is a static Vite build served by **Workers Static Assets**. A small **Hono Worker** (`worker/index.ts`) answers
`/api/*` only, backed by a **D1** database for the optional leaderboard. Everything is configured in `wrangler.jsonc`.

```
request ──► /api/*  ──► Worker (Hono) ──► D1 "sky-reaper"
        └─► else    ──► static assets from dist/  (headers: public/_headers, unknown paths -> index.html)
```

## 0. Prerequisites

- Node.js 20+ and `npm install` done (wrangler is a dev dependency; use `npx wrangler ...`).
- A Cloudflare account (free plan is enough: Workers + D1 free tiers).

## 1. Log in

```bash
npx wrangler login        # opens a browser for OAuth
npx wrangler whoami       # confirm the account
```

CI / headless: instead of `login`, set `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers" + D1 edit permission)
and `CLOUDFLARE_ACCOUNT_ID` as environment variables. Never commit them.

## 2. Create the D1 database

```bash
npx wrangler d1 create sky-reaper
```

Copy the printed `database_id` into `wrangler.jsonc` -> `d1_databases[0].database_id`, replacing the placeholder
`00000000-0000-0000-0000-000000000000`. (Local development works with the placeholder.)

## 3. Apply migrations

```bash
npm run db:migrate:local    # local SQLite under .wrangler/ (for wrangler dev)
npm run db:migrate:remote   # the real D1 database
```

Migrations live in `migrations/` (`0001_init.sql`: `scores`, `rate_limits` + indexes). Add new ones as
`migrations/000N_name.sql` (or `npx wrangler d1 migrations create sky-reaper <name>`); never edit applied ones.

## 4. (Optional) secrets and vars

```bash
npx wrangler secret put RATE_LIMIT_SALT     # any random string; salts the IP hashes used for rate limiting
```

Optional plain vars (add a `"vars": { ... }` block in `wrangler.jsonc`):

| var | effect |
|---|---|
| `SUBMISSIONS: "off"` | reject new scores (503), leaderboard reads keep working |
| `ALLOWED_ORIGINS: "https://a.example,https://b.example"` | extra origins that may call the API from a browser (CORS). Same origin is always allowed |

**Hosting the game on another origin than the Worker.** Build the client with
`VITE_API_BASE=https://sky-reaper.<subdomain>.workers.dev npm run build` (origin only, no path) and list the game's origin in the
Worker's `ALLOWED_ORIGINS`. The Worker then answers the CORS preflight (`OPTIONS /api/score` -> 204 with
`Access-Control-Allow-Origin`, `-Methods: POST`, `-Headers: Content-Type`, `Max-Age: 86400`) and adds
`Access-Control-Allow-Origin` + `Vary: Origin` to every `/api/*` response for that origin. Origins not in the list get 403 on
POST and preflight, and no CORS headers on reads.

## 5. Deploy

```bash
npm run deploy     # = vite build (with tsc) + worker typecheck + wrangler deploy
```

Wrangler prints the `https://sky-reaper.<subdomain>.workers.dev` URL. Smoke test:

```bash
curl -s https://sky-reaper.<subdomain>.workers.dev/api/health
# {"ok":true,"db":"ok","time":"..."}
curl -sI https://sky-reaper.<subdomain>.workers.dev/ | grep -i cache-control     # no-cache
curl -s "https://sky-reaper.<subdomain>.workers.dev/api/leaderboard?chapter=pacific"
```

## 6. Custom domain

The domain's zone must be on Cloudflare. Either Dashboard -> Workers & Pages -> sky-reaper -> Settings -> Domains & Routes ->
Add -> Custom domain, or add to `wrangler.jsonc` and redeploy:

```jsonc
"routes": [{ "pattern": "sky.example.com", "custom_domain": true }]
```

Optionally set `"workers_dev": false` to serve only on the custom domain. The client calls the API on its own origin, so the game
should be loaded from the same host it posts to. To serve the game from another host, see "Hosting the game on another origin"
in section 4 (`VITE_API_BASE` + `ALLOWED_ORIGINS`).

Note: the 30 s edge cache for `/api/leaderboard` uses the Cache API, which only stores on custom domains; on `*.workers.dev` every
read hits D1 (still fine at this scale). Browsers additionally cache the response for 30 s (`Cache-Control: public, max-age=30`).

## 7. Local edge testing

```bash
npm run db:migrate:local
npm run dev:edge                      # build + wrangler dev on http://localhost:8787
curl -s localhost:8787/api/health
curl -s -X POST localhost:8787/api/score -H "Content-Type: application/json" -H "Origin: http://localhost:8787" \
  -d '{"name":"ACE","score":12000,"chapter":"pacific","timeSec":210,"kills":80,"medal":3}'
curl -s "localhost:8787/api/leaderboard?chapter=pacific"
```

Another port and a throwaway database: `npx wrangler d1 migrations apply sky-reaper --local --persist-to <dir>`, then
`npx wrangler dev --local --port <port> --persist-to <dir>` (add `--var ALLOWED_ORIGINS:https://x.example` to test CORS).

`npm run dev` (Vite) has no API: the client detects the non-JSON response and silently shows no online scores.

## Caching and headers

Defined in `public/_headers` (Vite copies it to `dist/`; the asset layer applies it):

| path | Cache-Control |
|---|---|
| `/assets/*.js`, `/assets/*.css` (Vite content-hashed output) | `public, max-age=31536000, immutable` |
| everything else incl. `/`, SPA fallback HTML, sprites, `manifest.json` | `no-cache` (revalidate via ETag) |
| `/api/leaderboard` | `public, max-age=30` |
| other `/api/*` | `no-store` |

Unknown non-API paths return `index.html` (`not_found_handling: "single-page-application"`). Unknown `/api/*` paths return JSON 404.

## API abuse protection (what it does and does not do)

- **Validation:** Zod schema (strict - unknown fields rejected), name sanitised to 1-12 chars of `A-Z 0-9 space - _ .`,
  integer score/kills, chapter enum `pacific|jungle|desert|arctic|citadel|all`, medal 0-4.
- **Body size:** at most 2048 bytes. A larger `Content-Length` is rejected (413) before anything is read; a non-numeric one
  gets 400. The body is then read as a stream with a byte counter and the read is cancelled at 2049 bytes (413), so chunked
  uploads without `Content-Length` or with a lying one are never buffered. The limit counts UTF-8 bytes, and invalid UTF-8 -> 400.
- **Plausibility:** score <= 1,000,000 per chapter (5,000,000 for `all`); minimum run time 30 s (150 s for `all`);
  score <= 50,000 + 2,500 x timeSec; kills <= 20 + 15 x timeSec. Implausible -> 422.
- **Origin check:** POST requires an `Origin` header equal to the site origin (then `Sec-Fetch-Site`, when sent, must be
  `same-origin`) or listed in `ALLOWED_ORIGINS` (then `same-site` / `cross-site`). See section 4 for the CORS behaviour.
- **Rate limit:** fixed window, **10 accepted submissions per 10 minutes per client** (`CF-Connecting-IP`, stored only as a
  salted SHA-256 prefix in D1). IPv4 addresses are bucketed per address; **IPv6 addresses per /64 prefix** (every IPv6
  subscriber controls at least a /64, so per-address keys would be unlimited); IPv4-mapped IPv6 counts as the IPv4 address.
  Over the limit -> 429 + `Retry-After`. Only requests that pass validation count (rejected requests cost no D1 write).
- **Health:** `/api/health` pings D1 at most once per 10 s per Worker isolate and reuses the result in between
  (`Cache-Control: no-store`, so the `time` field stays live).

### Leaderboard integrity: what to expect

The leaderboard is **client-trusted**. The game computes the score in the browser and posts the result; the Worker cannot
verify that a run happened. Concretely:

- The origin check only stops **browsers** on other sites. `curl` or any script can send any `Origin` / `Sec-Fetch-Site`.
- The plausibility bounds are generous on purpose (no false rejections of real runs): a script can post up to 1,000,000 for a
  chapter by claiming about 380 s of play (`50,000 + 2,500 x 380`). `medal` is not cross-checked against score thresholds.
- The rate limit slows one client down; it does not stop someone with many IPv4 addresses or many /64s, and it can throttle
  players who share one NAT address.
- Fixed windows allow a burst of up to 2x at a window boundary.

That is acceptable for a casual board. If cheating becomes a problem, in rising order of effort:
moderate entries (`npx wrangler d1 execute sky-reaper --remote --command "DELETE FROM scores WHERE id = <id>"`), add a
Cloudflare WAF rate-limiting rule or the Workers `ratelimit` binding on `/api/score`, add Turnstile before submission, or issue
a signed run token at chapter start (HMAC of chapter, seed and start time) and check the claimed `timeSec` against the
server-side elapsed time. None of these makes a client-side game fully cheat-proof; only server-side simulation would.

## Disabling online features

- **Keep the API, stop submissions:** set var `SUBMISSIONS = "off"` and redeploy.
- **No database at all:** remove the `d1_databases` block from `wrangler.jsonc`. The Worker still deploys; `/api/health`
  reports `"db":"missing"` and leaderboard calls return 503 - the game hides online scores and plays normally.
- **Client side:** build with `VITE_LEADERBOARD=off npm run build` (no network calls at all), or per browser
  `localStorage.setItem("sr_online", "off")`.
- **Static only (any host):** `npm run build` and upload `dist/` to any static host; the API calls fail silently.

## Troubleshooting

| symptom | fix |
|---|---|
| `You are not authenticated` | `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN`) |
| `database_id ... placeholder` / D1 not found on deploy | run step 2 and paste the real id |
| `/api/health` -> `"db":"error"` or leaderboard 500 `no such table: scores` | `npm run db:migrate:remote` (or `:local` for wrangler dev) |
| POST /api/score -> 403 `forbidden_origin` | request must come from the page's own origin or one in `ALLOWED_ORIGINS` (exact scheme + host + port, no path); curl needs `-H "Origin: <site origin>"` |
| Browser console: CORS error on `/api/*` from another host | add that page's origin to `ALLOWED_ORIGINS` and redeploy; build the client with `VITE_API_BASE` |
| POST -> 413 `body_too_large` / 400 `invalid_content_length` | body over 2048 bytes, or a malformed `Content-Length` header |
| POST -> 429 `rate_limited` | wait `Retry-After` seconds (10 per 10 min per IPv4 address or IPv6 /64) |
| POST -> 422 `implausible_score` | score/time/kills outside the bounds above (tune constants at the top of `worker/index.ts`) |
| Old JS after deploy | HTML is `no-cache`, hashed files are immutable - hard refresh once; check `curl -sI /` shows `no-cache` |
| Missing sprite returns HTML | expected with SPA fallback: unknown paths return `index.html`; check the file exists in `dist/` |
| `wrangler dev` port busy | `npx wrangler dev --port 8790` |
| Logs | Dashboard -> Workers -> sky-reaper -> Logs (observability enabled), or `npx wrangler tail` |
