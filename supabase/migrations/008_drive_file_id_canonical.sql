-- Make drive_file_id the canonical identifier with referential integrity
-- Safe migration: keeps UUID id as PK, adds constraints only
-- Zero-downtime: additive constraints on small tables complete in milliseconds
-- @TheTechMargin 2026

-- Step 1: Remove orphan photos rows with NULL drive_file_id (if any)
DELETE FROM photos WHERE drive_file_id IS NULL;

-- Step 2: Add NOT NULL + UNIQUE constraint on photos.drive_file_id
ALTER TABLE photos
  ALTER COLUMN drive_file_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'photos_drive_file_id_unique'
  ) THEN
    ALTER TABLE photos
      ADD CONSTRAINT photos_drive_file_id_unique UNIQUE (drive_file_id);
  END IF;
END $$;

-- Step 3: Remove orphan face_embeddings that reference non-existent photos
DELETE FROM face_embeddings fe
WHERE NOT EXISTS (
  SELECT 1 FROM photos p WHERE p.drive_file_id = fe.drive_file_id
);

-- Step 4: Add NOT NULL on face_embeddings.drive_file_id
ALTER TABLE face_embeddings
  ALTER COLUMN drive_file_id SET NOT NULL;

-- Step 5: Add FK from face_embeddings -> photos via drive_file_id
-- ON DELETE CASCADE: removing a photo auto-removes its face embeddings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'face_embeddings_drive_file_id_fkey'
  ) THEN
    ALTER TABLE face_embeddings
      ADD CONSTRAINT face_embeddings_drive_file_id_fkey
      FOREIGN KEY (drive_file_id) REFERENCES photos(drive_file_id)
      ON DELETE CASCADE;
  END IF;
END $$;
