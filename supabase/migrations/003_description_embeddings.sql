-- Add description embedding column for semantic search
-- Uses Gemini text-embedding-004 (768-dim vectors)
-- @TheTechMargin 2026

create extension if not exists vector;

alter table photos
  add column if not exists description_embedding vector(768);

-- HNSW index (works well without pre-populated data)
create index if not exists idx_photos_description_embedding
  on photos using hnsw (description_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Semantic search RPC over photo description embeddings
create or replace function search_photos_semantic(
  query_embedding vector(768),
  match_threshold float default 0.5,
  match_count int default 30
)
returns table (
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
language plpgsql
as $$
begin
  return query
    select
      p.id,
      p.drive_file_id,
      p.filename,
      p.drive_url,
      p.folder,
      p.visible_text,
      p.people_descriptions,
      p.scene_description,
      p.face_count,
      1 - (p.description_embedding <=> query_embedding) as similarity
    from photos p
    where p.description_embedding is not null
      and p.status = 'completed'
      and 1 - (p.description_embedding <=> query_embedding) > match_threshold
    order by p.description_embedding <=> query_embedding
    limit match_count;
end;
$$;
