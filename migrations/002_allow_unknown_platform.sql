-- Some routes (bare slug links with no explicit sourceUrl) have no determinable
-- source platform. Allow 'unknown' so resolved_entities inserts don't fail.
alter table resolved_entities drop constraint if exists resolved_entities_source_platform_check;
alter table resolved_entities add constraint resolved_entities_source_platform_check
  check (source_platform in ('apple_music','spotify','youtube','unknown'));
