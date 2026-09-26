-- ============================================================================
-- SkillPath — 0019 LangFit (demo)
-- An employer pastes a job ad; LangFit splits the job into concrete tasks and,
-- per task, records which language is needed, at which CEFR level for each of
-- the four skills, by when, and why. ESCO carries the language skills
-- ("understand spoken X", "interact verbally in X", …) but no levels, so the
-- levels live here.
--
-- Design rules enforced in the schema, not just the UI:
--   * A task row is only ever stored after the employer has validated it
--     (`validated` is checked true). AI suggestions stay client-side until then.
--   * A row locked by the regulated-profession rule layer can't be relaxed:
--     English can't be marked sufficient, and it applies from day one.
--   * Owner-only RLS: an employer only ever sees their own analyses.
--
-- Nothing here stores job-seeker data: the seeker self-assessment is
-- client-side only and is never shown to an employer.
-- Re-runnable.
-- ============================================================================

create table if not exists public.langfit_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  ad_text text not null default '' check (char_length(ad_text) <= 20000),
  -- Key into the rule table in src/features/langfit/rules.ts; null = not regulated.
  regulated_profession text
    check (regulated_profession in ('health_professional', 'public_authority')),
  locale text not null default 'fi' check (locale in ('fi', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists langfit_analyses_user_idx
  on public.langfit_analyses (user_id, updated_at desc);

create table if not exists public.langfit_tasks (
  id bigint generated always as identity primary key,
  analysis_id uuid not null references public.langfit_analyses(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position smallint not null default 0,
  description text not null check (char_length(description) between 1 and 500),
  language text not null check (language in ('fi', 'sv', 'en')),
  -- CEFR level per skill; null = this skill isn't needed for the task.
  level_listening text check (level_listening in ('A1','A2','B1','B2','C1','C2')),
  level_reading   text check (level_reading   in ('A1','A2','B1','B2','C1','C2')),
  level_speaking  text check (level_speaking  in ('A1','A2','B1','B2','C1','C2')),
  level_writing   text check (level_writing   in ('A1','A2','B1','B2','C1','C2')),
  required_by text not null check (required_by in ('day1', 'm6', 'm12')),
  -- Justification grounds (after Sitra's list) + 'none' when the employer has none.
  rationale_type text not null check (rationale_type in (
    'customer_work', 'patient_safety', 'official_responsibility', 'legislation', 'none'
  )),
  rationale text not null default '' check (char_length(rationale) <= 2000),
  english_sufficient boolean not null default false,
  origin text not null check (origin in ('ai', 'example', 'human', 'rule')),
  validated boolean not null default true check (validated),
  validated_at timestamptz not null default now(),
  locked boolean not null default false,
  constraint langfit_tasks_lock_holds check (
    not locked or (english_sufficient = false and language <> 'en' and required_by = 'day1')
  )
);

create index if not exists langfit_tasks_analysis_idx
  on public.langfit_tasks (analysis_id, position);

-- ----------------------------------------------------------------------------
-- RLS: owner-only. Task rows must also belong to an analysis the caller owns.
-- ----------------------------------------------------------------------------
alter table public.langfit_analyses enable row level security;
alter table public.langfit_tasks    enable row level security;

drop policy if exists "langfit_analyses_own" on public.langfit_analyses;
create policy "langfit_analyses_own" on public.langfit_analyses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "langfit_tasks_own" on public.langfit_tasks;
create policy "langfit_tasks_own" on public.langfit_tasks
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.langfit_analyses a
      where a.id = analysis_id and a.user_id = auth.uid()
    )
  );
