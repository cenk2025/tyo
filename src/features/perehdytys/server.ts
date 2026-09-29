import "server-only";
import { getOccupationByCode, getOccupationSkills } from "@/lib/esco/queries";
import { getUnitsForSkills } from "@/lib/education/queries";
import type { Locale, OccupationSkill } from "@/lib/esco/types";
import { chooseUnits, type OnboardingPlan, type PlanSkill } from "./plan";

const MAX_LATER = 8;

const toPlanSkill = (s: OccupationSkill): PlanSkill => ({
  uri: s.conceptUri,
  label: s.label,
  type: s.skillType,
  reuse: s.reuseLevel,
});

const byLabel = (a: PlanSkill, b: PlanSkill) => a.label.localeCompare(b.label);

/**
 * Build the plan for hiring someone from `fromCode` (optional — null means no
 * relevant background) into `toCode`. Returns null when the target role is
 * unknown or has no essential skills to plan against.
 */
export async function buildOnboardingPlan(
  toCode: string,
  fromCode: string | null,
  locale: Locale
): Promise<OnboardingPlan | null> {
  const [to, from] = await Promise.all([
    getOccupationByCode(toCode, locale),
    fromCode ? getOccupationByCode(fromCode, locale) : Promise.resolve(null),
  ]);
  if (!to) return null;

  const [toSkills, fromSkills] = await Promise.all([
    getOccupationSkills(to.conceptUri, locale),
    from ? getOccupationSkills(from.conceptUri, locale) : Promise.resolve([]),
  ]);
  const essential = toSkills.filter((s) => s.relationType === "essential");
  if (essential.length === 0) return null;

  // Any relation in the previous occupation counts as background.
  const has = new Set(fromSkills.map((s) => s.conceptUri));
  const strengths = essential.filter((s) => has.has(s.conceptUri)).map(toPlanSkill).sort(byLabel);
  const gaps = essential.filter((s) => !has.has(s.conceptUri)).map(toPlanSkill);
  const later = toSkills
    .filter((s) => s.relationType === "optional" && !has.has(s.conceptUri))
    .map(toPlanSkill)
    .sort(byLabel)
    .slice(0, MAX_LATER);

  const matches = await getUnitsForSkills(gaps.map((g) => g.uri), locale);
  const { units, uncovered } = chooseUnits(gaps, matches);

  return {
    from,
    to,
    totalEssential: essential.length,
    strengths,
    onTheJob: uncovered.sort(byLabel),
    units,
    later,
  };
}
