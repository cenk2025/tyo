-- ============================================================================
-- SkillPath — 0007 Finnish skill embeddings (pgvector)
--
-- Why: AI-assist resolves Claude's canonical skill phrases to real ESCO rows by
-- trigram ILIKE. That works when the wording happens to overlap and fails when
-- it doesn't — which in Finnish is most of the time ("kassatyö" shares no
-- trigram with "käsitellä maksutapahtumia"). Vector similarity resolves by
-- meaning instead of by spelling.
--
-- Scope: additive only. `match_occupations()` is untouched — occupation ranking
-- still works on exact skill-URI set intersection, which is correct as it is.
-- Embeddings only improve which skill URIs land in `user_skills` to begin with.
--
-- Dimensions: nvidia/nemotron-3-embed-1b returns 2048 floats.
-- ============================================================================

create extension if not exists vector;

alter table public.skills
  add column if not exists embedding_fi         vector(2048),
  add column if not exists embedding_model      text,
  add column if not exists embedding_updated_at timestamptz;

comment on column public.skills.embedding_fi is
  'Finnish label + alt labels + description, embedded for semantic lookup. Null until backfilled.';
comment on column public.skills.embedding_model is
  'Provider/model that produced embedding_fi. Re-embed the whole table when this changes — vectors from different models are not comparable.';

-- No index on embedding_fi, deliberately. An HNSW index was tried and dropped:
-- at this table's size (~14k rows), a sequential scan over halfvec(2048) is
-- ~100ms — an HNSW index buys speed the query doesn't need while giving up
-- exact nearest-neighbor for approximate, which costs recall in a pipeline
-- that's already recall-constrained (see resolve-hybrid.ts). It also turned
-- bulk backfills into statement timeouts: every row UPDATE during
-- scripts/backfill-skill-embeddings.mjs does index maintenance, and that
-- maintenance cost grows with the index — worse the more of the table is
-- already embedded. match_skills_semantic below does a plain sequential scan;
-- revisit an index only if this table grows past ~100k rows.
--
-- If it's ever rebuilt: `set maintenance_work_mem = '512MB'` first (default is
-- too small for a 2048-dim build) and skip CONCURRENTLY on a table with no
-- live read traffic — it only doubles the build time for no benefit here.
--   create index idx_skills_embedding_fi_hnsw on public.skills
--     using hnsw ((embedding_fi::halfvec(2048)) halfvec_cosine_ops);

-- ----------------------------------------------------------------------------
-- Semantic skill lookup.
--
-- Mirrors the shape of the existing trigram search so the caller can swap one
-- for the other: same columns, ordered best-first. `similarity` is cosine
-- similarity in [-1, 1]; the caller applies its own floor rather than baking a
-- magic number into the schema.
--
-- Not SECURITY DEFINER: it reads public ESCO reference data under the same
-- read-only RLS policy as every other skills query (0004).
-- ----------------------------------------------------------------------------
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
    1 - (s.embedding_fi::halfvec(2048) <=> p_embedding::halfvec(2048)) as similarity
  from public.skills s
  where s.embedding_fi is not null
    and 1 - (s.embedding_fi::halfvec(2048) <=> p_embedding::halfvec(2048)) >= p_min_similarity
  order by s.embedding_fi::halfvec(2048) <=> p_embedding::halfvec(2048)
  limit greatest(p_limit, 1);
$$;

grant execute on function public.match_skills_semantic(vector, integer, double precision)
  to anon, authenticated;
