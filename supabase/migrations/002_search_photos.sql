-- Semantic text search over photo metadata
-- Uses pg_trgm for fuzzy matching + ts_vector for full-text search
-- @TheTechMargin 2026

create extension if not exists pg_trgm;

-- Full-text search index on combined metadata
alter table photos add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english',
      coalesce(visible_text, '') || ' ' ||
      coalesce(people_descriptions, '') || ' ' ||
      coalesce(scene_description, '') || ' ' ||
      coalesce(filename, '') || ' ' ||
      coalesce(folder, '')
    )
  ) stored;

create index if not exists idx_photos_search_vector
  on photos using gin(search_vector);

-- Trigram indexes for fuzzy matching
create index if not exists idx_photos_visible_text_trgm
  on photos using gin(visible_text gin_trgm_ops);
create index if not exists idx_photos_people_desc_trgm
  on photos using gin(people_descriptions gin_trgm_ops);
create index if not exists idx_photos_scene_desc_trgm
  on photos using gin(scene_description gin_trgm_ops);

-- RPC function: hybrid text search (full-text + fuzzy)
create or replace function search_photos(
  query_text text,
  result_limit int default 50
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
  processed_at timestamptz,
  created_at timestamptz,
  rank float
)
language plpgsql
as $$
declare
  tsquery_val tsquery;
begin
  -- Build tsquery from input (handles multi-word)
  tsquery_val := plainto_tsquery('english', query_text);

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
      p.processed_at,
      p.created_at,
      (
        -- Full-text rank (weighted)
        coalesce(ts_rank_cd(p.search_vector, tsquery_val, 32), 0) * 10 +
        -- Trigram similarity boost
        greatest(
          similarity(p.visible_text, query_text),
          similarity(p.people_descriptions, query_text),
          similarity(p.scene_description, query_text),
          similarity(p.filename, query_text)
        ) * 5
      )::float as rank
    from photos p
    where p.status = 'completed'
      and (
        p.search_vector @@ tsquery_val
        or similarity(p.visible_text, query_text) > 0.1
        or similarity(p.people_descriptions, query_text) > 0.1
        or similarity(p.scene_description, query_text) > 0.1
        or similarity(p.filename, query_text) > 0.15
        or p.visible_text ilike '%' || query_text || '%'
        or p.people_descriptions ilike '%' || query_text || '%'
        or p.scene_description ilike '%' || query_text || '%'
      )
    order by rank desc
    limit result_limit;
end;
$$;
