-- Lets a manual "Not Right?" pick be flagged as "this isn't right, but it's
-- the closest available" rather than implying full confidence. Only
-- meaningful for matched_by = 'manual' (auto matches already have their own
-- 'low'/'high' confidence signal on match_candidates.confidence).
alter table entity_matches add column if not exists uncertain boolean not null default false;
