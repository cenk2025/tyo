-- ============================================================================
-- SkillPath — 0013 cut the unit embeddings to 512 dimensions
--
-- 0011's reverse join is one HNSW lookup per ESCO skill, 14,257 of them, and on
-- this instance each one measures at 172 ms warm (EXPLAIN ANALYZE confirms the
-- index IS used; the time is CPU on 2048-dimension distances, not I/O). That is
-- 41 minutes of database time for one link pass — over the statement timeout in
-- any batch worth making, and slow enough that re-linking with different
-- parameters stops being something anyone does casually, which was the point of
-- --relink-only.
--
-- Dimension is the only lever that changes this by a factor. It is available
-- here because the model turns out to be trained with Matryoshka representation
-- learning: the first k dimensions are a usable embedding on their own. That is
-- a claim to measure, not to take on faith, so scripts/probe-truncation.mjs
-- compares each truncation's top-20 neighbours against the full vector's, over
-- the cached unit embeddings:
--
--     1024  recall@20 0.931
--      768            0.904
--      512            0.866      <- chosen
--      384            0.842
--      256            0.800
--
-- 512 keeps 87% of the exact neighbours at a quarter of the distance cost, and
-- the loss that matters is smaller than that number suggests: the query takes
-- the 40 nearest units and collapses them to 3 QUALIFICATIONS, so a neighbour
-- swapped for another neighbour of the same qualification changes nothing.
--
-- No re-embedding: subvector() cuts the stored vectors in place.
--
-- Only the unit vectors are converted in place. skills.embedding_fi stays at
-- 2048 because the app's own semantic search (match_skills_semantic, 0010) runs
-- against it and is a single query per request, where 172 ms is irrelevant and
-- recall is worth more; it gains a second, shorter column used only by the
-- import.
-- ============================================================================

-- 1. Units: 2048 -> 512 in place. The index must go first — it is built over
--    the old type and would have to be rewritten anyway.
drop index if exists idx_epu_embedding_hnsw;

alter table public.education_program_units
  alter column embedding type halfvec(512)
  using subvector(embedding::vector, 1, 512)::halfvec(512);

comment on column public.education_program_units.embedding is
  'First 512 dimensions of the Finnish requirement-group embedding (Matryoshka truncation; see 0013). The full 2048-dimension vectors are kept locally in .cache/unit-embeddings.jsonl, not in the database.';

-- 2. Skills: an extra truncated column, leaving embedding_fi alone.
alter table public.skills
  add column if not exists embedding_fi_512 halfvec(512);

update public.skills
   set embedding_fi_512 = subvector(embedding_fi::vector, 1, 512)::halfvec(512)
 where embedding_fi is not null
   and embedding_fi_512 is null;

comment on column public.skills.embedding_fi_512 is
  'First 512 dimensions of embedding_fi, for the education-link import only (0013). The app queries embedding_fi at full length.';

-- 3. Index after the load, as in 0010.
create index idx_epu_embedding_hnsw
  on public.education_program_units
  using hnsw (embedding halfvec_cosine_ops);

analyze public.education_program_units;
analyze public.skills;

-- 4. Same query, shorter vectors.
create or replace function public.link_skills_to_units(
  p_k              integer default 3,
  p_min_similarity double precision default 0.40,
  p_offset         integer default 0,
  p_limit          integer default 400,
  p_probe          integer default 40
)
returns integer
language plpgsql
volatile
as $$
declare
  inserted integer;
begin
  with batch as (
    select s.concept_uri, s.embedding_fi_512
    from public.skills s
    where s.embedding_fi_512 is not null
    order by s.concept_uri
    offset greatest(p_offset, 0)
    limit greatest(p_limit, 1)
  ),
  hits as (
    select b.concept_uri, t.program_id, t.sim
    from batch b
    cross join lateral (
      select z.program_id, max(z.sim) as sim
      from (
        select u.program_id, 1 - (u.embedding <=> b.embedding_fi_512) as sim
        from public.education_program_units u
        where u.embedding is not null
        order by u.embedding <=> b.embedding_fi_512
        limit greatest(p_probe, 1)
      ) z
      group by z.program_id
      order by 2 desc
      limit greatest(p_k, 1)
    ) t
    where t.sim >= p_min_similarity
  ),
  ins as (
    insert into public.education_program_skills (program_id, skill_uri, similarity)
    select h.program_id, h.concept_uri, h.sim
    from hits h
    on conflict (program_id, skill_uri) do update
      set similarity = greatest(education_program_skills.similarity, excluded.similarity)
    returning 1
  )
  select count(*) into inserted from ins;

  return inserted;
end;
$$;

revoke all on function public.link_skills_to_units(integer, double precision, integer, integer, integer) from public;
grant execute on function public.link_skills_to_units(integer, double precision, integer, integer, integer)
  to service_role;
