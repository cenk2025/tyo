-- ============================================================================
-- ESCO import — step 2: merge staging → final tables
-- Run AFTER importing the 5 CSVs into the staging tables. Merges EN + FI rows
-- by conceptUri into the app's occupations / skills / relations tables.
-- Idempotent: re-running upserts the same rows.
-- ============================================================================

-- Occupations: EN as the base, FI labels joined on conceptUri.
insert into public.occupations
  (concept_uri, isco_group, code, preferred_label_en, preferred_label_fi,
   alt_labels_en, alt_labels_fi, description_en, description_fi)
select
  en."conceptUri",
  nullif(en."iscoGroup", ''),
  nullif(en."code", ''),
  nullif(en."preferredLabel", ''),
  nullif(fi."preferredLabel", ''),
  nullif(en."altLabels", ''),
  nullif(fi."altLabels", ''),
  nullif(en."description", ''),
  nullif(fi."description", '')
from staging_occ_en en
left join staging_occ_fi fi on fi."conceptUri" = en."conceptUri"
where en."conceptType" ilike '%occupation%'
on conflict (concept_uri) do update set
  isco_group         = excluded.isco_group,
  code               = excluded.code,
  preferred_label_en = excluded.preferred_label_en,
  preferred_label_fi = excluded.preferred_label_fi,
  alt_labels_en      = excluded.alt_labels_en,
  alt_labels_fi      = excluded.alt_labels_fi,
  description_en     = excluded.description_en,
  description_fi     = excluded.description_fi;

-- Skills: EN base, FI labels joined on conceptUri.
insert into public.skills
  (concept_uri, skill_type, reuse_level, preferred_label_en, preferred_label_fi,
   alt_labels_en, alt_labels_fi, description_en, description_fi)
select
  en."conceptUri",
  nullif(en."skillType", ''),
  nullif(en."reuseLevel", ''),
  nullif(en."preferredLabel", ''),
  nullif(fi."preferredLabel", ''),
  nullif(en."altLabels", ''),
  nullif(fi."altLabels", ''),
  nullif(en."description", ''),
  nullif(fi."description", '')
from staging_skill_en en
left join staging_skill_fi fi on fi."conceptUri" = en."conceptUri"
on conflict (concept_uri) do update set
  skill_type         = excluded.skill_type,
  reuse_level        = excluded.reuse_level,
  preferred_label_en = excluded.preferred_label_en,
  preferred_label_fi = excluded.preferred_label_fi,
  alt_labels_en      = excluded.alt_labels_en,
  alt_labels_fi      = excluded.alt_labels_fi,
  description_en     = excluded.description_en,
  description_fi     = excluded.description_fi;

-- Relations: only keep rows whose endpoints exist (guards against partial imports).
insert into public.occupation_skill_relations (occupation_uri, skill_uri, relation_type)
select distinct
  r."occupationUri", r."skillUri", lower(r."relationType")
from staging_relations r
join public.occupations o on o.concept_uri = r."occupationUri"
join public.skills      s on s.concept_uri = r."skillUri"
where r."relationType" is not null
on conflict (occupation_uri, skill_uri, relation_type) do nothing;

-- Quick sanity check after running:
--   select
--     (select count(*) from occupations) as occupations,
--     (select count(*) from skills) as skills,
--     (select count(*) from occupation_skill_relations) as relations;

-- Optional cleanup once verified:
--   drop table staging_occ_en, staging_occ_fi, staging_skill_en,
--              staging_skill_fi, staging_relations;
