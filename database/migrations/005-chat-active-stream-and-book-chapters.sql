-- Migration: resumable chat streams + cached book chapter extraction
--
-- 1. Add active_stream_id to chat_session so an in-flight generation can be
--    resumed across page reloads / reconnects.
-- 2. Add book_chapters table that caches parsed chapter metadata per
--    (user_id, book_id) so the chat stack doesn't need to re-parse the epub
--    on every request.

BEGIN;

ALTER TABLE readmax.chat_session
  ADD COLUMN IF NOT EXISTS active_stream_id TEXT;

CREATE TABLE IF NOT EXISTS readmax.book_chapters (
    user_id UUID NOT NULL REFERENCES readmax.user(id),
    book_id TEXT NOT NULL,
    chapters JSONB NOT NULL,
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, book_id)
);

COMMIT;
