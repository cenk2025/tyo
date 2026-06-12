/** User-data table row shapes (the tables we create via migrations). */

export type SkillSource =
  | "search"
  | "occupation_prefill"
  | "transversal"
  | "ai_suggested";

export type LearningStatus = "planned" | "in_progress" | "done";

export interface UserProfile {
  id: string;
  display_name: string | null;
  current_occupation_uri: string | null;
  locale: string;
  onboarded: boolean;
  created_at: string;
}

export interface UserSkillRow {
  user_id: string;
  skill_uri: string;
  source: SkillSource | null;
  added_at: string;
}

export interface UserTargetRow {
  user_id: string;
  occupation_uri: string;
  added_at: string;
}

export interface UserLearningRow {
  user_id: string;
  skill_uri: string;
  status: LearningStatus;
  added_at: string;
  completed_at: string | null;
}

export interface MatchSnapshotRow {
  id: number;
  user_id: string;
  occupation_uri: string;
  essential_coverage: number;
  optional_coverage: number;
  snapshot_at: string;
}

/** Shape persisted in sessionStorage for guest users before signup. */
export interface GuestProfile {
  currentOccupationUri: string | null;
  skills: { skillUri: string; source: SkillSource }[];
  targets: string[];
}
