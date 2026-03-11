-- Guard against sentinel rows (face_index = -1, embedding = NULL) written for
-- no-face photos so they are not re-processed on every pipeline re-run.
-- @TheTechMargin 2026
--
-- Regular (non-concurrent) index rebuild — safe because face_embeddings is small
-- (~7k rows). Lock duration is milliseconds. Run as a single script.

-- 1. Rebuild HNSW index as partial — excludes NULL sentinel embeddings.
DROP INDEX IF EXISTS idx_face_embeddings_hnsw;

CREATE INDEX idx_face_embeddings_hnsw
  ON face_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- 2. Update match_faces to explicitly skip sentinels.
--    CREATE OR REPLACE is atomic — no window where the function is missing.
--    The planner can now use the partial index above for the IS NOT NULL predicate.
CREATE OR REPLACE FUNCTION match_faces(
  query_embedding vector(512),
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  drive_file_id text,
  filename text,
  folder text,
  face_index int,
  similarity float,
  bbox_x1 float8,
  bbox_y1 float8,
  bbox_x2 float8,
  bbox_y2 float8
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    SELECT
      fe.drive_file_id,
      fe.filename,
      fe.folder,
      fe.face_index,
      1 - (fe.embedding <=> query_embedding) AS similarity,
      fe.bbox_x1,
      fe.bbox_y1,
      fe.bbox_x2,
      fe.bbox_y2
    FROM face_embeddings fe
    WHERE fe.embedding IS NOT NULL
      AND 1 - (fe.embedding <=> query_embedding) > match_threshold
    ORDER BY fe.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
