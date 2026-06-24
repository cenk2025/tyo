-- ============================================================================
-- ESCO import — step 3 (OPTIONAL): green & digital skill flags
-- Fills skills.is_green / skills.is_digital from the ESCO collection CSVs. The
-- collections are language-independent (membership keyed by conceptUri), so you
-- only import the EN files. Run AFTER migration 0005 created the columns.
--
-- CSVs (from the ESCO v1.2.1 classification download, same 10-col header):
--   greenSkillsCollection_en.csv   → staging_green
--   digitalSkillsCollection_en.csv → staging_digital
-- Header: conceptType,conceptUri,preferredLabel,status,skillType,reuseLevel,
--         altLabels,description,broaderConceptUri,broaderConceptPT
-- ============================================================================

-- ── Staging (quoted to the exact CSV headers; scratch tables) ───────────────
drop table if exists staging_green;
drop table if exists staging_digital;

create table staging_green (
  "conceptType" text, "conceptUri" text, "preferredLabel" text, "status" text,
  "skillType" text, "reuseLevel" text, "altLabels" text, "description" text,
  "broaderConceptUri" text, "broaderConceptPT" text
);
create table staging_digital (like staging_green including all);

-- ── Import the 2 CSVs into the 2 staging tables (Table Editor → Import CSV) ──
--   greenSkillsCollection_en.csv   → staging_green
--   digitalSkillsCollection_en.csv → staging_digital
-- …then run the updates below.

-- ── Reset + apply the flags (idempotent) ────────────────────────────────────
update public.skills set is_green = false   where is_green;
update public.skills set is_digital = false where is_digital;

update public.skills s set is_green = true
  from staging_green g where g."conceptUri" = s.concept_uri;

update public.skills s set is_digital = true
  from staging_digital d where d."conceptUri" = s.concept_uri;

-- ── Sanity check — ESCO v1.2.1: ~630 green, ~1285 digital ───────────────────
select
  (select count(*) from public.skills where is_green)   as green_skills,
  (select count(*) from public.skills where is_digital) as digital_skills,
  (select count(*) from public.skills where is_green and is_digital) as both;

-- ── Optional cleanup once verified ──────────────────────────────────────────
--   drop table staging_green, staging_digital;
