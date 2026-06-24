-- ============================================================================
-- SkillPath — 0006 occupation green share
-- Per-occupation "greenness" score (0–1) from ESCO's greenShareOcc dataset —
-- the fraction of an occupation's work tied to the green economy. Powers the
-- "green field" badge on the occupation detail page.
-- Filled from greenShareOcc_en.csv — see supabase/esco-import/04_green_share.sql.
-- Re-runnable.
-- ============================================================================

alter table public.occupations
  add column if not exists green_share numeric;
