import type { Occupation, ReuseLevel, SkillType } from "@/lib/esco/types";
import type { EducationProgram } from "@/lib/education/types";
import type { SkillUnitMatch } from "@/lib/education/queries";

/**
 * Perehdytyspolku: the gap between a new hire's previous occupation and the
 * role they are hired into, laid out as an onboarding plan. Pure logic — the
 * inputs come from ESCO relations and the units_for_skills RPC, no model call.
 * It compares two OCCUPATIONS; it never assesses a person.
 */

export interface PlanSkill {
  uri: string;
  label: string;
  type: SkillType | null;
  reuse: ReuseLevel | null;
}

export interface PlanUnit {
  key: string;
  program: EducationProgram;
  osaId: number;
  title: string;
  skills: PlanSkill[];
}

export interface OnboardingPlan {
  from: Occupation | null;
  to: Occupation;
  totalEssential: number;
  /** Essential skills of the new role the previous occupation already covers. */
  strengths: PlanSkill[];
  /** Essential gaps no tutkinnon osa covers: learned at the workplace. */
  onTheJob: PlanSkill[];
  /** Units chosen to cover the remaining essential gaps, fewest first. */
  units: PlanUnit[];
  /** Optional skills of the new role that are still missing (capped). */
  later: PlanSkill[];
}

const MAX_UNITS = 6;

/**
 * Greedy set cover: repeatedly take the unit that teaches the most still
 * uncovered gaps, preferring a qualification already in the plan on ties so
 * the units cluster into as few qualifications as possible.
 */
export function chooseUnits(gaps: PlanSkill[], matches: SkillUnitMatch[]): { units: PlanUnit[]; uncovered: PlanSkill[] } {
  const bySkill = new Map(gaps.map((g) => [g.uri, g]));
  const candidates = new Map<string, { match: SkillUnitMatch; skills: Map<string, number> }>();
  for (const m of matches) {
    if (!bySkill.has(m.skillUri)) continue;
    const key = `${m.program.id}:${m.osaId}`;
    const c = candidates.get(key) ?? { match: m, skills: new Map<string, number>() };
    c.skills.set(m.skillUri, Math.max(c.skills.get(m.skillUri) ?? 0, m.similarity));
    candidates.set(key, c);
  }

  const uncovered = new Set(bySkill.keys());
  const chosenPrograms = new Set<number>();
  const units: PlanUnit[] = [];
  while (uncovered.size > 0 && units.length < MAX_UNITS) {
    let best: { key: string; gain: string[]; sim: number; sameProgram: boolean } | null = null;
    for (const [key, c] of candidates) {
      const gain = Array.from(c.skills.keys()).filter((u) => uncovered.has(u));
      if (gain.length === 0) continue;
      const sim = gain.reduce((a, u) => a + (c.skills.get(u) ?? 0), 0) / gain.length;
      const sameProgram = chosenPrograms.has(c.match.program.id);
      const better =
        !best ||
        gain.length > best.gain.length ||
        (gain.length === best.gain.length && sameProgram && !best.sameProgram) ||
        (gain.length === best.gain.length && sameProgram === best.sameProgram && sim > best.sim);
      if (better) best = { key, gain, sim, sameProgram };
    }
    if (!best) break;
    const c = candidates.get(best.key)!;
    candidates.delete(best.key);
    best.gain.forEach((u) => uncovered.delete(u));
    chosenPrograms.add(c.match.program.id);
    units.push({
      key: best.key,
      program: c.match.program,
      osaId: c.match.osaId,
      title: c.match.unitTitle,
      skills: best.gain.map((u) => bySkill.get(u)!),
    });
  }
  // Group units of the same qualification together for reading.
  const order = Array.from(new Set(units.map((u) => u.program.id)));
  units.sort((a, b) => order.indexOf(a.program.id) - order.indexOf(b.program.id));
  return { units, uncovered: gaps.filter((g) => uncovered.has(g.uri)) };
}
