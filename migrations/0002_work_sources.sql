-- 0002_work_sources.sql
-- Provenance for works imported from an external library (currently Bangumi).
-- Existing rows keep source = 'local' and external_id = NULL.

ALTER TABLE works ADD COLUMN source TEXT NOT NULL DEFAULT 'local';
ALTER TABLE works ADD COLUMN external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_works_source_external
  ON works (source, external_id)
  WHERE external_id IS NOT NULL;
