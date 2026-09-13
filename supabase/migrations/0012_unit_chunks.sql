-- ============================================================================
-- SkillPath — 0012 one vector per requirement group, not per tutkinnon osa
--
-- 0011 fixed the direction of the search and the concrete skills stopped being
-- unreachable. It left a second problem, visible as soon as the links were
-- counted per qualification:
--
--   Sähkö- ja automaatioalan ammattitutkinto        19 osaa   198 skills
--   Sähkö- ja automaatioalan erikoisammattitutkinto 16 osaa   162 skills
--   Sähkö- ja automaatioalan PERUSTUTKINTO          22 osaa     7 skills
--
-- The entry-level qualification in the trade — the one a jobseeker is actually
-- pointed at — had 22 units and almost no skills. Its units are not missing,
-- they are too broad: 1,900-3,000 characters each, one of them truncated at the
-- import cap. A perustutkinnon osa is a 45-competence-point block covering
-- safety, electrical theory, materials and installation at once. Averaged into
-- a single vector it sits near the centre of the trade and close to nothing in
-- particular, so it loses every specific skill's top-3 to the narrower units of
-- the further qualifications.
--
-- Reading the source markup showed the fix is already written into the data.
-- ePerusteet groups ammattitaitovaatimukset under <b> headings —
--
--   <b>Opiskelija tekee pien- ja pienoisjännitesähköasennukset</b>
--     <dd>toteuttaa ... pistorasioiden kytkennät</dd>
--     <dd>rakentaa johtotiet</dd>
--     <dd>asentaa erilaiset sähkö- ja tiedonsiirtokaapelit</dd>
--
-- — and each group is one coherent topic, a few hundred characters. Embedding
-- the group rather than the whole osa is what lets "asentaa pistorasioita" find
-- the paragraph that actually mentions socket connections instead of competing
-- against everything else the block teaches.
--
-- (The same reading found a plain bug: listItems() looked for <li>, which this
-- document does not contain — it uses <dd style="display: list-item;">. Every
-- unit text imported so far was therefore one unsplit blob. Fixed in the script.)
--
-- Row identity becomes (programme, unit, chunk). Nothing else changes: the
-- reverse query in 0011 already works per row and rolls up by program_id.
-- ============================================================================

alter table public.education_program_units
  add column if not exists chunk_index integer not null default 0,
  add column if not exists heading     text    not null default '';

comment on column public.education_program_units.chunk_index is
  'Position of this requirement group within its tutkinnon osa. 0 for an osa that has no <b> groups and is stored whole.';
comment on column public.education_program_units.heading is
  'The <b> heading the group sits under ("Opiskelija tekee pien- ja pienoisjännitesähköasennukset"). Kept for inspecting why a skill matched.';

-- Swap the uniqueness: a unit now contributes several rows.
alter table public.education_program_units
  drop constraint if exists education_program_units_program_id_osa_id_key;

create unique index if not exists education_program_units_program_osa_chunk_key
  on public.education_program_units (program_id, osa_id, chunk_index);
