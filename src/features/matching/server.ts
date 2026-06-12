import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/flags";
import type {
  Locale,
  MatchOccupationsRow,
  OccupationMatch,
} from "@/lib/esco/types";

/**
 * Thin typed wrapper over the `match_occupations` Postgres RPC. The scoring math
 * (essential 0.7 / optional 0.3) lives in SQL — never recompute it here.
 */
export async function getOccupationMatches(
  userId: string,
  locale: Locale
): Promise<OccupationMatch[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("match_occupations", {
      p_user_id: userId,
    });
    if (error) throw error;
    return ((data ?? []) as MatchOccupationsRow[]).map((r) =>
      mapRow(r, locale)
    );
  } catch {
    return [];
  }
}

function mapRow(r: MatchOccupationsRow, locale: Locale): OccupationMatch {
  const label =
    (locale === "fi" ? r.preferred_label_fi : r.preferred_label_en) ||
    (locale === "fi" ? r.preferred_label_en : r.preferred_label_fi) ||
    r.code;
  return {
    occupationUri: r.occupation_uri,
    code: r.code,
    iscoGroup: r.isco_group,
    label,
    essentialCoverage: Number(r.essential_coverage) || 0,
    optionalCoverage: Number(r.optional_coverage) || 0,
    score: Number(r.score) || 0,
    matchedEssential: Number(r.matched_essential) || 0,
    totalEssential: Number(r.total_essential) || 0,
    matchedOptional: Number(r.matched_optional) || 0,
    totalOptional: Number(r.total_optional) || 0,
  };
}
