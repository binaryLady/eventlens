-- Add HNSW index on face_embeddings for faster cosine similarity search
-- At ~7k rows this is marginal, but it keeps query time constant as data grows
-- @TheTechMargin 2026

create index if not exists idx_face_embeddings_hnsw
  on face_embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
