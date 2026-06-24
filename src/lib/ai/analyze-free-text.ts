import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, isAiConfigured } from "@/lib/flags";
import { searchSkills } from "@/lib/esco/queries";
import { extractSkillPhrases } from "./extract-skills";
import type { Locale, Skill } from "@/lib/esco/types";

/**
 * Map a free-text self-description to candidate ESCO skills.
 *
 * Two-stage, ESCO-as-invisible-engine design:
 *   1. Claude turns the messy free text into canonical skill PHRASES
 *      (extract-skills.ts) — the model never sees or invents ESCO URIs.
 *   2. Each phrase is fuzzy-matched against the `skills` table, so every
 *      returned skill is a real ESCO row the rest of the app already knows.
 *
 * Falls back to the original trigram keyword heuristic when no Anthropic key is
 * configured or the model call fails — the feature degrades, never errors. The
 * server action contract (`Skill[]`, source 'ai_suggested' on save) is unchanged.
 */
export async function analyzeFreeText(
  text: string,
  locale: Locale,
  limit = 12
): Promise<Skill[]> {
  if (!isSupabaseConfigured()) return [];
  const cleaned = text.trim();
  if (cleaned.length < 8) return [];

  if (isAiConfigured()) {
    try {
      const phrases = await extractSkillPhrases(cleaned, locale, limit);
      if (phrases.length > 0) {
        return await resolvePhrases(phrases, locale, limit);
      }
      // AI ran but found nothing → no suggestions (don't fall back to noise).
      return [];
    } catch (err) {
      console.error("AI skill extraction failed, using keyword fallback:", err);
      // fall through to the heuristic below
    }
  }

  return keywordFallback(cleaned, locale, limit);
}

/**
 * Resolve canonical skill phrases to real ESCO skills. Searches the DB per
 * phrase (top few each), preserving phrase order and de-duplicating by URI.
 */
async function resolvePhrases(
  phrases: string[],
  locale: Locale,
  limit: number
): Promise<Skill[]> {
  const perPhrase = await Promise.all(
    phrases.map((p) => searchSkills(p, locale, 3))
  );

  const seen = new Set<string>();
  const out: Skill[] = [];
  // Take the best hit from each phrase first, then widen to second/third hits.
  for (let rank = 0; rank < 3 && out.length < limit; rank++) {
    for (const hits of perPhrase) {
      const skill = hits[rank];
      if (!skill || seen.has(skill.conceptUri)) continue;
      seen.add(skill.conceptUri);
      out.push(skill);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Original heuristic: extract length-≥4 keywords and ILIKE them against skill
 * labels/descriptions. Used when the LLM is unavailable or errors.
 */
async function keywordFallback(
  text: string,
  locale: Locale,
  limit: number
): Promise<Skill[]> {
  const words = Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4)
    )
  ).slice(0, 10);
  if (words.length === 0) return [];

  try {
    const supabase = await createClient();
    const labelCol = `preferred_label_${locale}`;
    const descCol = `description_${locale}`;
    const orFilter = words
      .map((w) => `${labelCol}.ilike.%${w}%,${descCol}.ilike.%${w}%`)
      .join(",");

    const { data, error } = await supabase
      .from("skills")
      .select(
        "concept_uri, skill_type, reuse_level, preferred_label_en, preferred_label_fi, description_en, description_fi, is_green, is_digital"
      )
      .or(orFilter)
      .limit(limit * 2);
    if (error) throw error;

    const seen = new Set<string>();
    const out: Skill[] = [];
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const uri = String(row.concept_uri);
      if (seen.has(uri)) continue;
      seen.add(uri);
      const label =
        (locale === "fi" ? row.preferred_label_fi : row.preferred_label_en) ||
        (locale === "fi" ? row.preferred_label_en : row.preferred_label_fi);
      if (!label) continue;
      out.push({
        conceptUri: uri,
        skillType: (row.skill_type as Skill["skillType"]) ?? null,
        reuseLevel: (row.reuse_level as Skill["reuseLevel"]) ?? null,
        label: String(label),
        description:
          ((locale === "fi" ? row.description_fi : row.description_en) as string) ??
          null,
        isGreen: Boolean(row.is_green),
        isDigital: Boolean(row.is_digital),
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
