import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/flags";
import { getOccupationByCode, getOccupationSkills } from "@/lib/esco/queries";
import type { Locale, Occupation, OccupationSkill } from "@/lib/esco/types";

/**
 * Piilo-osaajat: other occupations ranked by how many of the target role's
 * essential skills they share (adjacent_occupations RPC, 0021). Compares
 * occupations only — no people, no model call.
 */

export interface AdjacentOccupation {
  code: string;
  iscoGroup: string | null;
  label: string;
  /** Both labels, for the bilingual ad snippet. */
  labelFi: string;
  labelEn: string;
  shared: number;
  total: number;
  sharedUris: string[];
}

export interface HiddenTalentResult {
  target: Occupation;
  essential: OccupationSkill[];
  candidates: AdjacentOccupation[];
}

export async function findHiddenTalent(
  toCode: string,
  includeSameGroup: boolean,
  locale: Locale
): Promise<HiddenTalentResult | null> {
  if (!isSupabaseConfigured()) return null;
  const target = await getOccupationByCode(toCode, locale);
  if (!target) return null;
  const essential = (await getOccupationSkills(target.conceptUri, locale)).filter(
    (s) => s.relationType === "essential"
  );
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("adjacent_occupations", {
      p_occupation_uri: target.conceptUri,
      p_limit: 12,
      p_focused: !includeSameGroup,
    });
    if (error) throw error;
    const candidates = ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const fi = String(r.preferred_label_fi ?? "");
      const en = String(r.preferred_label_en ?? "");
      return {
        code: String(r.code),
        iscoGroup: (r.isco_group as string | null) ?? null,
        label: (locale === "fi" ? fi : en) || fi || en,
        labelFi: fi || en,
        labelEn: en || fi,
        shared: Number(r.shared_count ?? 0),
        total: Number(r.target_count ?? 0),
        sharedUris: (r.shared_skill_uris as string[] | null) ?? [],
      };
    });
    return { target, essential, candidates };
  } catch {
    return { target, essential, candidates: [] };
  }
}

/** The posting sentence inviting applicants from the chosen neighbouring fields. */
export function adSnippet(labels: string[], l: "fi" | "en"): string {
  if (labels.length === 0) return "";
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} ${l === "fi" ? "tai" : "or"} ${labels[labels.length - 1]}`;
  return l === "fi"
    ? `Toivotamme tervetulleiksi hakijat myös muilta aloilta – esimerkiksi taustalla ${list}. Suuri osa tehtävän ydintaidoista on näissä ammateissa jo hallussa, ja perehdytämme loput.`
    : `We also welcome applicants from other fields – for example with a background as ${list}. Many of the role's core skills are already part of these occupations, and we will train the rest.`;
}
