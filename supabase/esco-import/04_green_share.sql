-- ============================================================================
-- ESCO import — step 4 (OPTIONAL): occupation green share
-- Fills occupations.green_share from ESCO greenShareOcc_en.csv. Run AFTER
-- migration 0006 created the column.
--
-- greenShareOcc_en.csv (5 cols) has rows at three granularities — we only use
-- the per-OCCUPATION ones (conceptType = 'Occupation'); the ISCO-level
-- aggregate rows are ignored. Header:
--   conceptType,conceptUri,code,preferredLabel,greenShare
-- ============================================================================

-- ── Staging (quoted to the exact CSV header; scratch table) ─────────────────
drop table if exists staging_green_share;

create table staging_green_share (
  "conceptType" text, "conceptUri" text, "code" text,
  "preferredLabel" text, "greenShare" text
);

-- ── Import the CSV into the staging table (Table Editor → Import CSV) ────────
--   greenShareOcc_en.csv → staging_green_share
-- …then run the update below.

-- ── Apply per-occupation green share (idempotent) ───────────────────────────
update public.occupations o
set green_share = nullif(g."greenShare", '')::numeric
from staging_green_share g
where g."conceptType" = 'Occupation'
  and g."conceptUri" = o.concept_uri;

-- ── Sanity check — ~3039 occupations scored; some > 0 are the "green" ones ──
select
  (select count(*) from public.occupations where green_share is not null) as scored,
  (select count(*) from public.occupations where green_share > 0)         as green_gt_0,
  (select round(max(green_share), 3) from public.occupations)             as max_share;

-- ── Optional cleanup once verified ──────────────────────────────────────────
--   drop table staging_green_share;
