-- ============================================================================
-- SkillPath — 0017 let the lexical arm actually use its index
--
-- 0016 added the trigram index and then wrote a predicate that cannot use it:
--
--     u.body_norm like any (array(select '%' || a || '%' from unnest(...)))
--
-- LIKE ANY takes an array of patterns, and the planner has no way to push an
-- array into a GIN trigram scan — it falls back to a sequential scan of all
-- 23,136 rows, once per skill, 500 skills to a batch. That is 11.5M rows of
-- LIKE per call and it times out, with the index sitting unused the whole time.
--
-- Unnesting first and joining on ONE pattern at a time gives the planner a
-- predicate it recognises. gin_trgm_ops handles a pattern that is only known at
-- execution time perfectly well; what it cannot handle is being handed a set of
-- them at once.
--
-- Nothing else changes: same candidates, same scoring, same signature.
-- ============================================================================

create or replace function public.link_skills_to_units(
  p_k              integer default 3,
  p_min_similarity double precision default 0.40,
  p_offset         integer default 0,
  p_limit          integer default 400,
  p_probe          integer default 40,
  p_lex_bonus      double precision default 0.25,
  p_lex_limit      integer default 300
)
returns integer
language plpgsql
volatile
as $$
declare
  inserted integer;
begin
  with batch as (
    select q.concept_uri, q.embedding, q.anchor_prefixes
    from public.skill_query_embeddings q
    order by q.concept_uri
    offset greatest(p_offset, 0)
    limit greatest(p_limit, 1)
  ),
  cand as (
    select b.concept_uri, c.program_id, c.sim, c.lexical
    from batch b
    cross join lateral (
      -- the nearest units by vector ...
      (
        select v.program_id, 1 - (v.embedding <=> b.embedding) as sim, false as lexical
        from (
          select u.program_id, u.embedding
          from public.education_program_units u
          where u.embedding is not null
          order by u.embedding <=> b.embedding
          limit greatest(p_probe, 1)
        ) v
      )
      union all
      -- ... plus every unit that names the skill, one prefix at a time so each
      -- LIKE is a pattern the trigram index can be scanned with
      (
        select u.program_id, 1 - (u.embedding <=> b.embedding) as sim, true as lexical
        from unnest(coalesce(b.anchor_prefixes, '{}'::text[])) as a
        join public.education_program_units u
          on u.body_norm like '%' || a || '%'
        limit greatest(p_lex_limit, 1)
      )
    ) c
  ),
  best as (
    select
      c.concept_uri,
      c.program_id,
      max(c.sim) as sim,
      max(c.sim + case when c.lexical then p_lex_bonus else 0 end) as score
    from cand c
    -- A lexical hit skips the floor: a unit that names the skill is evidence
    -- even when the vectors disagree, which is the whole point of having it.
    where c.lexical or c.sim >= p_min_similarity
    group by 1, 2
  ),
  ranked as (
    select
      b.concept_uri,
      b.program_id,
      b.sim,
      row_number() over (partition by b.concept_uri order by b.score desc) as rn
    from best b
  ),
  ins as (
    insert into public.education_program_skills (program_id, skill_uri, similarity)
    select r.program_id, r.concept_uri, r.sim
    from ranked r
    where r.rn <= greatest(p_k, 1)
    on conflict (program_id, skill_uri) do update
      set similarity = greatest(education_program_skills.similarity, excluded.similarity)
    returning 1
  )
  select count(*) into inserted from ins;

  return inserted;
end;
$$;

revoke all on function public.link_skills_to_units(integer, double precision, integer, integer, integer, double precision, integer) from public;
grant execute on function public.link_skills_to_units(integer, double precision, integer, integer, integer, double precision, integer)
  to service_role;
