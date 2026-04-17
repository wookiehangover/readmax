-- Migration: Enforce per-user uniqueness of book.file_hash for live rows.
-- Partial unique index allows multiple tombstoned (soft-deleted) rows with
-- the same hash and ignores rows where file_hash has not been computed yet.
-- Cross-device duplicate uploads are deduped in the push handler by matching
-- file_hash on insert; this index is the final safety net at the DB level.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS book_user_file_hash_uniq
    ON readmax.book (user_id, file_hash)
    WHERE deleted_at IS NULL AND file_hash IS NOT NULL;

COMMIT;
