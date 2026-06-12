"use server";

import { searchSkills, searchOccupations } from "./queries";
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
