# Architecture addendum - online leaderboard (`src/net`)

Owner: DevOps. Client: `src/net/leaderboard.ts`. Server: `worker/index.ts` (Hono on Cloudflare Workers) + D1 (`migrations/`).

## Client API

```ts
import { submitScore, fetchLeaderboard, isLeaderboardOnline, isOnlineEnabled } from "../net/leaderboard";

// After a chapter ends (results scene). Fire-and-forget is fine; never await it on the critical path.
submitScore({ name: "ACE", score: stats.score, chapter: "pacific", timeSec: stats.timeSec, kills: stats.kills, medal })
  .then((r) => { if (r) showToast(`Online rank #${r.rank}`); });          // r === null -> offline/rejected: show nothing

// Leaderboard screen
const rows = await fetchLeaderboard("pacific", 10);   // [] when offline
const all  = await fetchLeaderboard();                 // every chapter mixed
```

| function | returns | failure |
|---|---|---|
| `submitScore(entry, timeoutMs = 4000)` | `{ id, rank, name }` (name as stored, sanitised/uppercased) | `null` |
| `fetchLeaderboard(chapter?, limit = 10, timeoutMs = 4000)` | `LeaderboardEntry[]` (`rank, name, score, chapter, timeSec, kills, medal, date`) | `[]` |
| `isLeaderboardOnline(timeoutMs = 2500)` | `true` when Worker and D1 answer | `false` |
| `isOnlineEnabled()` | `false` if built with `VITE_LEADERBOARD=off` or `localStorage.sr_online === "off"` | - |

Guarantees: never throws, never retries, aborts after the timeout, ignores non-JSON responses (so the Vite dev server's
HTML fallback reads as "offline"). Same-origin `/api/...` paths only.

`chapter` is a `ChapterId` or `"all"` (full-campaign total). `medal` is 0-4 (none, bronze, silver, gold, ace) as in `ChapterRecord`.

## Server rules the client must respect

- name 1-12 chars after sanitising (`A-Z 0-9 space - _ .`; markup stripped; uppercased). Send up to 32, server trims.
- `score`, `kills` integers >= 0; `timeSec` >= 30 for a chapter (150 for `all`); score <= 50,000 + 2,500 x timeSec.
- 10 accepted submissions per 10 minutes per IP; extra ones resolve to `null`.

## Suggested UI wiring (UI agent's call)

- Results scene: on victory, call `submitScore` with the pilot name from settings (or "PILOT") and show the rank if it returns.
- A leaderboard panel per chapter calling `fetchLeaderboard(chapterId)`; show "Offline" when it resolves `[]` and
  `isLeaderboardOnline()` is false.
