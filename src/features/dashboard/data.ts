import "server-only";
import {
  getUserSkills,
  getUserTargetOccupations,
  getMatchSnapshots,
  getUserSkillUris,
  type UserSkill,
} from "@/lib/db/queries";
import { getOccupationMatches } from "@/features/matching/server";
import { getOccupationSkills } from "@/lib/esco/queries";
import type { Locale, Occupation, OccupationMatch } from "@/lib/esco/types";
import type { ReuseLevel } from "@/lib/esco/types";

const REUSE_LEVELS: ReuseLevel[] = [
  "transversal",
  "cross-sector",
  "sector-specific",
  "occupation-specific",
];

export interface DashboardData {
  skills: UserSkill[];
  matches: OccupationMatch[];
  targets: Occupation[];
  /** Radar: axes = reuse levels (skill groups proxy), one value per target. */
  radar: { rows: Record<string, string | number>[]; targetLabels: string[] };
  /** Line: x = date, one series per target, value = match score %. */
  gap: { rows: Record<string, string | number>[]; series: string[] };
}

/**
 * Assemble everything the dashboard needs in one place. Chart math (coverage,
 * scoring) is derived here so widgets stay presentational.
 *
 * Note: ESCO has no skill→ISCO mapping table, so the radar uses skill
 * `reuse_level` as its "skill group" axis — a meaningful broad-vs-specific view.
 */
export async function getDashboardData(
  userId: string,
  locale: Locale
): Promise<DashboardData> {
  const [skills, matches, targets, snapshots, userSkillUris] = await Promise.all([
    getUserSkills(userId, locale),
    getOccupationMatches(userId, locale),
    getUserTargetOccupations(userId, locale),
    getMatchSnapshots(userId),
    getUserSkillUris(userId),
  ]);

  const userSet = new Set(userSkillUris);

  // --- Radar: coverage per reuse level for each target ---
  const targetSkillSets = await Promise.all(
    targets.map((o) => getOccupationSkills(o.conceptUri, locale))
  );
  const targetLabels = targets.map((o) => o.label);

  const radarRows = REUSE_LEVELS.map((level) => {
    const row: Record<string, string | number> = { group: level };
    targets.forEach((occ, i) => {
      const essential = targetSkillSets[i].filter(
        (s) => s.relationType === "essential" && s.reuseLevel === level
      );
      const have = essential.filter((s) => userSet.has(s.conceptUri)).length;
      row[occ.label] = essential.length ? Math.round((have / essential.length) * 100) : 0;
    });
    return row;
  });

  // --- Gap over time from snapshots (only for current targets) ---
  const targetByUri = new Map(targets.map((o) => [o.conceptUri, o.label]));
  const byDate = new Map<string, Record<string, string | number>>();
  for (const snap of snapshots) {
    const label = targetByUri.get(snap.occupation_uri);
    if (!label) continue;
    const date = new Date(snap.snapshot_at).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
    });
    const score =
      Math.round(
        (0.7 * Number(snap.essential_coverage) +
          0.3 * Number(snap.optional_coverage)) *
          100
      ) || 0;
    const existing = byDate.get(date) ?? { date };
    existing[label] = score; // later snapshot in the same day wins
    byDate.set(date, existing);
  }

  return {
    skills,
    matches,
    targets,
    radar: { rows: radarRows, targetLabels },
    gap: { rows: [...byDate.values()], series: targetLabels },
  };
}
