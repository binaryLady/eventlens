-- Analytics RPC functions for the match_sessions table
-- Surfaces activity ticker, hot photos, operative counts, smart retry, and recommendations

-- 1. Recent match activity for the ticker
CREATE OR REPLACE FUNCTION get_recent_match_activity(
  hours_back INT DEFAULT 24,
  max_results INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  tier TEXT,
  match_count INT,
  top_confidence INT
)
LANGUAGE sql STABLE
AS $$
  SELECT ms.id, ms.created_at, ms.tier, ms.match_count, ms.top_confidence
  FROM match_sessions ms
  WHERE ms.created_at > now() - make_interval(hours => hours_back)
  ORDER BY ms.created_at DESC
  LIMIT max_results;
$$;

-- 2. Most-matched photo IDs (hot photos)
CREATE OR REPLACE FUNCTION get_hot_photo_ids(
  top_n INT DEFAULT 10,
  hours_back INT DEFAULT 168
)
RETURNS TABLE (
  photo_id TEXT,
  match_hit_count BIGINT
)
LANGUAGE sql STABLE
AS $$
  SELECT pid AS photo_id, count(*) AS match_hit_count
  FROM match_sessions ms, unnest(ms.matched_photo_ids) AS pid
  WHERE ms.created_at > now() - make_interval(hours => hours_back)
    AND ms.match_count > 0
  GROUP BY pid
  ORDER BY match_hit_count DESC
  LIMIT top_n;
$$;

-- 3. Unique operatives count (sessions with embeddings = distinct face scans)
CREATE OR REPLACE FUNCTION get_unique_operatives_count()
RETURNS BIGINT
LANGUAGE sql STABLE
AS $$
  SELECT count(*) FROM match_sessions WHERE query_embedding IS NOT NULL;
$$;

-- 4. Find similar past sessions by face embedding (smart retry)
CREATE OR REPLACE FUNCTION find_similar_sessions(
  probe_embedding vector(512),
  threshold FLOAT DEFAULT 0.7,
  max_results INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  tier TEXT,
  match_count INT,
  top_confidence INT,
  matched_photo_ids TEXT[],
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ms.id,
    ms.created_at,
    ms.tier,
    ms.match_count,
    ms.top_confidence,
    ms.matched_photo_ids,
    1 - (ms.query_embedding <=> probe_embedding) AS similarity
  FROM match_sessions ms
  WHERE ms.query_embedding IS NOT NULL
    AND 1 - (ms.query_embedding <=> probe_embedding) > threshold
    AND ms.match_count > 0
  ORDER BY ms.query_embedding <=> probe_embedding
  LIMIT max_results;
$$;

-- 5. Co-occurrence recommendations: photos that appear alongside the given photos
CREATE OR REPLACE FUNCTION get_cooccurrence_recommendations(
  user_photo_ids TEXT[],
  exclude_photo_ids TEXT[] DEFAULT '{}',
  max_results INT DEFAULT 8
)
RETURNS TABLE (
  photo_id TEXT,
  cooccurrence_count BIGINT
)
LANGUAGE sql STABLE
AS $$
  SELECT pid AS photo_id, count(*) AS cooccurrence_count
  FROM match_sessions ms, unnest(ms.matched_photo_ids) AS pid
  WHERE ms.matched_photo_ids && user_photo_ids
    AND pid != ALL(user_photo_ids)
    AND pid != ALL(exclude_photo_ids)
    AND ms.match_count > 0
  GROUP BY pid
  ORDER BY cooccurrence_count DESC
  LIMIT max_results;
$$;
