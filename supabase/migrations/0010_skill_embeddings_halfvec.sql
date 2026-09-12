-- ============================================================================
-- SkillPath — 0010 make semantic skill lookup fast enough to actually use
--
-- 0007 stored embeddings as vector(2048) and cast to halfvec at query time,
-- with no index, on the reasoning that a sequential scan over ~14k rows would
-- be fast enough. It isn't: scripts/import-education-programs.mjs hit
-- "canceling statement due to statement timeout" on match_skills_semantic once
-- the table was fully backfilled.
--
-- The dominant cost was not the scan. The old function body cast the column to
-- halfvec and computed the distance THREE times per row — once in the select
-- list, once in the where clause, once in the order by — and the where clause
-- (`>= p_min_similarity`, called with 0) filtered nothing while forcing the
-- full computation anyway. Three fixes, in order of how much they matter:
--
--   1. Store halfvec natively. The cast per row disappears entirely; the table
--      also halves in size. No re-embedding: the existing vectors cast in
--      place. 16-bit precision costs nothing measurable for retrieval — the
--      query-time cast in 0007 was already throwing those bits away.
--   2. Compute the distance once, in an inner query, and filter on the result
--      in an outer one. A predicate over the distance expression blocks index
--      use; ordering by it does not.
--   3. Build the HNSW index now that the data is loaded. This is the order
--      pgvector recommends and the order that failed the other way round in
--      0007 — incremental index maintenance during a 14k-row backfill is what
--      made the original import time out. Loading first and indexing once is
--      both faster to build and correct by construction.
--
-- Approximate search can miss a true nearest neighbour. At ef_search's default
-- that loss is small and recall here is already fused with trigram results
-- (resolve-hybrid.ts), so a rare missed candidate is absorbed. A query that
-- takes longer than the statement timeout has recall zero, which is worse.
-- ============================================================================

-- 1. Native halfvec ----------------------------------------------------------
alter table public.skills
  alter column embedding_fi type halfvec(2048)
  using embedding_fi::halfvec(2048);

comment on column public.skills.embedding_fi is
  'Finnish label + alt labels + description, embedded for semantic lookup. halfvec(2048); null until backfilled by scripts/backfill-skill-embeddings.mjs.';

-- 2. Index over the stored column, no expression ------------------------------
-- Raise maintenance_work_mem for the build if this is slow on a small instance:
--   set maintenance_work_mem = '512MB';
drop index if exists idx_skills_embedding_fi_hnsw;
create index idx_skills_embedding_fi_hnsw
  on public.skills
  using hnsw (embedding_fi halfvec_cosine_ops);

-- 3. One distance computation, index-friendly ordering ------------------------
-- Signature is unchanged (still takes a vector, so every existing caller and
-- the PostgREST text -> vector coercion keep working); the query vector is cast
-- once, as a constant, rather than the column being cast 14k times.
create or replace function public.match_skills_semantic(
  p_embedding      vector(2048),
  p_limit          integer default 10,
  p_min_similarity double precision default 0.0
)
returns table (
  concept_uri        text,
  skill_type         text,
  reuse_level        text,
  preferred_label_en text,
  preferred_label_fi text,
  description_en     text,
  description_fi     text,
  is_green           boolean,
  is_digital         boolean,
  similarity         double precision
)
language sql
stable
as $$
  with q as (select p_embedding::halfvec(2048) as v),
  nearest as (
    select
      s.concept_uri,
      s.skill_type,
      s.reuse_level,
      s.preferred_label_en,
      s.preferred_label_fi,
      s.description_en,
      s.description_fi,
      s.is_green,
      s.is_digital,
      s.embedding_fi <=> (select v from q) as distance
    from public.skills s
    where s.embedding_fi is not null
    order by s.embedding_fi <=> (select v from q)
    limit greatest(p_limit, 1)
  )
  select
    n.concept_uri,
    n.skill_type,
    n.reuse_level,
    n.preferred_label_en,
    n.preferred_label_fi,
    n.description_en,
    n.description_fi,
    n.is_green,
    n.is_digital,
    1 - n.distance as similarity
  from nearest n
  where 1 - n.distance >= p_min_similarity
  order by n.distance;
$$;

grant execute on function public.match_skills_semantic(vector, integer, double precision)
  to anon, authenticated, service_role;
