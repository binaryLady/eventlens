-- Perceptual hash (dHash) for near-duplicate photo detection
-- + hidden column for soft-delete of duplicates
-- @TheTechMargin 2026

-- Add perceptual hash column
ALTER TABLE photos ADD COLUMN IF NOT EXISTS phash bigint;

CREATE INDEX IF NOT EXISTS idx_photos_phash
  ON photos (phash) WHERE phash IS NOT NULL;

-- Add hidden column for soft-deleting duplicates
ALTER TABLE photos ADD COLUMN IF NOT EXISTS hidden boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_photos_hidden
  ON photos (hidden) WHERE hidden = true;

-- RPC: find duplicate clusters by Hamming distance
CREATE OR REPLACE FUNCTION find_duplicate_clusters(
  hamming_threshold int DEFAULT 10
)
RETURNS TABLE (
  group_id bigint,
  photo_id uuid,
  drive_file_id text,
  filename text,
  folder text,
  phash bigint,
  hamming_distance int,
  hidden boolean
)
LANGUAGE sql
AS $$
  WITH pairs AS (
    SELECT
      a.id AS id_a,
      b.id AS id_b,
      a.phash AS phash_a,
      b.phash AS phash_b,
      a.drive_file_id AS drive_file_id_a,
      a.filename AS filename_a,
      a.folder AS folder_a,
      a.hidden AS hidden_a,
      b.drive_file_id AS drive_file_id_b,
      b.filename AS filename_b,
      b.folder AS folder_b,
      b.hidden AS hidden_b,
      bit_count((a.phash # b.phash)::bit(64))::int AS dist
    FROM photos a
    JOIN photos b ON a.id < b.id
    WHERE a.phash IS NOT NULL
      AND b.phash IS NOT NULL
      AND a.status = 'completed'
      AND b.status = 'completed'
      AND bit_count((a.phash # b.phash)::bit(64))::int <= hamming_threshold
  )
  SELECT
    DENSE_RANK() OVER (ORDER BY LEAST(id_a, id_b)) AS group_id,
    id_a AS photo_id,
    drive_file_id_a AS drive_file_id,
    filename_a AS filename,
    folder_a AS folder,
    phash_a AS phash,
    dist AS hamming_distance,
    hidden_a AS hidden
  FROM pairs
  UNION ALL
  SELECT
    DENSE_RANK() OVER (ORDER BY LEAST(id_a, id_b)) AS group_id,
    id_b AS photo_id,
    drive_file_id_b AS drive_file_id,
    filename_b AS filename,
    folder_b AS folder,
    phash_b AS phash,
    dist AS hamming_distance,
    hidden_b AS hidden
  FROM pairs
  ORDER BY group_id, hamming_distance;
$$;

-- Update search_photos to exclude hidden photos
CREATE OR REPLACE FUNCTION search_photos(
  query_text text,
  result_limit int default 50
)
RETURNS TABLE (
  id uuid,
  drive_file_id text,
  filename text,
  drive_url text,
  folder text,
  visible_text text,
  people_descriptions text,
  scene_description text,
  face_count int,
  processed_at timestamptz,
  created_at timestamptz,
  rank float
)
LANGUAGE plpgsql
AS $$
DECLARE
  tsquery_val tsquery;
BEGIN
  tsquery_val := plainto_tsquery('english', query_text);

  RETURN QUERY
    SELECT
      p.id,
      p.drive_file_id,
      p.filename,
      p.drive_url,
      p.folder,
      p.visible_text,
      p.people_descriptions,
      p.scene_description,
      p.face_count,
      p.processed_at,
      p.created_at,
      (
        coalesce(ts_rank_cd(p.search_vector, tsquery_val, 32), 0) * 10 +
        greatest(
          similarity(p.visible_text, query_text),
          similarity(p.people_descriptions, query_text),
          similarity(p.scene_description, query_text),
          similarity(p.filename, query_text)
        ) * 5
      )::float AS rank
    FROM photos p
    WHERE p.status = 'completed'
      AND (p.hidden IS NOT TRUE)
      AND (
        p.search_vector @@ tsquery_val
        OR similarity(p.visible_text, query_text) > 0.1
        OR similarity(p.people_descriptions, query_text) > 0.1
        OR similarity(p.scene_description, query_text) > 0.1
        OR similarity(p.filename, query_text) > 0.15
        OR p.visible_text ILIKE '%' || query_text || '%'
        OR p.people_descriptions ILIKE '%' || query_text || '%'
        OR p.scene_description ILIKE '%' || query_text || '%'
      )
    ORDER BY rank DESC
    LIMIT result_limit;
END;
$$;

-- Update search_photos_semantic to exclude hidden photos
CREATE OR REPLACE FUNCTION search_photos_semantic(
  query_embedding vector(768),
  match_threshold float default 0.5,
  match_count int default 30
)
RETURNS TABLE (
  id uuid,
  drive_file_id text,
  filename text,
  drive_url text,
  folder text,
  visible_text text,
  people_descriptions text,
  scene_description text,
  face_count int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    SELECT
      p.id,
      p.drive_file_id,
      p.filename,
      p.drive_url,
      p.folder,
      p.visible_text,
      p.people_descriptions,
      p.scene_description,
      p.face_count,
      1 - (p.description_embedding <=> query_embedding) AS similarity
    FROM photos p
    WHERE p.description_embedding IS NOT NULL
      AND p.status = 'completed'
      AND (p.hidden IS NOT TRUE)
      AND 1 - (p.description_embedding <=> query_embedding) > match_threshold
    ORDER BY p.description_embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
