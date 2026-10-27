-- 0001_init.sql
-- Target schema for the new media tracker.
--
-- Status is intentionally NOT stored on works. The latest log (by per-work seq)
-- is the current state. See README.md sections 1-3.

CREATE TABLE IF NOT EXISTS works (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  creator         TEXT NOT NULL DEFAULT '',
  release_year    INTEGER,
  type            TEXT NOT NULL DEFAULT 'Book',
  total_progress  INTEGER NOT NULL DEFAULT 1 CHECK (total_progress >= 1),
  short_review    TEXT NOT NULL DEFAULT '',
  long_review_url TEXT NOT NULL DEFAULT '',
  added_at        INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  legacy_id       INTEGER,
  deleted_at      INTEGER
);

CREATE TABLE IF NOT EXISTS logs (
  id              TEXT PRIMARY KEY,
  work_id         TEXT NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
  seq             INTEGER NOT NULL CHECK (seq >= 1),
  event           TEXT NOT NULL CHECK (event IN ('progress', 'status', 'both')),
  status          TEXT NOT NULL CHECK (status IN ('wish', 'reading', 'done', 'paused', 'dropped')),
  progress        INTEGER NOT NULL CHECK (progress >= 0),
  total_snapshot  INTEGER NOT NULL CHECK (total_snapshot >= 1),
  round           INTEGER NOT NULL DEFAULT 1 CHECK (round >= 1),
  logged_on       TEXT NOT NULL,
  logged_at       INTEGER,
  source          TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'migration')),
  inferred        INTEGER NOT NULL DEFAULT 0 CHECK (inferred IN (0, 1)),
  created_at      INTEGER NOT NULL,
  UNIQUE (work_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_logs_work_seq
  ON logs (work_id, seq DESC);

CREATE INDEX IF NOT EXISTS idx_logs_work_status
  ON logs (work_id, status);

CREATE INDEX IF NOT EXISTS idx_logs_timeline
  ON logs (logged_on DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_works_deleted_at
  ON works (deleted_at);

CREATE INDEX IF NOT EXISTS idx_works_added_at
  ON works (added_at DESC);

CREATE TABLE IF NOT EXISTS import_batches (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  works_sha   TEXT NOT NULL,
  logs_sha    TEXT NOT NULL,
  works_count INTEGER NOT NULL,
  logs_count  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
