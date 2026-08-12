-- The original generated column applied lower() *outside* regexp_replace(), so
-- the character-class filter ([^a-z0-9|]) ran against the still-mixed-case
-- string and stripped every capitalized letter (e.g. word-initial letters)
-- before lower() ever got a chance to normalize case. In practice this
-- corrupted the fingerprint for almost every real artist/title pair (e.g.
-- "Daniel Lanois|Belladonna" became "anielanois|elladonna" instead of
-- "daniellanois|belladonna"), which silently broke all entity dedup/caching.
--
-- Fix: lowercase first, then strip. Generated columns can't be ALTERed in
-- place, so drop and re-add with the corrected expression (Postgres
-- recomputes it for all existing rows automatically).
alter table resolved_entities drop column if exists fingerprint;
alter table resolved_entities add column fingerprint text generated always as
  (regexp_replace(lower(coalesce(artist,'')||'|'||coalesce(title,'')), '[^a-z0-9|]', '', 'g')) stored;
create index if not exists resolved_entities_fingerprint_idx on resolved_entities (fingerprint);
