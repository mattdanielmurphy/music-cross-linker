-- Deduplicate existing match_candidates and create unique index on (entity_id, platform, candidate_url)
-- This allows ON CONFLICT (entity_id, platform, candidate_url) DO UPDATE in search endpoints.

WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER (PARTITION BY entity_id, platform, candidate_url ORDER BY created_at DESC) as winner_id,
         ROW_NUMBER() OVER (PARTITION BY entity_id, platform, candidate_url ORDER BY created_at DESC) as rn
  FROM match_candidates
)
UPDATE entity_matches em
SET candidate_id = r.winner_id
FROM ranked r
WHERE em.candidate_id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY entity_id, platform, candidate_url ORDER BY created_at DESC) as rn
  FROM match_candidates
)
DELETE FROM match_candidates
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS match_candidates_entity_platform_url_idx 
ON match_candidates (entity_id, platform, candidate_url);
