-- Auto-tag column for thematic album clustering
-- Stores a single text tag per photo (e.g., "Stage & Keynotes", "Networking")
-- @TheTechMargin 2026

ALTER TABLE photos ADD COLUMN IF NOT EXISTS auto_tag text;

CREATE INDEX IF NOT EXISTS idx_photos_auto_tag
  ON photos (auto_tag) WHERE auto_tag IS NOT NULL;
