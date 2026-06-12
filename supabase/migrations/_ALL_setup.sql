-- SkillPath — combined setup (run once). Schema + RLS + indexes + RPC.
-- Generated from 0000–0004; paste into Supabase SQL editor if not loading via psql.

-- ============================================================
-- 0000_esco_tables.sql
-- ============================================================
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

-- ============================================================
-- 0001_user_tables.sql
-- ============================================================
-- ============================================================================
-- SkillPath — 0001 user tables + RLS
-- Run this in the Supabase SQL editor (Database → SQL editor) AFTER the ESCO
-- tables (occupations, skills, occupation_skill_relations) have been imported.
-- Re-runnable: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_profiles — one row per auth user (auto-created on signup, see trigger).
-- ----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  current_occupation_uri text references public.occupations(concept_uri) on delete set null,
  locale text not null default 'fi',
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- user_skills — the skills a user claims to have.
-- ----------------------------------------------------------------------------
create table if not exists public.user_skills (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_uri text not null references public.skills(concept_uri) on delete cascade,
  source text check (source in ('search','occupation_prefill','transversal','ai_suggested')),
  added_at timestamptz not null default now(),
  primary key (user_id, skill_uri)
);

-- ----------------------------------------------------------------------------
-- user_target_occupations — occupations the user is aiming toward.
-- ----------------------------------------------------------------------------
create table if not exists public.user_target_occupations (
  user_id uuid not null references auth.users(id) on delete cascade,
  occupation_uri text not null references public.occupations(concept_uri) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, occupation_uri)
);

-- ----------------------------------------------------------------------------
-- user_learning_list — kanban of skills the user plans to learn.
-- ----------------------------------------------------------------------------
create table if not exists public.user_learning_list (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_uri text not null references public.skills(concept_uri) on delete cascade,
  status text not null default 'planned' check (status in ('planned','in_progress','done')),
  added_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, skill_uri)
);

-- ----------------------------------------------------------------------------
-- user_match_snapshots — time series powering the "progress over time" chart.
-- ----------------------------------------------------------------------------
create table if not exists public.user_match_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  occupation_uri text not null references public.occupations(concept_uri) on delete cascade,
  essential_coverage numeric not null default 0,
  optional_coverage numeric not null default 0,
  snapshot_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'locale', 'fi')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Row Level Security: users can only touch their own rows.
-- ----------------------------------------------------------------------------
alter table public.user_profiles            enable row level security;
alter table public.user_skills              enable row level security;
alter table public.user_target_occupations  enable row level security;
alter table public.user_learning_list       enable row level security;
alter table public.user_match_snapshots     enable row level security;

-- user_profiles (keyed by id = auth.uid())
drop policy if exists "profiles_select_own" on public.user_profiles;
create policy "profiles_select_own" on public.user_profiles
  for select using (id = auth.uid());
drop policy if exists "profiles_insert_own" on public.user_profiles;
create policy "profiles_insert_own" on public.user_profiles
  for insert with check (id = auth.uid());
drop policy if exists "profiles_update_own" on public.user_profiles;
create policy "profiles_update_own" on public.user_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles_delete_own" on public.user_profiles;
create policy "profiles_delete_own" on public.user_profiles
  for delete using (id = auth.uid());

-- Helper: generate identical owner-only policies for the user_id tables.
do $$
declare t text;
begin
  foreach t in array array[
    'user_skills','user_target_occupations','user_learning_list','user_match_snapshots'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid())', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for delete using (user_id = auth.uid())', t || '_delete_own', t);
  end loop;
end $$;

-- ============================================================
-- 0002_indexes_trgm.sql
-- ============================================================
-- ============================================================================
-- SkillPath — 0002 indexes + trigram fuzzy search
-- Speeds up occupation/skill matching and the search-as-you-type flows.
-- ============================================================================

create extension if not exists pg_trgm;

-- Relation lookups (matching RPC + gap analysis both join heavily on these).
create index if not exists idx_osr_skill_uri
  on public.occupation_skill_relations (skill_uri);
create index if not exists idx_osr_occupation_uri
  on public.occupation_skill_relations (occupation_uri);

-- User skill lookups.
create index if not exists idx_user_skills_user
  on public.user_skills (user_id);
create index if not exists idx_user_targets_user
  on public.user_target_occupations (user_id);
create index if not exists idx_user_learning_user
  on public.user_learning_list (user_id);
create index if not exists idx_snapshots_user_time
  on public.user_match_snapshots (user_id, snapshot_at);

-- Trigram GIN indexes backing case-insensitive ILIKE '%q%' search on labels.
create index if not exists idx_occ_label_fi_trgm
  on public.occupations using gin (preferred_label_fi gin_trgm_ops);
create index if not exists idx_occ_label_en_trgm
  on public.occupations using gin (preferred_label_en gin_trgm_ops);
create index if not exists idx_occ_alt_fi_trgm
  on public.occupations using gin (alt_labels_fi gin_trgm_ops);
create index if not exists idx_occ_alt_en_trgm
  on public.occupations using gin (alt_labels_en gin_trgm_ops);

create index if not exists idx_skill_label_fi_trgm
  on public.skills using gin (preferred_label_fi gin_trgm_ops);
create index if not exists idx_skill_label_en_trgm
  on public.skills using gin (preferred_label_en gin_trgm_ops);
create index if not exists idx_skill_alt_fi_trgm
  on public.skills using gin (alt_labels_fi gin_trgm_ops);
create index if not exists idx_skill_alt_en_trgm
  on public.skills using gin (alt_labels_en gin_trgm_ops);

-- Description trigram (used by the AI-assist trigram stub).
create index if not exists idx_skill_desc_fi_trgm
  on public.skills using gin (description_fi gin_trgm_ops);
create index if not exists idx_skill_desc_en_trgm
  on public.skills using gin (description_en gin_trgm_ops);

-- Reuse-level filter (transversal skills grid in onboarding).
create index if not exists idx_skill_reuse_level
  on public.skills (reuse_level);

-- ============================================================
-- 0003_match_occupations.sql
-- ============================================================
-- ============================================================================
-- SkillPath — 0003 match_occupations RPC
-- The ranking engine. Coverage of essential skills is weighted 0.7, optional
-- 0.3. Called from the app via supabase.rpc('match_occupations', {p_user_id}).
--
-- Not SECURITY DEFINER: it runs as the caller, so RLS on user_skills means a
-- user can only score against their OWN skills (passing someone else's id just
-- yields zero matches).
-- ============================================================================

create or replace function public.match_occupations(p_user_id uuid)
returns table (
  occupation_uri text,
  code text,
  isco_group text,
  preferred_label_en text,
  preferred_label_fi text,
  essential_coverage numeric,
  optional_coverage numeric,
  score numeric,
  matched_essential integer,
  total_essential integer,
  matched_optional integer,
  total_optional integer
)
language sql
stable
as $$
  with user_sk as (
    select skill_uri from public.user_skills where user_id = p_user_id
  ),
  occ_stats as (
    select
      r.occupation_uri,
      count(*) filter (where r.relation_type = 'essential')                                   as total_essential,
      count(*) filter (where r.relation_type = 'optional')                                    as total_optional,
      count(*) filter (where r.relation_type = 'essential' and us.skill_uri is not null)       as matched_essential,
      count(*) filter (where r.relation_type = 'optional'  and us.skill_uri is not null)       as matched_optional
    from public.occupation_skill_relations r
    left join user_sk us on us.skill_uri = r.skill_uri
    group by r.occupation_uri
  ),
  scored as (
    select
      s.occupation_uri,
      s.total_essential,
      s.total_optional,
      s.matched_essential,
      s.matched_optional,
      case when s.total_essential > 0 then s.matched_essential::numeric / s.total_essential else 0 end as essential_coverage,
      case when s.total_optional  > 0 then s.matched_optional::numeric  / s.total_optional  else 0 end as optional_coverage
    from occ_stats s
    where s.matched_essential + s.matched_optional > 0   -- only occupations the user shares skills with
  )
  select
    o.concept_uri                                                        as occupation_uri,
    o.code,
    o.isco_group,
    o.preferred_label_en,
    o.preferred_label_fi,
    round(sc.essential_coverage, 4)                                      as essential_coverage,
    round(sc.optional_coverage, 4)                                       as optional_coverage,
    round(0.7 * sc.essential_coverage + 0.3 * sc.optional_coverage, 4)   as score,
    sc.matched_essential::int,
    sc.total_essential::int,
    sc.matched_optional::int,
    sc.total_optional::int
  from scored sc
  join public.occupations o on o.concept_uri = sc.occupation_uri
  order by score desc, sc.matched_essential desc
  limit 30;
$$;

grant execute on function public.match_occupations(uuid) to anon, authenticated;

-- ============================================================
-- 0004_esco_rls.sql
-- ============================================================
-- ============================================================================
-- SkillPath — 0004 ESCO read-only RLS
-- ESCO reference data is public knowledge: anyone (anon or authenticated) may
-- read it, nobody may write it through the API. Adjust table names here if your
-- imported ESCO tables differ.
-- ============================================================================

alter table public.occupations               enable row level security;
alter table public.skills                     enable row level security;
alter table public.occupation_skill_relations enable row level security;

drop policy if exists "esco_occupations_read" on public.occupations;
create policy "esco_occupations_read" on public.occupations
  for select using (true);

drop policy if exists "esco_skills_read" on public.skills;
create policy "esco_skills_read" on public.skills
  for select using (true);

drop policy if exists "esco_relations_read" on public.occupation_skill_relations;
create policy "esco_relations_read" on public.occupation_skill_relations
  for select using (true);

-- No INSERT / UPDATE / DELETE policies are defined, so writes are denied for
-- the anon and authenticated roles (service_role still bypasses RLS for imports).

