-- ============================================================================
-- SkillPath — 0000 ESCO reference tables (schema only)
-- Run this FIRST, before 0001–0004. Creates the read-only ESCO tables that the
-- app reads from. Import the actual ESCO v1.2.1 data afterwards — see
-- ESCO_IMPORT.md for the bilingual CSV → these-tables recipe.
--
-- Column shapes match src/lib/esco/types.ts. If you change a column name here,
-- update the SELECT projections in src/lib/esco/queries.ts to match.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- Occupations (one row per ESCO occupation, EN + FI labels merged into columns)
create table if not exists public.occupations (
  concept_uri        text primary key,
  isco_group         text,
  code               text,
  preferred_label_en text,
  preferred_label_fi text,
  alt_labels_en      text,
  alt_labels_fi      text,
  description_en     text,
  description_fi     text
);

-- Skills / knowledge (EN + FI labels merged into columns)
create table if not exists public.skills (
  concept_uri        text primary key,
  skill_type         text,   -- 'skill/competence' | 'knowledge'
  reuse_level        text,   -- 'transversal' | 'cross-sector' | 'sector-specific' | 'occupation-specific'
  preferred_label_en text,
  preferred_label_fi text,
  alt_labels_en      text,
  alt_labels_fi      text,
  description_en     text,
  description_fi     text
);

-- Occupation ⇄ skill relations (language-independent)
create table if not exists public.occupation_skill_relations (
  occupation_uri text not null references public.occupations(concept_uri) on delete cascade,
  skill_uri      text not null references public.skills(concept_uri) on delete cascade,
  relation_type  text not null,   -- 'essential' | 'optional'
  primary key (occupation_uri, skill_uri, relation_type)
);
