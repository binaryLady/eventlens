-- Guard against sentinel rows (face_index = -1, embedding = NULL) written for
-- no-face photos so they are not re-processed on every pipeline re-run.
-- @TheTechMargin 2026

-- 1. Rebuild HNSW index as partial — excludes NULL embeddings for correctness
--    and keeps index size lean as sentinel rows accumulate.
DROP INDEX IF EXISTS idx_face_embeddings_hnsw;

CREATE INDEX idx_face_embeddings_hnsw
  ON face_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- 2. Update match_faces to explicitly skip sentinels.
--    pgvector returns NULL for (NULL <=> vector) so they would be filtered by
--    the threshold check, but being explicit lets the planner use the partial
--    index and avoids any NULL-distance edge cases.
DROP FUNCTION IF EXISTS match_faces(vector, double precision, integer);

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
