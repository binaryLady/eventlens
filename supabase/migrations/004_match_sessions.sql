-- Match sessions: track every photo-match query for analytics
-- No PII stored — only the face embedding vector (not the selfie image)

CREATE TABLE IF NOT EXISTS match_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tier TEXT NOT NULL,                         -- 'vector' | 'text' | 'visual' | 'both'
  match_count INT NOT NULL DEFAULT 0,
  top_confidence INT,                         -- highest confidence score in results
  query_embedding vector(512),                -- face embedding for re-matching (null for Gemini-only)
  matched_photo_ids TEXT[] DEFAULT '{}'        -- drive_file_ids of matched photos
);

-- Index for time-range analytics queries
CREATE INDEX idx_match_sessions_created ON match_sessions (created_at DESC);

-- Index for finding sessions that matched a specific photo
CREATE INDEX idx_match_sessions_photo_ids ON match_sessions USING GIN (matched_photo_ids);
