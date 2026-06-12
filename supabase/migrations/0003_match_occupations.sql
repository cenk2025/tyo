-- ============================================================================
-- SkillPath — 0003 match_occupations RPC
-- The ranking engine. Coverage of essential skills is weighted 0.7, optional
-- 0.3. Called from the app via supabase.rpc('match_occupations', {p_user_id}).
--
-- Not SECURITY DEFINER: it runs as the caller, so RLS on user_skills means a
-- user can only score against their OWN skills (passing someone else's id just
-- yields zero matches).
-- ============================================================================

create or replace function public.match_occupations(p_user_id uuid)
returns table (
  occupation_uri text,
  code text,
  isco_group text,
  preferred_label_en text,
  preferred_label_fi text,
  essential_coverage numeric,
  optional_coverage numeric,
  score numeric,
  matched_essential integer,
  total_essential integer,
  matched_optional integer,
  total_optional integer
)
language sql
stable
as $$
  with user_sk as (
    select skill_uri from public.user_skills where user_id = p_user_id
  ),
  occ_stats as (
    select
      r.occupation_uri,
      count(*) filter (where r.relation_type = 'essential')                                   as total_essential,
      count(*) filter (where r.relation_type = 'optional')                                    as total_optional,
      count(*) filter (where r.relation_type = 'essential' and us.skill_uri is not null)       as matched_essential,
      count(*) filter (where r.relation_type = 'optional'  and us.skill_uri is not null)       as matched_optional
    from public.occupation_skill_relations r
    left join user_sk us on us.skill_uri = r.skill_uri
    group by r.occupation_uri
  ),
  scored as (
    select
      s.occupation_uri,
      s.total_essential,
      s.total_optional,
      s.matched_essential,
      s.matched_optional,
      case when s.total_essential > 0 then s.matched_essential::numeric / s.total_essential else 0 end as essential_coverage,
      case when s.total_optional  > 0 then s.matched_optional::numeric  / s.total_optional  else 0 end as optional_coverage
    from occ_stats s
    where s.matched_essential + s.matched_optional > 0   -- only occupations the user shares skills with
  )
  select
    o.concept_uri                                                        as occupation_uri,
    o.code,
    o.isco_group,
    o.preferred_label_en,
    o.preferred_label_fi,
    round(sc.essential_coverage, 4)                                      as essential_coverage,
    round(sc.optional_coverage, 4)                                       as optional_coverage,
    round(0.7 * sc.essential_coverage + 0.3 * sc.optional_coverage, 4)   as score,
    sc.matched_essential::int,
    sc.total_essential::int,
    sc.matched_optional::int,
    sc.total_optional::int
  from scored sc
  join public.occupations o on o.concept_uri = sc.occupation_uri
  order by score desc, sc.matched_essential desc
  limit 30;
$$;

grant execute on function public.match_occupations(uuid) to anon, authenticated;
