-- EventLens: Complete Database Schema
-- Run this file once to bootstrap a fresh Supabase project.
-- For incremental updates, use the numbered migrations in ./migrations/
--
-- Prerequisites:
--   1. Create a Supabase project at https://supabase.com
--   2. Enable the pgvector extension (Database → Extensions → vector)
--   3. Run this file in the SQL Editor
--
-- @TheTechMargin 2026

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists vector;    -- pgvector for embeddings
create extension if not exists pg_trgm;   -- trigram fuzzy text matching

-- ============================================================
-- Core Tables
-- ============================================================

-- Photos: one row per Google Drive image
create table if not exists photos (
  id                    uuid default gen_random_uuid() primary key,
  drive_file_id         text not null unique,       -- stable Google Drive ID
  filename              text,
  drive_url             text,
  folder                text,
  visible_text          text,                        -- OCR / text in image
  people_descriptions   text,                        -- Gemini-generated people descriptions
  scene_description     text,                        -- Gemini-generated scene description
  face_count            int,
  status                text default 'pending',      -- pending | completed | error
  error_message         text,
  processed_at          timestamptz,
  created_at            timestamptz default now(),

  -- Semantic search: 768-dim Gemini text-embedding-004
  description_embedding vector(768),

  -- Perceptual hash for near-duplicate detection
  phash                 bigint,

  -- Soft-delete for duplicate hiding
  hidden                boolean default false,

  -- Auto-generated thematic tag
  auto_tag              text,

  -- Full-text search (generated column)
  search_vector         tsvector generated always as (
    to_tsvector('english',
      coalesce(visible_text, '') || ' ' ||
      coalesce(people_descriptions, '') || ' ' ||
      coalesce(scene_description, '') || ' ' ||
      coalesce(filename, '') || ' ' ||
      coalesce(folder, '')
    )
  ) stored
);

-- Face embeddings: one row per detected face (or sentinel for faceless photos)
create table if not exists face_embeddings (
  id            uuid default gen_random_uuid() primary key,
  drive_file_id text not null references photos(drive_file_id) on delete cascade,
  filename      text,
  folder        text,
  face_index    int,                      -- -1 = sentinel (no faces detected)
  embedding     vector(512),              -- NULL for sentinel rows
  bbox_x1       float8,
  bbox_y1       float8,
  bbox_x2       float8,
  bbox_y2       float8,
  created_at    timestamptz default now(),

  constraint face_embeddings_drive_file_id_face_index_key
    unique (drive_file_id, face_index)
);

-- Match sessions: analytics for every face-search query (no PII stored)
create table if not exists match_sessions (
  id                uuid default gen_random_uuid() primary key,
  created_at        timestamptz default now() not null,
  tier              text not null,                -- vector | text | visual | both
  match_count       int not null default 0,
  top_confidence    int,
  query_embedding   vector(512),                  -- face embedding (not the selfie)
  matched_photo_ids text[] default '{}'
);

-- ============================================================
-- Indexes
-- ============================================================

-- Photos
create index if not exists idx_photos_search_vector
  on photos using gin(search_vector);
create index if not exists idx_photos_visible_text_trgm
  on photos using gin(visible_text gin_trgm_ops);
create index if not exists idx_photos_people_desc_trgm
  on photos using gin(people_descriptions gin_trgm_ops);
create index if not exists idx_photos_scene_desc_trgm
  on photos using gin(scene_description gin_trgm_ops);
create index if not exists idx_photos_description_embedding
  on photos using hnsw (description_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
create index if not exists idx_photos_phash
  on photos (phash) where phash is not null;
create index if not exists idx_photos_hidden
  on photos (hidden) where hidden = true;
create index if not exists idx_photos_auto_tag
  on photos (auto_tag) where auto_tag is not null;

-- Face embeddings (partial index — excludes NULL sentinel embeddings)
create index if not exists idx_face_embeddings_hnsw
  on face_embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where embedding is not null;

-- Match sessions
create index if not exists idx_match_sessions_created
  on match_sessions (created_at desc);
create index if not exists idx_match_sessions_photo_ids
  on match_sessions using gin (matched_photo_ids);

-- ============================================================
-- RPC Functions
-- ============================================================

-- Face matching: cosine similarity over 512-dim InsightFace embeddings
create or replace function match_faces(
  query_embedding vector(512),
  match_threshold float default 0.6,
  match_count int default 20
)
returns table (
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
language plpgsql as $$
begin
  return query
    select
      fe.drive_file_id, fe.filename, fe.folder, fe.face_index,
      1 - (fe.embedding <=> query_embedding) as similarity,
      fe.bbox_x1, fe.bbox_y1, fe.bbox_x2, fe.bbox_y2
    from face_embeddings fe
    where fe.embedding is not null
      and 1 - (fe.embedding <=> query_embedding) > match_threshold
    order by fe.embedding <=> query_embedding
    limit match_count;
end;
$$;

-- Hybrid text search: full-text (ts_rank) + trigram fuzzy matching
create or replace function search_photos(
  query_text text,
  result_limit int default 50
)
returns table (
  id uuid, drive_file_id text, filename text, drive_url text, folder text,
  visible_text text, people_descriptions text, scene_description text,
  face_count int, processed_at timestamptz, created_at timestamptz, rank float
)
language plpgsql as $$
declare
  tsquery_val tsquery;
begin
  tsquery_val := plainto_tsquery('english', query_text);
  return query
    select
      p.id, p.drive_file_id, p.filename, p.drive_url, p.folder,
      p.visible_text, p.people_descriptions, p.scene_description,
      p.face_count, p.processed_at, p.created_at,
      (
        coalesce(ts_rank_cd(p.search_vector, tsquery_val, 32), 0) * 10 +
        greatest(
          similarity(p.visible_text, query_text),
          similarity(p.people_descriptions, query_text),
          similarity(p.scene_description, query_text),
          similarity(p.filename, query_text)
        ) * 5
      )::float as rank
    from photos p
    where p.status = 'completed'
      and (p.hidden is not true)
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

-- Semantic search: cosine similarity over 768-dim Gemini embeddings
create or replace function search_photos_semantic(
  query_embedding vector(768),
  match_threshold float default 0.5,
  match_count int default 30
)
returns table (
  id uuid, drive_file_id text, filename text, drive_url text, folder text,
  visible_text text, people_descriptions text, scene_description text,
  face_count int, similarity float
)
language plpgsql as $$
begin
  return query
    select
      p.id, p.drive_file_id, p.filename, p.drive_url, p.folder,
      p.visible_text, p.people_descriptions, p.scene_description,
      p.face_count,
      1 - (p.description_embedding <=> query_embedding) as similarity
    from photos p
    where p.description_embedding is not null
      and p.status = 'completed'
      and (p.hidden is not true)
      and 1 - (p.description_embedding <=> query_embedding) > match_threshold
    order by p.description_embedding <=> query_embedding
    limit match_count;
end;
$$;

-- Analytics: recent match activity
create or replace function get_recent_match_activity(
  hours_back int default 24,
  max_results int default 20
)
returns table (
  id uuid, created_at timestamptz, tier text, match_count int, top_confidence int
)
language sql stable as $$
  select ms.id, ms.created_at, ms.tier, ms.match_count, ms.top_confidence
  from match_sessions ms
  where ms.created_at > now() - make_interval(hours => hours_back)
  order by ms.created_at desc
  limit max_results;
$$;

-- Analytics: most-matched photos
create or replace function get_hot_photo_ids(
  top_n int default 10,
  hours_back int default 168
)
returns table (photo_id text, match_hit_count bigint)
language sql stable as $$
  select pid as photo_id, count(*) as match_hit_count
  from match_sessions ms, unnest(ms.matched_photo_ids) as pid
  where ms.created_at > now() - make_interval(hours => hours_back)
    and ms.match_count > 0
  group by pid
  order by match_hit_count desc
  limit top_n;
$$;

-- Analytics: unique face-search users
create or replace function get_unique_operatives_count()
returns bigint
language sql stable as $$
  select count(*) from match_sessions where query_embedding is not null;
$$;

-- Analytics: find similar past sessions by face embedding
create or replace function find_similar_sessions(
  probe_embedding vector(512),
  threshold float default 0.7,
  max_results int default 5
)
returns table (
  id uuid, created_at timestamptz, tier text, match_count int,
  top_confidence int, matched_photo_ids text[], similarity float
)
language sql stable as $$
  select
    ms.id, ms.created_at, ms.tier, ms.match_count, ms.top_confidence,
    ms.matched_photo_ids,
    1 - (ms.query_embedding <=> probe_embedding) as similarity
  from match_sessions ms
  where ms.query_embedding is not null
    and 1 - (ms.query_embedding <=> probe_embedding) > threshold
    and ms.match_count > 0
  order by ms.query_embedding <=> probe_embedding
  limit max_results;
$$;

-- Analytics: co-occurrence recommendations
create or replace function get_cooccurrence_recommendations(
  user_photo_ids text[],
  exclude_photo_ids text[] default '{}',
  max_results int default 8
)
returns table (photo_id text, cooccurrence_count bigint)
language sql stable as $$
  select pid as photo_id, count(*) as cooccurrence_count
  from match_sessions ms, unnest(ms.matched_photo_ids) as pid
  where ms.matched_photo_ids && user_photo_ids
    and pid != all(user_photo_ids)
    and pid != all(exclude_photo_ids)
    and ms.match_count > 0
  group by pid
  order by cooccurrence_count desc
  limit max_results;
$$;

-- Dedup: find near-duplicate clusters by perceptual hash Hamming distance
create or replace function find_duplicate_clusters(
  hamming_threshold int default 10
)
returns table (
  group_id bigint, photo_id uuid, drive_file_id text, filename text,
  folder text, phash bigint, hamming_distance int, hidden boolean
)
language sql as $$
  with pairs as (
    select
      a.id as id_a, b.id as id_b,
      a.phash as phash_a, b.phash as phash_b,
      a.drive_file_id as drive_file_id_a, a.filename as filename_a,
      a.folder as folder_a, a.hidden as hidden_a,
      b.drive_file_id as drive_file_id_b, b.filename as filename_b,
      b.folder as folder_b, b.hidden as hidden_b,
      bit_count((a.phash # b.phash)::bit(64))::int as dist
    from photos a
    join photos b on a.id < b.id
    where a.phash is not null and b.phash is not null
      and a.status = 'completed' and b.status = 'completed'
      and bit_count((a.phash # b.phash)::bit(64))::int <= hamming_threshold
  )
  select dense_rank() over (order by least(id_a, id_b)) as group_id,
    id_a as photo_id, drive_file_id_a as drive_file_id, filename_a as filename,
    folder_a as folder, phash_a as phash, dist as hamming_distance, hidden_a as hidden
  from pairs
  union all
  select dense_rank() over (order by least(id_a, id_b)) as group_id,
    id_b as photo_id, drive_file_id_b as drive_file_id, filename_b as filename,
    folder_b as folder, phash_b as phash, dist as hamming_distance, hidden_b as hidden
  from pairs
  order by group_id, hamming_distance;
$$;
