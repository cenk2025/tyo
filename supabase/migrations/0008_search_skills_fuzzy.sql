-- ============================================================================
-- SkillPath — 0008 fuzzy skill search (trigram similarity, not ILIKE)
--
-- Why: searchSkills() in queries.ts does `label ILIKE '%query%'` — substring
-- containment. That fails whenever the extracted skill phrase and the ESCO
-- label don't share a contiguous substring, which is routine in Finnish
-- compounds ("tiiminjohtaminen" vs ESCO's "johtaa tiimiä" — neither contains
-- the other, even though they're the same skill and share plenty of trigrams).
--
-- This RPC ranks by pg_trgm similarity() instead of filtering by substring, so
-- morphological/word-order variation degrades gracefully instead of returning
-- nothing. It widens RECALL for the AI-assist resolver in
-- src/lib/ai/resolve-skills.ts, which then has Claude pick the genuine matches
-- out of this candidate list — this function is not the final arbiter of
-- correctness, only of "worth showing the model."
--
-- similarity_threshold is lowered (session-local, via `set_config(..., true)`
-- so it never leaks past this function call) because the default 0.3 is tuned
-- for typo-tolerant search, not cross-morphology matching.
--
-- Uses the gin_trgm_ops indexes already created in 0002 (the `%` operator is
-- GIN-accelerated; similarity() itself is not indexed but only runs over the
-- rows the `%` filter already narrowed down).
-- Re-runnable.
-- ============================================================================

create or replace function public.search_skills_fuzzy(
  p_query  text,
  p_locale text default 'fi',
  p_limit  integer default 8
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
  similarity         real
)
language plpgsql
stable
as $$
begin
  perform set_config('pg_trgm.similarity_threshold', '0.15', true);

  return query
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
    greatest(
      similarity(coalesce(s.preferred_label_fi, ''), p_query),
      similarity(coalesce(s.alt_labels_fi, ''), p_query),
      similarity(coalesce(s.preferred_label_en, ''), p_query),
      similarity(coalesce(s.alt_labels_en, ''), p_query)
    ) as similarity
  from public.skills s
  where (p_locale = 'fi' and (
          coalesce(s.preferred_label_fi, '') % p_query
          or coalesce(s.alt_labels_fi, '') % p_query
        ))
     or (p_locale <> 'fi' and (
          coalesce(s.preferred_label_en, '') % p_query
          or coalesce(s.alt_labels_en, '') % p_query
        ))
  order by similarity desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.search_skills_fuzzy(text, text, integer)
  to anon, authenticated;
