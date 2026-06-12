import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/flags";
import type { Locale, Skill } from "@/lib/esco/types";

/**
 * Map a free-text self-description to candidate ESCO skills.
 *
 * CURRENT IMPLEMENTATION: trigram/ILIKE keyword matching against skill labels
 * and descriptions — no LLM. The function is deliberately the *only* place that
 * knows how text becomes skills, so swapping in an LLM later (embed the text,
 * vector-search skill embeddings, or call a model that returns skill URIs) is a
 * one-file change behind this same signature.
 */
export async function analyzeFreeText(
  text: string,
  locale: Locale,
  limit = 12
): Promise<Skill[]> {
  if (!isSupabaseConfigured()) return [];
  const cleaned = text.trim();
  if (cleaned.length < 8) return [];

  // Extract meaningful keywords (length >= 4), de-duplicated, capped.
  const words = Array.from(
    new Set(
      cleaned
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
        "concept_uri, skill_type, reuse_level, preferred_label_en, preferred_label_fi, description_en, description_fi"
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
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
