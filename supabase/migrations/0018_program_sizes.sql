-- ============================================================================
-- SkillPath — 0018 rank qualifications by how MUCH of them the overlap is
--
-- With the link table finally populated properly (~340 skills per
-- qualification, against 10 before), ranking suggestions by raw overlap count
-- started favouring the broadest qualifications rather than the closest ones.
-- Merenkulkualan perustutkinto — marine, which genuinely teaches a little
-- electrical work, a little logistics, a little first aid, and carries 1,002
-- linked skills — came first for sähköasentaja on 7 shared skills, ahead of
-- Sähkö- ja automaatioalan perustutkinto's 5. It also came second for bus
-- driver. A breadth that wins every comparison is not a match, it is a hub, and
-- it is the same failure the skill side had in 0011, one level up.
--
-- Scoring covered² / total fixes it: coverage still counts twice over, breadth
-- divides it out. Measured over five occupations whose right answer is not in
-- doubt, it puts the correct qualification first in all five, where raw counts
-- managed four:
--
--     sähköasentaja    Sähkö- ja automaatioalan pt   5/129   0.194
--                      Merenkulkualan pt             7/1002  0.049
--
-- The one guard it needs is a floor on total. A qualification with 12 linked
-- skills scores 5/12 = 2.08 and wins everything — but 12 is not a narrow
-- qualification, it is an under-linked one, an artefact of matching rather than
-- a property of the degree. 49 of 328 qualifications sit under 50 links and are
-- excluded from ranking on that basis; the rest have hundreds.
--
-- A view rather than a stored column: it is derived from a table the import
-- rewrites wholesale, and nothing should be able to disagree with it.
-- ============================================================================

create or replace view public.education_program_sizes as
select
  program_id,
  count(*)::int as skill_count
from public.education_program_skills
group by program_id;

-- The underlying table is public-read (0009); the view should decide nothing on
-- its own, so it runs with the caller's rights rather than the definer's.
alter view public.education_program_sizes set (security_invoker = on);

comment on view public.education_program_sizes is
  'How many ESCO skills each qualification is linked to. Used to normalise overlap counts when ranking suggestions (0018), so that broad qualifications do not win on breadth alone.';

grant select on public.education_program_sizes to anon, authenticated, service_role;
