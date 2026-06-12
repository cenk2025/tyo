-- ============================================================================
-- SkillPath — 0004 ESCO read-only RLS
-- ESCO reference data is public knowledge: anyone (anon or authenticated) may
-- read it, nobody may write it through the API. Adjust table names here if your
-- imported ESCO tables differ.
-- ============================================================================

alter table public.occupations               enable row level security;
alter table public.skills                     enable row level security;
alter table public.occupation_skill_relations enable row level security;

drop policy if exists "esco_occupations_read" on public.occupations;
create policy "esco_occupations_read" on public.occupations
  for select using (true);

drop policy if exists "esco_skills_read" on public.skills;
create policy "esco_skills_read" on public.skills
  for select using (true);

drop policy if exists "esco_relations_read" on public.occupation_skill_relations;
create policy "esco_relations_read" on public.occupation_skill_relations
  for select using (true);

-- No INSERT / UPDATE / DELETE policies are defined, so writes are denied for
-- the anon and authenticated roles (service_role still bypasses RLS for imports).
