-- ============================================================================
-- SkillPath — 0016 give the matcher a lexical signal to go with the embedding
--
-- 0014/0015 fixed the asymmetry and the distribution came right: the electrical
-- perustutkinto went from 44 skills to 70 against its ammattitutkinto's 94,
-- where before it was 44 against 179. What it did not fix is precision on
-- individual skills. "asentaa pistorasioita" still retrieves rainwater systems
-- and marine engine automation; widening the probe from 40 to 200 changed the
-- link count by 0.6%, so those texts genuinely ARE the nearest — the ranking is
-- not being crowded out, the embedding simply does not encode the noun.
--
-- The word itself is decisive, though. Searched literally, "pistorasi" appears
-- in exactly 2 of 23,136 requirement groups, and both are
--
--     Sähkö- ja automaatioalan perustutkinto
--     "Opiskelija tekee pien- ja pienoisjännitesähköasennukset"
--
-- A term that rare carries more information than any cosine here, and it is
-- exactly what a dense vector averages away. So the fix is not a better
-- embedding, it is a second signal.
--
-- Two details decided the shape of it:
--
--   - Postgres's Finnish stemmer cannot be relied on. to_tsvector('finnish',
--     '... pistorasioiden ... pistorasiat ...') yields 'pistorasio' AND
--     'pistorasia' — two different lexemes for one word, so a tsquery for
--     either misses the other. Finnish inflects by suffix, so prefix matching
--     over raw text is the tool that actually works: 'pistorasi' covers
--     pistorasia, pistorasiat, pistorasioiden, pistorasioita.
--   - Selectivity has to be measured, not assumed. Of the terms in five
--     electrical skill labels, 'pistorasi' hits 2 programmes, 'kaapel' 24,
--     'sähkölaitt' 28 — but 'johto' hits 105, because johto is both a wire and
--     a management, and 'asent' hits 105 because every trade installs
--     something. Anchors are therefore chosen per skill by how few
--     QUALIFICATIONS they occur in, in scripts/build-skill-anchors.mjs, and
--     stored; skills with no selective term keep the embedding-only behaviour.
--
-- The lexical hit is a bonus on the ranking, not an override, and it exempts a
-- candidate from the similarity floor — a unit that names the skill outright is
-- evidence whatever its cosine says. The stored similarity stays the raw
-- cosine: it is what the column documents.
-- ============================================================================

-- 1. Something to match prefixes against, and an index that makes LIKE '%x%' fast.
alter table public.education_program_units
  add column if not exists body_norm text
  generated always as (
    lower(coalesce(title_fi, '') || ' ' || coalesce(heading, '') || ' ' || coalesce(body, ''))
  ) stored;

comment on column public.education_program_units.body_norm is
  'Lowercased title + heading + body, for prefix matching against skill anchors (0016). Generated; never written by the import.';

create index if not exists idx_epu_body_norm_trgm
  on public.education_program_units
  using gin (body_norm gin_trgm_ops);

-- 2. The anchors themselves, next to the vector they are fused with.
alter table public.skill_query_embeddings
  add column if not exists anchor_prefixes text[];

comment on column public.skill_query_embeddings.anchor_prefixes is
  'Up to three lowercase prefixes from the skill label that occur in few enough qualifications to identify one, most selective first. Null or empty when the label has no selective term. Built by scripts/build-skill-anchors.mjs.';

-- 3. Writing the anchors back.
--
--    An upsert cannot do this: skill_query_embeddings.embedding is NOT NULL, so
--    the INSERT half of an upsert fails even for rows that exist, and one
--    request per skill is 14,257 round trips. This takes a batch as jsonb and
--    updates in place.
create or replace function public.set_skill_anchors(p_rows jsonb)
returns integer
language plpgsql
volatile
as $$
declare
  touched integer;
begin
  with incoming as (
    select
      e->>'u' as concept_uri,
      case
        when e->'a' is null or jsonb_typeof(e->'a') <> 'array' then null
        else array(select jsonb_array_elements_text(e->'a'))
      end as anchors
    from jsonb_array_elements(p_rows) e
  )
  update public.skill_query_embeddings q
     set anchor_prefixes = i.anchors
    from incoming i
   where q.concept_uri = i.concept_uri;

  get diagnostics touched = row_count;
  return touched;
end;
$$;

revoke all on function public.set_skill_anchors(jsonb) from public;
grant execute on function public.set_skill_anchors(jsonb) to service_role;

-- 4. The fused query. The old signature is dropped rather than overloaded:
--    PostgREST resolves by argument names and would find two candidates.
drop function if exists public.link_skills_to_units(integer, double precision, integer, integer, integer);

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
      -- ... plus every unit that names the skill, however it ranks by vector
      (
        select u.program_id, 1 - (u.embedding <=> b.embedding) as sim, true as lexical
        from public.education_program_units u
        where b.anchor_prefixes is not null
          and array_length(b.anchor_prefixes, 1) > 0
          and u.body_norm like any (array(select '%' || a || '%' from unnest(b.anchor_prefixes) a))
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
