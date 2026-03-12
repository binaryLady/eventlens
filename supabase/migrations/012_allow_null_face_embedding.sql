-- Allow NULL embedding on face_embeddings for sentinel rows (face_index = -1).
-- Sentinel rows mark photos with no detected faces so they are not
-- re-processed on every pipeline run.  The HNSW index and match_faces
-- function already filter WHERE embedding IS NOT NULL (see 009).
-- @TheTechMargin 2026

ALTER TABLE face_embeddings ALTER COLUMN embedding DROP NOT NULL;
