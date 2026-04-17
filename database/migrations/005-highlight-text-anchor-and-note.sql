-- Migration: text-anchor and note columns on highlight.
--
-- Server-side `create_highlight` (AI tool) persists a highlight before a CFI
-- is known. It stores a text-anchor (chapter index + snippet) that the client
-- resolves to a CFI and syncs back via LWW.
--
-- `note` holds the AI's optional explanatory note for the highlight.

BEGIN;

ALTER TABLE readmax.highlight
  ADD COLUMN IF NOT EXISTS text_anchor JSONB,
  ADD COLUMN IF NOT EXISTS note TEXT;

COMMIT;
