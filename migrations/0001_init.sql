-- SKY REAPER leaderboard schema (Cloudflare D1 / SQLite).
-- Apply: npm run db:migrate:local   |   npm run db:migrate:remote

CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 12),
  score      INTEGER NOT NULL CHECK (score >= 0),
  chapter    TEXT    NOT NULL CHECK (chapter IN ('pacific', 'jungle', 'desert', 'arctic', 'citadel', 'all')),
  time_sec   INTEGER NOT NULL CHECK (time_sec >= 0),
  kills      INTEGER NOT NULL CHECK (kills >= 0),
  medal      INTEGER NOT NULL DEFAULT 0 CHECK (medal BETWEEN 0 AND 4),
  created_at INTEGER NOT NULL -- unix epoch seconds
);

-- Leaderboard reads: top N per chapter, and top N overall.
CREATE INDEX IF NOT EXISTS idx_scores_chapter_score ON scores (chapter, score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score DESC, created_at ASC);

-- Fixed-window per-client rate limiting. `key` is a salted SHA-256 of the client IP
-- (raw IPs are never stored). Rows older than a day are pruned opportunistically.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT    NOT NULL,
  window_start INTEGER NOT NULL, -- unix epoch seconds, aligned to the window size
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);
