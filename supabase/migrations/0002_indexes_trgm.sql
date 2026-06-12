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
