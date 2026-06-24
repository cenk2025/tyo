-- ============================================================================
-- SkillPath — 0005 green & digital skill flags
-- Tags each ESCO skill as part of the green-economy and/or digital-skills
-- collections, powering the dashboard "Green & digital skills" readiness card.
-- Flags are filled from the ESCO greenSkillsCollection / digitalSkillsCollection
-- CSVs — see supabase/esco-import/03_green_digital.sql.
-- Re-runnable.
-- ============================================================================

alter table public.skills
  add column if not exists is_green   boolean not null default false,
  add column if not exists is_digital boolean not null default false;

-- Partial indexes — the dashboard only ever filters for the true rows.
create index if not exists idx_skills_green
  on public.skills (concept_uri) where is_green;
create index if not exists idx_skills_digital
  on public.skills (concept_uri) where is_digital;
