-- ============================================================================
-- SkillPath — 0009 Finnish education programs (ePerusteet)
--
-- Why: a user with a target occupation or a picked skill set should be able
-- to see which real Finnish vocational qualification prepares them for it —
-- not just an abstract ESCO skill gap. Source: Opetushallitus's public
-- ePerusteet API (no auth), imported once by
-- scripts/import-education-programs.mjs, not fetched live per request.
--
-- Scope: only the 328 actual vocational qualifications (koulutustyyppi
-- 1 = perustutkinto, 11 = ammattitutkinto, 12 = erikoisammattitutkinto) out
-- of ePerusteet's ~346 total curriculum documents — lukio/perusopetus and a
-- handful of other types aren't occupation-oriented and are out of scope.
--
-- Two link tables, two different matching methods, because the source text
-- differs:
--   - occupations: matched from each qualification's official degree titles
--     (tutkintonimikkeet, e.g. "Vehicle Mechanic") — short, standardized
--     professional nouns, already close to ESCO's own naming. Trigram
--     similarity (search_occupations_fuzzy below, mirroring 0008's approach
--     for skills) is precise enough; no need for occupation embeddings.
--   - skills: matched from each qualification's overall competence summary
--     (suorittaneenOsaaminen, Finnish) via the EXISTING embedding_fi /
--     match_skills_semantic infrastructure (0007) — this is prose, not a
--     clean label, and it's Finnish, exactly the case embeddings exist for.
--     This is qualification-level granularity (one text per program), not
--     per-unit — matching every one of the ~78 units per program down to
--     atomic skill statements would mean hundreds of thousands of embedding
--     calls; qualification-level keeps this a ~328-call one-time job.
-- ============================================================================

create table if not exists public.education_programs (
  id             bigint primary key,
  koulutustyyppi text not null,
  name_fi        text not null,
  name_en        text,
  name_sv        text,
  diaarinumero   text,
  updated_at     timestamptz not null default now()
);

comment on table public.education_programs is
  'Finnish vocational qualifications (perustutkinto/ammattitutkinto/erikoisammattitutkinto), imported from ePerusteet. Re-imported wholesale, not incrementally.';

create table if not exists public.education_program_occupations (
  program_id    bigint not null references public.education_programs (id) on delete cascade,
  occupation_uri text not null references public.occupations (concept_uri) on delete cascade,
  source_label  text not null,
  similarity    real not null,
  primary key (program_id, occupation_uri)
);

create table if not exists public.education_program_skills (
  program_id  bigint not null references public.education_programs (id) on delete cascade,
  skill_uri   text not null references public.skills (concept_uri) on delete cascade,
  similarity  real not null,
  primary key (program_id, skill_uri)
);

create index if not exists idx_epo_occupation on public.education_program_occupations (occupation_uri);
create index if not exists idx_eps_skill on public.education_program_skills (skill_uri);

-- Public read-only, same shape as the ESCO tables' RLS (0004): this is public
-- Finnish government curriculum data, not user data.
alter table public.education_programs            enable row level security;
alter table public.education_program_occupations enable row level security;
alter table public.education_program_skills       enable row level security;

drop policy if exists "education_programs_read" on public.education_programs;
create policy "education_programs_read" on public.education_programs
  for select using (true);

drop policy if exists "education_program_occupations_read" on public.education_program_occupations;
create policy "education_program_occupations_read" on public.education_program_occupations
  for select using (true);

drop policy if exists "education_program_skills_read" on public.education_program_skills;
create policy "education_program_skills_read" on public.education_program_skills
  for select using (true);

-- ----------------------------------------------------------------------------
-- Fuzzy occupation search by trigram similarity — mirrors search_skills_fuzzy
-- (0008) exactly, same rationale, applied to occupations instead of skills.
-- Used only by the import script to resolve ePerusteet degree titles to real
-- ESCO occupation rows; not part of the app's live search paths.
-- ----------------------------------------------------------------------------
create or replace function public.search_occupations_fuzzy(
  p_query  text,
  p_locale text default 'en',
  p_limit  integer default 5
)
returns table (
  concept_uri        text,
  code               text,
  preferred_label_en text,
  preferred_label_fi text,
  similarity         real
)
language plpgsql
stable
as $$
begin
  perform set_config('pg_trgm.similarity_threshold', '0.2', true);

  return query
  select
    o.concept_uri,
    o.code,
    o.preferred_label_en,
    o.preferred_label_fi,
    greatest(
      similarity(coalesce(o.preferred_label_en, ''), p_query),
      similarity(coalesce(o.alt_labels_en, ''), p_query),
      similarity(coalesce(o.preferred_label_fi, ''), p_query),
      similarity(coalesce(o.alt_labels_fi, ''), p_query)
    ) as similarity
  from public.occupations o
  where (p_locale = 'fi' and (
          coalesce(o.preferred_label_fi, '') % p_query
          or coalesce(o.alt_labels_fi, '') % p_query
        ))
     or (p_locale <> 'fi' and (
          coalesce(o.preferred_label_en, '') % p_query
          or coalesce(o.alt_labels_en, '') % p_query
        ))
  order by similarity desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.search_occupations_fuzzy(text, text, integer)
  to anon, authenticated, service_role;
