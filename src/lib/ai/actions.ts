"use server";

import { analyzeFreeText } from "./analyze-free-text";
import type { Locale, Skill } from "@/lib/esco/types";

/** Server Action backing the AI-assist free-text panel. */
export async function analyzeFreeTextAction(
  text: string,
  locale: Locale
): Promise<Skill[]> {
  return analyzeFreeText(text, locale);
}
