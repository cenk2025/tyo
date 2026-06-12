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
