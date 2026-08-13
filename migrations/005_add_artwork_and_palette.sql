ALTER TABLE match_candidates ADD COLUMN IF NOT EXISTS artwork_url text;
ALTER TABLE entity_matches ADD COLUMN IF NOT EXISTS artwork_url text;
ALTER TABLE entity_matches ADD COLUMN IF NOT EXISTS artwork_palette jsonb;
