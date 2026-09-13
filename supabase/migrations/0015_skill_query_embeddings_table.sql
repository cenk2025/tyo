-- ============================================================================
-- SkillPath — 0015 move the query vectors off the skills table
--
-- 0014 added skills.embedding_fi_q512 and the backfill could not write it:
-- 200-row batches timed out, then 25-row batches timed out. The column was not
-- the problem — the table was. Updating a skills row rewrites its tuple and
-- every index over it, and skills carries idx_skills_embedding_fi_hnsw, a
-- 2048-dimension HNSW index (0010). An HNSW insert costs several times an HNSW
-- search, and a search on this instance measures at 172 ms, so 25 updates is
-- already past the statement timeout.
--
-- The usual answer — drop the index, bulk load, rebuild — works but takes the
-- live site's semantic search down for the duration of the rebuild. There is no
-- reason to pay that: nothing about these vectors belongs to the skills row.
-- They are one derived artefact of one batch job, written once and read by one
-- function. A table of their own has no index to maintain, so the write costs
-- what a write should cost, and the live search is never touched.
--
-- The two superseded columns go with it. embedding_fi_512 (0013) was the
-- stop-gap that made the join fast enough to run at all, and embedding_fi_q512
-- (0014) never received a single row.
-- ============================================================================

create table if not exists public.skill_query_embeddings (
  concept_uri text primary key references public.skills (concept_uri) on delete cascade,
  embedding   halfvec(512) not null
);

comment on table public.skill_query_embeddings is
  'ESCO skill text embedded with input_type=query and truncated to 512 dimensions, for use as the QUERY side of link_skills_to_units. Deliberately a separate table: skills carries an HNSW index that makes every update to it expensive (0015). Written by scripts/backfill-skill-query-embeddings.mjs.';

-- No vector index here on purpose. This side of the join is read in
-- concept_uri order, a batch at a time — it is the driver, never the thing
-- searched — so an index would cost writes and buy nothing.

alter table public.skill_query_embeddings enable row level security;
-- No policy: the import runs as service_role, which bypasses RLS. Nothing in
-- the app reads this table, and nothing should.

alter table public.skills drop column if exists embedding_fi_q512;
alter table public.skills drop column if exists embedding_fi_512;

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
    select q.concept_uri, q.embedding
    from public.skill_query_embeddings q
    order by q.concept_uri
    offset greatest(p_offset, 0)
    limit greatest(p_limit, 1)
  ),
  hits as (
    select b.concept_uri, t.program_id, t.sim
    from batch b
    cross join lateral (
      select z.program_id, max(z.sim) as sim
      from (
        select u.program_id, 1 - (u.embedding <=> b.embedding) as sim
        from public.education_program_units u
        where u.embedding is not null
        order by u.embedding <=> b.embedding
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
