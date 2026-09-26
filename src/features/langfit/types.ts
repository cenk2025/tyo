/**
 * LangFit domain types. One analysis = one job ad split into concrete tasks;
 * each task carries its own language requirement. Mirrors migration 0019.
 */

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR_LEVELS)[number];
/** null = this skill isn't needed for the task. */
export type Level = Cefr | null;

/** The four areas Kielibuusti's self-assessment and CEFR both measure. */
export const LANG_SKILLS = ["listening", "reading", "speaking", "writing"] as const;
export type LangSkill = (typeof LANG_SKILLS)[number];

export const LANGUAGES = ["fi", "sv", "en"] as const;
export type Lang = (typeof LANGUAGES)[number];

export const REQUIRED_BY = ["day1", "m6", "m12"] as const;
export type RequiredBy = (typeof REQUIRED_BY)[number];

/** Justification grounds, after Sitra's list, plus "none" when there isn't one. */
export const RATIONALE_TYPES = [
  "customer_work",
  "patient_safety",
  "official_responsibility",
  "legislation",
  "none",
] as const;
export type RationaleType = (typeof RATIONALE_TYPES)[number];

/** Where a row came from. Only "rule" rows can be locked. */
export type TaskOrigin = "ai" | "example" | "human" | "rule";

export interface LangTask {
  /** Client-side id; not the DB identity. */
  id: string;
  description: string;
  language: Lang;
  levels: Record<LangSkill, Level>;
  requiredBy: RequiredBy;
  rationaleType: RationaleType;
  rationale: string;
  /**
   * English is an acceptable alternative for this task: the Finnish/Swedish
   * level is then an advantage, not a requirement.
   */
  englishSufficient: boolean;
  origin: TaskOrigin;
  /** Employer has reviewed and approved the row ("validoitu"). */
  validated: boolean;
  /** Set by the regulated-profession rule layer; see rules.ts. */
  locked: boolean;
}

export type RegulatedKey = "health_professional" | "public_authority";

export interface LangfitDraft {
  title: string;
  adText: string;
  regulated: RegulatedKey | null;
  tasks: LangTask[];
}

export interface SavedAnalysisSummary {
  id: string;
  title: string;
  updatedAt: string;
  taskCount: number;
}

export function levelRank(level: Level): number {
  return level ? CEFR_LEVELS.indexOf(level) + 1 : 0;
}

export function maxLevel(levels: Level[]): Level {
  let best: Level = null;
  for (const l of levels) if (levelRank(l) > levelRank(best)) best = l;
  return best;
}

export function newTaskId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function emptyLevels(): Record<LangSkill, Level> {
  return { listening: null, reading: null, speaking: null, writing: null };
}
