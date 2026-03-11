-- Add unique constraint to face_embeddings table for upsert operations
-- Ensures no duplicate (drive_file_id, face_index) pairs
-- @TheTechMargin 2026

ALTER TABLE face_embeddings
ADD CONSTRAINT face_embeddings_drive_file_id_face_index_key
UNIQUE (drive_file_id, face_index);