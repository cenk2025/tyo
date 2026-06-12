-- ============================================================================
-- ESCO import — step 1: staging tables
-- ESCO ships labels per language (occupations_en.csv, occupations_fi.csv, …).
-- We import each raw CSV into a staging table, then merge EN+FI in step 2.
-- Columns are quoted to match the exact ESCO CSV headers so Supabase's CSV
-- importer maps them automatically.
-- ============================================================================

drop table if exists staging_occ_en;
drop table if exists staging_occ_fi;
drop table if exists staging_skill_en;
drop table if exists staging_skill_fi;
drop table if exists staging_relations;

-- occupations_en.csv / occupations_fi.csv
create table staging_occ_en (
  "conceptType" text, "conceptUri" text, "iscoGroup" text, "preferredLabel" text,
  "altLabels" text, "hiddenLabels" text, "status" text, "modifiedDate" text,
  "regulatedProfessionNote" text, "scopeNote" text, "definition" text,
  "inScheme" text, "description" text, "code" text
);
create table staging_occ_fi (like staging_occ_en including all);

-- skills_en.csv / skills_fi.csv
create table staging_skill_en (
  "conceptType" text, "conceptUri" text, "skillType" text, "reuseLevel" text,
  "preferredLabel" text, "altLabels" text, "hiddenLabels" text, "status" text,
  "modifiedDate" text, "scopeNote" text, "definition" text, "inScheme" text,
  "description" text
);
create table staging_skill_fi (like staging_skill_en including all);

-- occupationSkillRelations_en.csv (language-independent; any one language file)
create table staging_relations (
  "occupationUri" text, "relationType" text, "skillType" text, "skillUri" text
);
