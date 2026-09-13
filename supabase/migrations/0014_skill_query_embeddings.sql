-- ============================================================================
-- SkillPath — 0014 embed the skill side as a QUERY, not as a passage
--
-- The education matcher kept ranking the wrong trade first: "asentaa
-- pistorasioita" (fit sockets) retrieved stone masonry and rainwater systems
-- ahead of the electrical qualification, inside a similarity band 0.014 wide.
-- Three explanations were tried and measured away before this one:
--
--   - shared boilerplate diluting every group — rejected: 48% of requirement
--     lines occur in exactly one qualification (scripts/analyze-lines.mjs)
--   - too-coarse chunks — rejected: the single line naming sockets scores 0.525
--     against the skill, the eight-line group containing it 0.536
--     (scripts/probe-granularity.mjs)
--   - hubness in the ranking — addressed in 0011 and real, but it was a
--     symptom: the scores it was reweighting were themselves undiscriminating
--
-- What was actually wrong is the retrieval setup. NVIDIA's endpoint takes an
-- input_type, which tells an asymmetrically-trained model which side of a
-- search a text is on. Both sides here were sent as "passage" — the skills in
-- backfill-skill-embeddings.mjs, the units in the education import — so the
-- model was never asked to do the asymmetric part. Measured on the same four
-- electrical skills against the correct group and three distractors
-- (scripts/probe-input-type.mjs, cosine at 512 dimensions):
--
--                                   passage        query
--     RIGHT  sähköasennukset          0.616        0.623
--     wrong  lämmitysjärjestelmä      0.447        0.426
--     wrong  käyttövesijärjestelmä    0.409        0.361
--     wrong  koneautomaatio           0.376        0.315
--
-- The right answer barely moves and the distractors fall away; the margin on
-- "jatkaa kaapeleita" goes from 0.03 to 0.20. That is the separation the whole
-- pipeline was missing.
--
-- This needs a SECOND vector per skill rather than a corrected one, because the
-- two uses sit on opposite sides of the asymmetry:
--
--   - match_skills_semantic (0010) searches FOR skills given a user's text.
--     There the skills are the corpus — "passage" is right, embedding_fi stays.
--   - link_skills_to_units (0011) searches FOR units given a skill. There each
--     skill is the query, and that is what embedding_fi_q512 holds.
--
-- Truncated to 512 dimensions for the same reason as 0013: it is only ever
-- compared against the units, which are stored at 512.
-- ============================================================================

alter table public.skills
  add column if not exists embedding_fi_q512 halfvec(512);

comment on column public.skills.embedding_fi_q512 is
  'Same Finnish text as embedding_fi, embedded with input_type=query and truncated to 512 dimensions. Used only as the QUERY side of link_skills_to_units (0014); the app searches embedding_fi. Filled by scripts/backfill-skill-query-embeddings.mjs.';

-- embedding_fi_512 (0013) was the stop-gap that made the join fast enough to
-- run; it is the passage-side vector and is superseded by this one. Kept for
-- one migration so a re-link can be compared against it, dropped in 0015.

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
    select s.concept_uri, s.embedding_fi_q512
    from public.skills s
    where s.embedding_fi_q512 is not null
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
        select u.program_id, 1 - (u.embedding <=> b.embedding_fi_q512) as sim
        from public.education_program_units u
        where u.embedding is not null
        order by u.embedding <=> b.embedding_fi_q512
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
