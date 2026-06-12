import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/flags";
import type {
  Locale,
  Occupation,
  OccupationSkill,
  Skill,
  RelationType,
} from "./types";

/**
 * ALL ESCO read logic lives in this file. Every query is locale-aware (Finnish
 * label falls back to English when empty) and defensive: if Supabase isn't
 * configured yet, queries return empty results so the UI shows empty states
 * instead of crashing.
 *
 * If the real ESCO column names differ from the assumed schema, this is the
 * only file you need to touch.
 */

const OCC_COLS =
  "concept_uri, code, isco_group, preferred_label_en, preferred_label_fi, alt_labels_en, alt_labels_fi, description_en, description_fi";
const SKILL_COLS =
  "concept_uri, skill_type, reuse_level, preferred_label_en, preferred_label_fi, alt_labels_en, alt_labels_fi, description_en, description_fi";

type Row = Record<string, unknown>;

function pick(row: Row, fi: string, en: string, locale: Locale): string {
  const primary = (locale === "fi" ? row[fi] : row[en]) as string | null;
  const fallback = (locale === "fi" ? row[en] : row[fi]) as string | null;
  return (primary && primary.trim()) || (fallback && fallback.trim()) || "";
}

function pickNullable(
  row: Row,
  fi: string,
  en: string,
  locale: Locale
): string | null {
  const v = pick(row, fi, en, locale);
  return v || null;
}

function toOccupation(row: Row, locale: Locale): Occupation {
  return {
    conceptUri: String(row.concept_uri),
    code: String(row.code ?? ""),
    iscoGroup: (row.isco_group as string) ?? null,
    label: pick(row, "preferred_label_fi", "preferred_label_en", locale),
    description: pickNullable(row, "description_fi", "description_en", locale),
  };
}

function toSkill(row: Row, locale: Locale): Skill {
  return {
    conceptUri: String(row.concept_uri),
    skillType: (row.skill_type as Skill["skillType"]) ?? null,
    reuseLevel: (row.reuse_level as Skill["reuseLevel"]) ?? null,
    label: pick(row, "preferred_label_fi", "preferred_label_en", locale),
    description: pickNullable(row, "description_fi", "description_en", locale),
  };
}

/** Fuzzy occupation search (trigram-backed ILIKE across the locale labels). */
export async function searchOccupations(
  query: string,
  locale: Locale,
  limit = 10
): Promise<Occupation[]> {
  if (!isSupabaseConfigured() || query.trim().length < 2) return [];
  try {
    const supabase = await createClient();
    const q = query.trim().replace(/[%,]/g, " ");
    const { data, error } = await supabase
      .from("occupations")
      .select(OCC_COLS)
      .or(
        `preferred_label_${locale}.ilike.%${q}%,alt_labels_${locale}.ilike.%${q}%`
      )
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => toOccupation(r as Row, locale));
  } catch {
    return [];
  }
}

/** Server-side paginated occupation directory. */
export async function listOccupations(
  locale: Locale,
  page = 1,
  pageSize = 20,
  query = ""
): Promise<{ items: Occupation[]; total: number }> {
  if (!isSupabaseConfigured()) return { items: [], total: 0 };
  try {
    const supabase = await createClient();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let qb = supabase
      .from("occupations")
      .select(OCC_COLS, { count: "exact" })
      .order(`preferred_label_${locale}`, { ascending: true, nullsFirst: false })
      .range(from, to);
    if (query.trim().length >= 2) {
      const q = query.trim().replace(/[%,]/g, " ");
      qb = qb.or(
        `preferred_label_${locale}.ilike.%${q}%,alt_labels_${locale}.ilike.%${q}%`
      );
    }
    const { data, error, count } = await qb;
    if (error) throw error;
    return {
      items: (data ?? []).map((r) => toOccupation(r as Row, locale)),
      total: count ?? 0,
    };
  } catch {
    return { items: [], total: 0 };
  }
}

export async function getOccupationByCode(
  code: string,
  locale: Locale
): Promise<Occupation | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("occupations")
      .select(OCC_COLS)
      .eq("code", code)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toOccupation(data as Row, locale) : null;
  } catch {
    return null;
  }
}

export async function getOccupationByUri(
  uri: string,
  locale: Locale
): Promise<Occupation | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("occupations")
      .select(OCC_COLS)
      .eq("concept_uri", uri)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toOccupation(data as Row, locale) : null;
  } catch {
    return null;
  }
}

/** All skills (essential + optional) required by an occupation. */
export async function getOccupationSkills(
  occupationUri: string,
  locale: Locale
): Promise<OccupationSkill[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("occupation_skill_relations")
      .select(`relation_type, skills:skill_uri (${SKILL_COLS})`)
      .eq("occupation_uri", occupationUri);
    if (error) throw error;
    return (data ?? [])
      .map((row: Row) => {
        const skillRow = (row.skills as Row) ?? null;
        if (!skillRow) return null;
        return {
          ...toSkill(skillRow, locale),
          relationType: (row.relation_type as RelationType) ?? "optional",
        } satisfies OccupationSkill;
      })
      .filter((s): s is OccupationSkill => s !== null && s.label !== "");
  } catch {
    return [];
  }
}

/** Fuzzy skill search for onboarding / "add skill" flows. */
export async function searchSkills(
  query: string,
  locale: Locale,
  limit = 10
): Promise<Skill[]> {
  if (!isSupabaseConfigured() || query.trim().length < 2) return [];
  try {
    const supabase = await createClient();
    const q = query.trim().replace(/[%,]/g, " ");
    const { data, error } = await supabase
      .from("skills")
      .select(SKILL_COLS)
      .or(
        `preferred_label_${locale}.ilike.%${q}%,alt_labels_${locale}.ilike.%${q}%`
      )
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => toSkill(r as Row, locale));
  } catch {
    return [];
  }
}

/** Curated transversal skills grid (onboarding step 2). */
export async function getTransversalSkills(
  locale: Locale,
  limit = 18
): Promise<Skill[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("skills")
      .select(SKILL_COLS)
      .eq("reuse_level", "transversal")
      .order(`preferred_label_${locale}`, { ascending: true, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => toSkill(r as Row, locale));
  } catch {
    return [];
  }
}

export async function getSkillByUri(
  uri: string,
  locale: Locale
): Promise<Skill | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("skills")
      .select(SKILL_COLS)
      .eq("concept_uri", uri)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toSkill(data as Row, locale) : null;
  } catch {
    return null;
  }
}

/** Resolve a list of skill URIs into localized Skill objects (for user profiles). */
export async function getSkillsByUris(
  uris: string[],
  locale: Locale
): Promise<Skill[]> {
  if (!isSupabaseConfigured() || uris.length === 0) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("skills")
      .select(SKILL_COLS)
      .in("concept_uri", uris);
    if (error) throw error;
    return (data ?? []).map((r) => toSkill(r as Row, locale));
  } catch {
    return [];
  }
}

/** Occupations that require a given skill, split by essential/optional. */
export async function getOccupationsForSkill(
  skillUri: string,
  locale: Locale,
  limit = 40
): Promise<{ essential: Occupation[]; optional: Occupation[] }> {
  if (!isSupabaseConfigured()) return { essential: [], optional: [] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("occupation_skill_relations")
      .select(`relation_type, occupations:occupation_uri (${OCC_COLS})`)
      .eq("skill_uri", skillUri)
      .limit(limit);
    if (error) throw error;
    const essential: Occupation[] = [];
    const optional: Occupation[] = [];
    for (const row of (data ?? []) as Row[]) {
      const occRow = row.occupations as Row | null;
      if (!occRow) continue;
      const occ = toOccupation(occRow, locale);
      if (!occ.label) continue;
      if (row.relation_type === "essential") essential.push(occ);
      else optional.push(occ);
    }
    return { essential, optional };
  } catch {
    return { essential: [], optional: [] };
  }
}
