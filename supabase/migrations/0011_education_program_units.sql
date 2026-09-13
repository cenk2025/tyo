-- ============================================================================
-- SkillPath — 0011 reverse the education↔skill search
--
-- What was wrong
-- --------------
-- 0009 matched qualifications to skills by asking each text "which ESCO skills
-- are nearest to you?" and keeping the top N. Moving from one text per
-- qualification to one text per tutkinnon osa (8,485 texts) made the texts
-- concrete but did not fix the result, and measuring the cached candidate pools
-- says why:
--
--     8,485 pools of 40 candidates
--     8,323 distinct skills appear in at least one pool
--     14,257 skills have an embedding
--   → 5,934 skills (42%) are unreachable in this direction, at any threshold
--     most frequent skill: in 2,567 pools (30% of all osat); median skill: 8
--
-- Asking each osa for its nearest skills lets a handful of skills win every
-- pool while four out of ten skills enter none. That is hubness, and it is a
-- property of the direction of the query, not of the ranking applied after it:
-- a skill that never appears in a candidate list cannot be rescued by
-- reweighting candidate lists. Two rounds of hub penalties in the import script
-- confirmed it — the identity of the hubs changed each run, their magnitude
-- (110–170 qualifications each) did not, while "asentaa pistorasioita",
-- "jatkaa kaapeleita" and "liittää johtoja" stayed at zero.
--
-- What this does instead
-- ---------------------
-- Ask the question the other way round: for each ESCO skill, which tutkinnon
-- osat are nearest to IT, and keep the best p_k qualifications behind them.
-- Two properties follow by construction rather than by tuning:
--   - every skill gets its own best match, so no skill is unreachable;
--   - every skill produces at most p_k links, so no skill can be a hub.
-- The scarce side of the join (14,257 skills) becomes the driver, and the
-- abundant side (8,485 osat) becomes the index lookup — which is the right way
-- round for a k-NN join whenever one side is much larger than the other.
--
-- Cost: one embedding per osa (already spent), and 14,257 index lookups.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- One row per tutkinnon osa, with its embedding stored rather than thrown away
-- after the import. Storing it is what makes the reverse query possible at all
-- (it has to run inside the database, next to the skill vectors), and it makes
-- re-linking with different parameters free — no re-embedding.
-- ----------------------------------------------------------------------------
-- osa_id is NOT the primary key, although it looks like one. ePerusteet's
-- yhteiset tutkinnon osat — the shared units (communication, maths, working
-- life) that every qualification carries — are one record referenced by many
-- perusteet, so the same osa id legitimately arrives under several programmes
-- and a single-column key rejects the import outright ("ON CONFLICT DO UPDATE
-- command cannot affect row a second time"). The row identity here is the
-- PAIRING of a unit with a qualification, which is what the rollup needs.
create table if not exists public.education_program_units (
  id         bigint generated always as identity primary key,
  osa_id     bigint not null,             -- ePerusteet tutkinnon osa id, not unique on its own
  program_id bigint not null references public.education_programs (id) on delete cascade,
  title_fi   text not null default '',
  body       text not null,
  embedding  halfvec(2048),
  unique (program_id, osa_id)
);

comment on table public.education_program_units is
  'Tutkinnon osat (units) of each qualification with their Finnish text embedded. Written by scripts/import-education-programs.mjs; the embedding column is what education_program_skills is derived from.';

create index if not exists idx_epu_program on public.education_program_units (program_id);

-- Small table (~8.5k rows), but the reverse query runs one nearest-neighbour
-- lookup per skill — 14,257 of them. Without the index that is 121M full
-- distance computations and the run does not finish; with it, each lookup is a
-- graph descent. Same halfvec/HNSW setup as skills.embedding_fi in 0010.
drop index if exists idx_epu_embedding_hnsw;
create index idx_epu_embedding_hnsw
  on public.education_program_units
  using hnsw (embedding halfvec_cosine_ops);

alter table public.education_program_units enable row level security;

drop policy if exists "education_program_units_read" on public.education_program_units;
create policy "education_program_units_read" on public.education_program_units
  for select using (true);

-- ----------------------------------------------------------------------------
-- The reverse join itself, one batch of skills per call.
--
-- Batched rather than run as a single statement because 14,257 lateral lookups
-- in one transaction is exactly the shape that hit "canceling statement due to
-- statement timeout" in 0010. The caller loops over p_offset until the table is
-- exhausted; each call is independently small enough to finish.
--
-- p_probe vs p_k: the p_probe nearest OSAT are fetched, then collapsed to their
-- qualifications and the best p_k qualifications kept. Collapsing after the
-- lookup matters — a skill's three nearest units are often three units of the
-- same qualification, and taking the top p_k units directly would spend the
-- whole allowance on one programme.
-- ----------------------------------------------------------------------------
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
    select s.concept_uri, s.embedding_fi
    from public.skills s
    where s.embedding_fi is not null
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
        select u.program_id, 1 - (u.embedding <=> b.embedding_fi) as sim
        from public.education_program_units u
        where u.embedding is not null
        order by u.embedding <=> b.embedding_fi
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

comment on function public.link_skills_to_units(integer, double precision, integer, integer, integer) is
  'For each skill in one batch, find its nearest tutkinnon osat and link the best p_k qualifications. Called in a loop by scripts/import-education-programs.mjs; writes education_program_skills.';

-- Write path: the import script only, which runs as service_role.
revoke all on function public.link_skills_to_units(integer, double precision, integer, integer, integer) from public;
grant execute on function public.link_skills_to_units(integer, double precision, integer, integer, integer)
  to service_role;
