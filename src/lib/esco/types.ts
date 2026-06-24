/**
 * ESCO domain types. These mirror the read-only ESCO v1.2.1 tables. If the
 * actual column names in Supabase differ, adjust the SELECT projections in
 * `queries.ts` — the rest of the app depends only on these resolved shapes.
 */

export type Locale = "fi" | "en";

export type SkillType = "skill/competence" | "knowledge";
export type ReuseLevel =
  | "transversal"
  | "cross-sector"
  | "sector-specific"
  | "occupation-specific";
export type RelationType = "essential" | "optional";

/** A skill resolved into the active locale (label/description already coalesced). */
export interface Skill {
  conceptUri: string;
  skillType: SkillType | null;
  reuseLevel: ReuseLevel | null;
  label: string;
  description: string | null;
  /** In the ESCO green-economy skills collection. */
  isGreen: boolean;
  /** In the ESCO digital skills collection. */
  isDigital: boolean;
}

/** An occupation resolved into the active locale. */
export interface Occupation {
  conceptUri: string;
  code: string;
  iscoGroup: string | null;
  label: string;
  description: string | null;
  /** ESCO green-economy share (0–1) for this occupation; null if unscored. */
  greenShare: number | null;
}

/** A skill in the context of an occupation, with whether the user has it. */
export interface OccupationSkill extends Skill {
  relationType: RelationType;
  userHas?: boolean;
}

/** One row of the `match_occupations` RPC result. */
export interface OccupationMatch {
  occupationUri: string;
  code: string;
  iscoGroup: string | null;
  label: string;
  essentialCoverage: number; // 0..1
  optionalCoverage: number; // 0..1
  score: number; // 0..1 weighted
  matchedEssential: number;
  totalEssential: number;
  matchedOptional: number;
  totalOptional: number;
}

/** Raw row shape returned by the Postgres `match_occupations` function (snake_case). */
export interface MatchOccupationsRow {
  occupation_uri: string;
  code: string;
  isco_group: string | null;
  preferred_label_en: string | null;
  preferred_label_fi: string | null;
  essential_coverage: number;
  optional_coverage: number;
  score: number;
  matched_essential: number;
  total_essential: number;
  matched_optional: number;
  total_optional: number;
}
