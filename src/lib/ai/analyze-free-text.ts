import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/flags";
import { resolveHybrid } from "./resolve-hybrid";
import type { Locale, Skill } from "@/lib/esco/types";

/**
 * Map a free-text self-description to candidate ESCO skills.
 *
 * No LLM call: resolveHybrid (resolve-hybrid.ts) merges NVIDIA's free-tier
 * embedding similarity with Postgres trigram search directly against the raw
 * description — no Anthropic cost, at any volume. See resolve-hybrid.ts for
 * why both signals are needed and what precision this trades away versus the
 * (still available, just unused here) Claude-grounded resolver in
 * resolve-skills.ts.
 *
 * Falls back to a plain ILIKE keyword search only if resolveHybrid throws
 * unexpectedly — the feature degrades, never errors. The server action
 * contract (`Skill[]`, source 'ai_suggested' on save) is unchanged.
 */
export async function analyzeFreeText(
  text: string,
  locale: Locale,
  limit = 12
): Promise<Skill[]> {
  if (!isSupabaseConfigured()) return [];
  const cleaned = text.trim();
  if (cleaned.length < 8) return [];

  try {
    return await resolveHybrid(cleaned, locale, limit);
  } catch (err) {
    console.error("Hybrid skill resolution failed, using keyword fallback:", err);
    return keywordFallback(cleaned, locale, limit);
  }
}

/**
 * Last-resort heuristic: extract length-≥4 keywords and ILIKE them against
 * skill labels/descriptions. Only reached if resolveHybrid itself throws.
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
