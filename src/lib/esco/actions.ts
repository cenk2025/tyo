"use server";

import { searchSkills, searchOccupations, previewOccupationsForSkills } from "./queries";
import type { Locale, Skill, Occupation } from "./types";

/** Server Actions that back the client-side search-as-you-type comboboxes. */

export async function searchSkillsAction(
  query: string,
  locale: Locale
): Promise<Skill[]> {
  return searchSkills(query, locale, 10);
}

export async function searchOccupationsAction(
  query: string,
  locale: Locale
): Promise<Occupation[]> {
  return searchOccupations(query, locale, 10);
}

/** Backs onboarding's discovery-branch "based on what you picked" panel. */
export async function previewOccupationsForSkillsAction(
  skillUris: string[],
  locale: Locale
): Promise<Occupation[]> {
  return previewOccupationsForSkills(skillUris, locale, 6);
}
