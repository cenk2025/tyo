-- ============================================================================
-- SkillPath — 0021 adjacent_occupations (Piilo-osaajat)
-- "Who else could do this job?" For a target occupation, rank the other ESCO
-- occupations by how much of its ESSENTIAL skill set they carry, so an
-- employer can widen a search to people from neighbouring fields.
--
-- It compares occupations, never people. Plain SQL over
-- occupation_skill_relations (both directions indexed in 0002); an RPC because
-- the aggregate spans ~126k relation rows, far past PostgREST's row cap.
--
-- Ranking is cosine overlap: shared / sqrt(|target essential| * |candidate
-- skills|). Raw shared counts favour occupations with huge skill lists (e.g.
-- clinical psychologists topping "practical nurse" on generic healthcare
-- skills); dividing by the candidate's breadth fixes that, measured on
-- warehouse worker / cook / practical nurse / bus driver before shipping.
--
-- p_focused (default) drops what isn't a genuinely different field:
--   * the target's own 4-digit ISCO group;
--   * label variants of the target ("dieettikokki" for "kokki", "trolley bus
--     driver" for "bus driver") — needed because ~40% of occupations in this
--     import have no isco_group, so the ISCO rule alone misses them;
--   * managers and professionals (ISCO 1-2) when the target is ISCO 4-9, which
--     are not a realistic hiring pool for those roles.
-- Re-runnable.
-- ============================================================================

drop function if exists public.adjacent_occupations(text, integer, boolean);

create or replace function public.adjacent_occupations(
  p_occupation_uri text,
  p_limit          integer default 12,
  p_focused        boolean default true
)
returns table (
  occupation_uri     text,
  code               text,
  isco_group         text,
  preferred_label_fi text,
  preferred_label_en text,
  shared_count       integer,
  target_count       integer,
  candidate_count    integer,
  score              double precision,
  shared_skill_uris  text[]
)
language sql
stable
set search_path = public
as $$
  with target as (
    select r.skill_uri
    from public.occupation_skill_relations r
    where r.occupation_uri = p_occupation_uri and r.relation_type = 'essential'
  ),
  tgt as (
    select o.isco_group,
           lower(coalesce(o.preferred_label_fi, '')) as fi,
           lower(coalesce(o.preferred_label_en, '')) as en,
           (select count(distinct t.skill_uri)::int from target t) as n
    from public.occupations o
    where o.concept_uri = p_occupation_uri
  ),
  shared as (
    select r.occupation_uri, array_agg(distinct r.skill_uri) as uris
    from public.occupation_skill_relations r
    join target t on t.skill_uri = r.skill_uri
    where r.occupation_uri <> p_occupation_uri
    group by r.occupation_uri
  ),
  sized as (
    select s.occupation_uri, s.uris,
           (select count(distinct r2.skill_uri)::int
              from public.occupation_skill_relations r2
             where r2.occupation_uri = s.occupation_uri) as size
    from shared s
  )
  select z.occupation_uri, o.code, o.isco_group, o.preferred_label_fi, o.preferred_label_en,
         cardinality(z.uris), tgt.n, z.size,
         cardinality(z.uris) / sqrt(greatest(tgt.n, 1)::double precision * greatest(z.size, 1)),
         z.uris
  from sized z
  join public.occupations o on o.concept_uri = z.occupation_uri
  cross join tgt
  where not p_focused or (
        -- same 4-digit ISCO group
        coalesce(o.isco_group, '') is distinct from coalesce(tgt.isco_group, '#')
        -- label variants of the target
    and (tgt.fi = '' or lower(coalesce(o.preferred_label_fi, '')) not like '%' || tgt.fi)
    and (tgt.en = '' or (' ' || lower(coalesce(o.preferred_label_en, '')) || ' ') not like '% ' || tgt.en || ' %')
        -- managers/professionals for a mid- or entry-level target
    and not (left(coalesce(tgt.isco_group, ''), 1) between '4' and '9'
             and left(coalesce(o.isco_group, ''), 1) in ('1', '2'))
  )
  order by 9 desc, cardinality(z.uris) desc, o.preferred_label_fi
  limit greatest(least(p_limit, 50), 1);
$$;

grant execute on function public.adjacent_occupations(text, integer, boolean) to anon, authenticated;
