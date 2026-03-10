-- Vector similarity search for face matching
-- Uses cosine distance (<=> operator) on InsightFace 512-dim embeddings
-- @TheTechMargin 2026

drop function if exists match_faces(vector, double precision, integer);

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
language plpgsql
as $$
begin
  return query
    select
      fe.drive_file_id,
      fe.filename,
      fe.folder,
      fe.face_index,
      1 - (fe.embedding <=> query_embedding) as similarity,
      fe.bbox_x1,
      fe.bbox_y1,
      fe.bbox_x2,
      fe.bbox_y2
    from face_embeddings fe
    where 1 - (fe.embedding <=> query_embedding) > match_threshold
    order by fe.embedding <=> query_embedding
    limit match_count;
end;
$$;
