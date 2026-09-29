-- ============================================================================
-- SkillPath — 0020 units_for_skills (Perehdytyspolku)
-- education_program_skills links a skill to a whole QUALIFICATION. An
-- onboarding plan needs the next level down: which tutkinnon osa (unit) inside
-- that qualification actually teaches the skill, so an employer can point a new
-- hire at 2-3 units instead of a whole degree.
--
-- No new data and no model call: for each skill this re-ranks the units of the
-- qualifications 0011-0017 already linked it to, using the vectors already
-- stored (skill_query_embeddings.embedding vs education_program_units.embedding,
-- both 512-dim halfvec). Candidates are restricted to those linked programs, so
-- the search is a few hundred distance computations per skill, not a scan.
--
-- security definer because skill_query_embeddings has RLS with no read policy
-- (it is pipeline-internal, 0015); the function only returns public data.
-- Re-runnable.
-- ============================================================================

create or replace function public.units_for_skills(
  p_skill_uris         text[],
  p_per_skill          integer default 3,
  p_programs_per_skill integer default 4,
  p_min_similarity     double precision default 0.35
)
returns table (
  skill_uri      text,
  program_id     bigint,
  osa_id         bigint,
  unit_title     text,
  heading        text,
  similarity     double precision,
  koulutustyyppi text,
  name_fi        text,
  name_en        text,
  diaarinumero   text
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select q.concept_uri, q.embedding
    from public.skill_query_embeddings q
    where q.concept_uri = any (p_skill_uris[1:40])
  ),
  progs as (
    select s.concept_uri, e.program_id
    from s
    cross join lateral (
      select eps.program_id
      from public.education_program_skills eps
      where eps.skill_uri = s.concept_uri
      order by eps.similarity desc
      limit greatest(p_programs_per_skill, 1)
    ) e
  ),
  scored as (
    -- best-matching chunk per (skill, unit)
    select distinct on (p.concept_uri, u.program_id, u.osa_id)
      p.concept_uri,
      u.program_id,
      u.osa_id,
      u.title_fi,
      u.heading,
      1 - (u.embedding <=> s.embedding) as sim
    from progs p
    join s on s.concept_uri = p.concept_uri
    join public.education_program_units u
      on u.program_id = p.program_id and u.embedding is not null
    order by p.concept_uri, u.program_id, u.osa_id, u.embedding <=> s.embedding
  ),
  ranked as (
    select sc.*, row_number() over (partition by sc.concept_uri order by sc.sim desc) as rn
    from scored sc
    where sc.sim >= p_min_similarity
  )
  select r.concept_uri, r.program_id, r.osa_id, r.title_fi, r.heading, r.sim,
         ep.koulutustyyppi, ep.name_fi, ep.name_en, ep.diaarinumero
  from ranked r
  join public.education_programs ep on ep.id = r.program_id
  where r.rn <= greatest(p_per_skill, 1);
$$;

revoke all on function public.units_for_skills(text[], integer, integer, double precision) from public;
grant execute on function public.units_for_skills(text[], integer, integer, double precision)
  to anon, authenticated;
